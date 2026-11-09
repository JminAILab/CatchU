import { Module } from '@nestjs/common';
import { FILE_STORAGE, type FileStorage } from './file-storage';
import { readFileStorageConfig } from './file-storage.config';
import { LocalFileStorage, UnavailableFileStorage } from './local-file-storage';

/** 설정에 따라 FileStorage를 고른다(C-05). 값이 있는데 틀리면 여기서 던져 기동을 멈춘다. */
export function createFileStorage(env: NodeJS.ProcessEnv = process.env): FileStorage {
  const config = readFileStorageConfig(env);
  return config === null ? new UnavailableFileStorage() : new LocalFileStorage(config.root);
}

/** 소비 Unit(U2 탈퇴·U4·U8)은 imports에 넣고 `@Inject(FILE_STORAGE)`로 받는다. */
@Module({ providers: [{ provide: FILE_STORAGE, useFactory: () => createFileStorage() }], exports: [FILE_STORAGE] })
export class FileStorageModule {}
