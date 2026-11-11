// 파일 저장 인터페이스·키·오류(계약 C-05, U2 기능 설계 W6·BR6.2·BR6.3, 비기능 NFR1.3).
// 로컬 구현은 local-file-storage.ts, S3 구현은 s3-file-storage.ts(U8)다. presigned URL은 없고 호출자가 권한을 확인한 뒤 읽어 내려 준다.
import type { Readable } from 'node:stream';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** 없으면 FileNotFound. */
  get(key: string): Promise<Readable>;
  copy(fromKey: string, toKey: string): Promise<void>;
  /** 없는 접두어는 성공. */
  deletePrefix(prefix: string): Promise<void>;
  /** 없는 키는 성공. */
  delete(key: string): Promise<void>;
}

/** 없는 키를 읽었다(C-05). 메시지에 키를 넣지 않는다. */
export class FileNotFound extends Error {
  override readonly name = 'FileNotFound';

  constructor() {
    super('파일이 없습니다.');
  }
}

export type StorageUnavailableReason = 'NOT_CONFIGURED' | 'IO_FAILED' | 'OUTSIDE_ROOT';

/** 저장소를 쓸 수 없다(C-05). 재시도 없이 호출자가 실패로 처리한다. 메시지에 경로·키를 넣지 않는다. */
export class StorageUnavailable extends Error {
  override readonly name = 'StorageUnavailable';

  constructor(readonly reason: StorageUnavailableReason, options?: { cause?: unknown }) {
    super(`파일 저장소를 쓸 수 없습니다(${reason}).`, options);
  }
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * 저장 실패를 로그에 남길 때 쓰는 두 칸(#521 리뷰). `StorageUnavailable`이라는 이름만으로는 설정 누락·권한·네트워크를
 * 가릴 수 없어, 저장소 사유(`reason`)와 원인 오류의 이름을 함께 남긴다.
 * 원인은 **이름만** 싣는다. 오류 문구·경로·요청 정보에는 키·버킷·로컬 경로가 들어갈 수 있어 읽지 않는다.
 * 이름이 그냥 `Error`이면 Node 파일 오류의 `code`(예: `EACCES`)를 쓴다. 이름이 글자·숫자·밑줄이 아니면 버린다.
 */
export function storageFailureFields(error: unknown): { storageReason: StorageUnavailableReason | null; cause: string | null } {
  if (!(error instanceof StorageUnavailable)) return { storageReason: null, cause: null };
  const cause: unknown = error.cause;
  if (cause === undefined || cause === null || typeof cause !== 'object') return { storageReason: error.reason, cause: null };
  const { name, code } = cause as { name?: unknown; code?: unknown };
  const picked = typeof name === 'string' && name !== 'Error' ? name : code;
  return { storageReason: error.reason, cause: typeof picked === 'string' && SAFE_NAME.test(picked) ? picked : null };
}

/** 계약의 키 배치가 아닌 키·접두어(호출자 버그, BR6.2). 파일을 건드리지 않는다. */
export class InvalidStorageKey extends Error {
  override readonly name = 'InvalidStorageKey';

  constructor() {
    super('파일 저장 키 형식이 맞지 않습니다.');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: string): string {
  if (!UUID.test(value)) throw new InvalidStorageKey();
  return value;
}

// 계약 C-05 keys. 이 함수로만 키를 만든다.
export const memberPrefix = (memberId: string): string => `members/${requireUuid(memberId)}/`;
export const materialKey = (memberId: string, pdfMaterialId: string): string =>
  `${memberPrefix(memberId)}materials/${requireUuid(pdfMaterialId)}.pdf`;
export const publicationPrefix = (memberId: string, publicationId: string): string =>
  `${memberPrefix(memberId)}publications/${requireUuid(publicationId)}/`;
export const publishedPdfKey = (memberId: string, publicationId: string, publishedItemId: string): string =>
  `${publicationPrefix(memberId, publicationId)}${requireUuid(publishedItemId)}.pdf`;

/** 마디 하나: 영문·숫자·. _ - 만, 점만으로 된 마디(., ..)는 안 된다. */
const SEGMENT = /^(?!\.+$)[A-Za-z0-9._-]{1,128}$/;

/**
 * 키(끝이 / 아님)나 접두어(끝이 /)를 마디로 나눠 검사한다(BR6.2). "members/{uuid}/"로 시작해야 하고
 * ..·빈 마디·역슬래시·절대 경로·허용 밖 글자가 있으면 InvalidStorageKey.
 */
export function parseStorageKey(value: unknown, kind: 'KEY' | 'PREFIX'): string[] {
  if (typeof value !== 'string' || value.length > 1024 || value.includes('\\') || value.startsWith('/')) throw new InvalidStorageKey();
  const endsWithSlash = value.endsWith('/');
  if ((kind === 'PREFIX') !== endsWithSlash) throw new InvalidStorageKey();
  const segments = (endsWithSlash ? value.slice(0, -1) : value).split('/');
  if (segments.length < 2 || segments[0] !== 'members' || !UUID.test(segments[1])) throw new InvalidStorageKey();
  if (kind === 'KEY' && segments.length < 3) throw new InvalidStorageKey();
  if (!segments.every((segment) => SEGMENT.test(segment))) throw new InvalidStorageKey();
  return segments;
}
