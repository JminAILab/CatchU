// 파일 저장 설정(U2 비기능 보안 설계 「설계 변경: 파일 저장 설정 검사 시점」, 코드 생성 결정 1, 기능 설계 BR6.1의 바뀐 기준, U8 BR7.3).
// 세 값(FILE_STORAGE_DRIVER·FILE_STORAGE_LOCAL_ROOT·FILE_STORAGE_S3_BUCKET)이 모두 없거나 빈 문자열이면 "없음":
// api는 기동하고 FileStorage의 모든 호출이 StorageUnavailable이다.
// 값이 있으면 기동 때 검사하고 틀리면 기동을 멈춘다. 판정할 수 없으면 허용하지 않는다(보안 점검 「설정·개발용 기능」).
// 드라이버마다 자기 값만 받는다: local은 LOCAL_ROOT(필수)와 빈 S3_BUCKET, s3는 S3_BUCKET(필수)과 빈 LOCAL_ROOT.
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export type FileStorageConfig =
  | { readonly driver: 'local'; readonly root: string }
  | { readonly driver: 's3'; readonly bucket: string };

class FileStorageConfigError extends Error {
  override readonly name = 'FileStorageConfigError';
}

/** S3 버킷 이름의 최소 모양: 3~63자, 소문자·숫자·.·-, 영숫자로 시작·끝. 실제 존재 여부는 첫 호출 때 드러난다. */
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** 오류 문구에 경로·버킷 값을 넣지 않는다(설정 이름만). */
export function readFileStorageConfig(env: NodeJS.ProcessEnv = process.env): FileStorageConfig | null {
  const driver = env.FILE_STORAGE_DRIVER ?? '';
  const root = env.FILE_STORAGE_LOCAL_ROOT ?? '';
  const bucket = env.FILE_STORAGE_S3_BUCKET ?? '';
  if (driver === '' && root === '' && bucket === '') return null;
  if (driver === '') {
    throw new FileStorageConfigError(
      'FILE_STORAGE_DRIVER 없이 FILE_STORAGE_LOCAL_ROOT나 FILE_STORAGE_S3_BUCKET만 넣을 수 없습니다. 드라이버와 그 드라이버의 값을 둘 다 넣거나 둘 다 비워야 합니다.',
    );
  }
  if (driver === 'local') return readLocalConfig(root, bucket);
  if (driver === 's3') return readS3Config(bucket, root);
  throw new FileStorageConfigError('FILE_STORAGE_DRIVER는 local 또는 s3여야 합니다.');
}

function readLocalConfig(root: string, bucket: string): FileStorageConfig {
  if (root === '') {
    throw new FileStorageConfigError('FILE_STORAGE_DRIVER=local에는 FILE_STORAGE_LOCAL_ROOT가 필요합니다. 둘 다 넣거나 둘 다 비워야 합니다.');
  }
  if (bucket !== '') throw new FileStorageConfigError('FILE_STORAGE_DRIVER=local에서는 FILE_STORAGE_S3_BUCKET을 비워야 합니다.');
  if (!isAbsolute(root)) throw new FileStorageConfigError('FILE_STORAGE_LOCAL_ROOT는 절대 경로여야 합니다.');
  let isDirectory: boolean;
  try {
    isDirectory = statSync(root).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) throw new FileStorageConfigError('FILE_STORAGE_LOCAL_ROOT가 가리키는 폴더가 없습니다.');
  return Object.freeze({ driver: 'local', root });
}

function readS3Config(bucket: string, root: string): FileStorageConfig {
  if (bucket === '') {
    throw new FileStorageConfigError('FILE_STORAGE_DRIVER=s3에는 FILE_STORAGE_S3_BUCKET이 필요합니다. 둘 다 넣거나 둘 다 비워야 합니다.');
  }
  if (root !== '') throw new FileStorageConfigError('FILE_STORAGE_DRIVER=s3에서는 FILE_STORAGE_LOCAL_ROOT를 비워야 합니다.');
  if (!BUCKET_NAME.test(bucket)) {
    throw new FileStorageConfigError('FILE_STORAGE_S3_BUCKET이 S3 버킷 이름 모양(3~63자, 소문자·숫자·.·-, 영숫자로 시작·끝)이 아닙니다.');
  }
  return Object.freeze({ driver: 's3', bucket });
}
