// S3 파일 저장(계약 C-05 S3 구현, U8 기능 설계 BR7.3, 비기능 NFR1.7·NFR4.8·NFR4.11·NFR4.15, 기술 선택 「파일 저장(api)」).
// 자격·지역은 AWS SDK 기본 설정(api 역할의 기본 자격 체인)이며 코드에 자격이 없다. 요청 시간 제한과 시도 횟수만 아래 상수로 정한다(#420).
// presigned URL은 만들지 않는다. 오류 메시지·예외에 버킷·키 값을 넣지 않고 직접 로그도 남기지 않는다(호출자가 처리).
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { type FileStorage, FileNotFound, parseStorageKey, StorageUnavailable } from './file-storage';

/** 시험에서 가짜 클라이언트를 넣을 수 있는 최소 모양. 실제로는 S3Client다. */
export type S3ClientLike = Pick<S3Client, 'send'>;

/**
 * S3 요청 한 번의 시간 제한과 시도 횟수(#420, 팀장 결정 2026-11-17의 시작 값, worker의 S3 읽기와 같은 수준).
 *
 * - `connectionTimeoutMs`: 연결이 이 시간 안에 맺어지지 않으면 그 시도를 끊는다.
 * - `socketTimeoutMs`: 연결된 소켓에 이 시간 동안 오가는 바이트가 없으면 그 시도를 끊는다. 유휴 시간이지 요청 전체 시간이 아니다.
 *   바이트가 조금씩이라도 오가면 다시 세므로, 느리게 이어지는 요청은 이 값보다 오래 걸릴 수 있다.
 * - `maxAttempts`: 첫 시도를 포함한 총 횟수다(다시 시도는 1회). 끊긴 시도(`TimeoutError`)는 SDK가 다시 시도할 오류로 본다.
 *
 * 응답이 없는 S3에서는 호출 하나가 대략 「유휴 제한 × 시도 횟수 + 시도 사이 대기」 뒤에 실패한다. 요청 전체 시간의 상한은 두지 않았다
 * (SDK의 `requestTimeout`은 `throwOnRequestTimeout` 없이는 경고만 남긴다. `@smithy/node-http-handler` 4.14.2에서 확인).
 * 주소 찾기(DNS)·자격 받기는 이 제한 밖이다.
 */
export const S3_REQUEST_LIMITS = Object.freeze({ connectionTimeoutMs: 5_000, socketTimeoutMs: 15_000, maxAttempts: 2 });
export type S3RequestLimits = Readonly<{ connectionTimeoutMs: number; socketTimeoutMs: number; maxAttempts: number }>;

/**
 * 시간 제한과 시도 횟수를 넣은 S3 클라이언트를 만든다. 실제 실행은 인자 없이 부른다(자격·지역은 SDK 기본 설정).
 * `config`·`limits`는 시험이 로컬 대역 주소와 짧은 제한을 넣는 자리다.
 */
export function createS3Client(config: S3ClientConfig = {}, limits: S3RequestLimits = S3_REQUEST_LIMITS): S3Client {
  return new S3Client({
    ...config,
    maxAttempts: limits.maxAttempts,
    requestHandler: { connectionTimeout: limits.connectionTimeoutMs, socketTimeout: limits.socketTimeoutMs },
  });
}

/** DeleteObjects가 한 번에 받는 최대 키 수(S3 제한). */
const DELETE_BATCH_SIZE = 1000;

/**
 * 없는 객체 응답은 SDK 오류 이름 NoSuchKey뿐이다. NoSuchBucket처럼 같은 404라도 이름이 다른 오류와 이름 없는 404는
 * 저장소 오류라서 없음·성공으로 바꾸지 않고 StorageUnavailable(IO_FAILED)로 둔다(계획 4.1 보완).
 */
function isMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { name?: unknown }).name === 'NoSuchKey';
}

/** 키 모양 검사를 통과한 마디만 S3 Key로 쓴다(BR6.2·NFR1.7). 마디 글자는 영문·숫자·. _ - 뿐이라 CopySource에도 그대로 쓸 수 있다. */
const objectKey = (key: string): string => parseStorageKey(key, 'KEY').join('/');
const objectPrefix = (prefix: string): string => `${parseStorageKey(prefix, 'PREFIX').join('/')}/`;

export class S3FileStorage implements FileStorage {
  private readonly client: S3ClientLike;

  /** bucket은 설정 검사(file-storage.config.ts)를 통과한 이름이다. client를 주지 않으면 createS3Client()로 만든다(네트워크 접속은 첫 호출 때). */
  constructor(private readonly bucket: string, client?: S3ClientLike) {
    this.client = client ?? createS3Client();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!Buffer.isBuffer(body) || typeof contentType !== 'string') throw new TypeError('put에는 Buffer와 contentType이 필요합니다.');
    const Key = objectKey(key);
    await this.call(() => this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key, Body: body, ContentType: contentType })), false);
  }

  async get(key: string): Promise<Readable> {
    const Key = objectKey(key);
    const output = await this.call(() => this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key })), true);
    // Node 런타임의 Body는 Readable이다. 다른 모양이면 읽어 내려 줄 수 없으니 장애로 끝낸다.
    if (!(output.Body instanceof Readable)) throw new StorageUnavailable('IO_FAILED');
    return output.Body;
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const source = objectKey(fromKey);
    const Key = objectKey(toKey);
    await this.call(() => this.client.send(new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${source}`, Key })), true);
  }

  /** 없는 키도 성공이다(S3는 없는 키의 DeleteObject에 오류를 내지 않지만, NoSuchKey를 내더라도 성공으로 본다). NoSuchBucket 등은 장애다. */
  async delete(key: string): Promise<void> {
    const Key = objectKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }));
    } catch (error) {
      if (isMissing(error)) return;
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
  }

  /**
   * ListObjectsV2를 끝까지 넘기며 1,000개 단위로 DeleteObjects한다. 객체가 없으면 삭제 호출 없이 성공이다.
   * deletePrefix 방어 3건(계획 4.1): 요청 접두어 밖 키가 목록에 오면 삭제 없이 IO_FAILED, DeleteObjects 응답 Errors는 IO_FAILED,
   * IsTruncated인데 다음 토큰이 없으면 IO_FAILED. 조용한 부분 성공을 막는다.
   */
  async deletePrefix(prefix: string): Promise<void> {
    const Prefix = objectPrefix(prefix);
    let ContinuationToken: string | undefined;
    do {
      const page = await this.call(() => this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix, ContinuationToken })), false);
      const keys = (page.Contents ?? []).map((object) => object.Key).filter((key): key is string => typeof key === 'string');
      // 요청한 접두어 밖의 키가 돌아오면 지우지 않고 장애로 끝낸다(다른 회원 파일 보호).
      if (keys.some((key) => !key.startsWith(Prefix))) throw new StorageUnavailable('IO_FAILED');
      for (let start = 0; start < keys.length; start += DELETE_BATCH_SIZE) {
        await this.deleteBatch(keys.slice(start, start + DELETE_BATCH_SIZE));
      }
      if (page.IsTruncated === true && typeof page.NextContinuationToken !== 'string') throw new StorageUnavailable('IO_FAILED');
      ContinuationToken = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (ContinuationToken !== undefined);
  }

  private async deleteBatch(keys: string[]): Promise<void> {
    const output = await this.call(() => this.client.send(new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    })), false);
    // Quiet 모드에서는 실패한 키만 Errors로 온다. 하나라도 있으면 접두어 삭제는 끝나지 않은 것이다.
    if (output.Errors !== undefined && output.Errors.length > 0) throw new StorageUnavailable('IO_FAILED');
  }

  /**
   * SDK 호출 하나를 감싼다. 다시 시도는 SDK가 S3_REQUEST_LIMITS의 횟수 안에서 하고 여기서는 더 하지 않는다(NFR4.8·NFR4.15).
   * 없는 객체(NoSuchKey)는 missingIsNotFound가 참일 때만 FileNotFound, 그 밖 오류(NoSuchBucket 등 404 포함)는 StorageUnavailable(IO_FAILED)이다.
   */
  private async call<T>(operation: () => Promise<T>, missingIsNotFound: boolean): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (missingIsNotFound && isMissing(error)) throw new FileNotFound();
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
  }
}
