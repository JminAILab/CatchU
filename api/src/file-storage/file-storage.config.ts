// 파일 저장 설정(U2 비기능 보안 설계 「설계 변경: 파일 저장 설정 검사 시점」, 코드 생성 결정 1, 기능 설계 BR6.1의 바뀐 기준).
// 두 값이 모두 없거나 빈 문자열이면 "없음": api는 기동하고 FileStorage의 모든 호출이 StorageUnavailable이다.
// 값이 있으면 기동 때 검사하고 틀리면 기동을 멈춘다. 판정할 수 없으면 허용하지 않는다(보안 점검 「설정·개발용 기능」).
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export interface FileStorageConfig {
  readonly driver: 'local';
  readonly root: string;
}

class FileStorageConfigError extends Error {
  override readonly name = 'FileStorageConfigError';
}

/** 오류 문구에 경로 값을 넣지 않는다(설정 이름만). */
export function readFileStorageConfig(env: NodeJS.ProcessEnv = process.env): FileStorageConfig | null {
  const driver = env.FILE_STORAGE_DRIVER ?? '';
  const root = env.FILE_STORAGE_LOCAL_ROOT ?? '';
  if (driver === '' && root === '') return null;
  if (driver === '' || root === '') {
    throw new FileStorageConfigError('FILE_STORAGE_DRIVER와 FILE_STORAGE_LOCAL_ROOT는 둘 다 넣거나 둘 다 비워야 합니다.');
  }
  // s3 구현은 U8이 더한다. 그 전에는 모르는 드라이버다.
  if (driver !== 'local') throw new FileStorageConfigError('FILE_STORAGE_DRIVER는 local이어야 합니다.');
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
