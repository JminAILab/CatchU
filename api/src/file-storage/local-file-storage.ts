// 로컬 파일 저장(계약 C-05 로컬 구현, U2 기능 설계 BR6.2~BR6.4, 비기능 NFR1.3·NFR4.10).
// api 한 대(개발 서버 EC2) 기준이다. 여러 api가 뜨는 EKS에서 파일이 필요해지면(U8) S3 드라이버로 바꾼다.
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { copyFile, lstat, mkdir, open, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { type FileStorage, FileNotFound, parseStorageKey, StorageUnavailable } from './file-storage';

const errorCode = (error: unknown): unknown => (error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined);

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  /** root는 설정 검사(file-storage.config.ts)를 통과한 절대 경로다. 심볼릭 링크를 푼 실제 경로를 뿌리로 쓴다. */
  constructor(root: string) {
    this.root = realpathSync(root);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!Buffer.isBuffer(body) || typeof contentType !== 'string') throw new TypeError('put에는 Buffer와 contentType이 필요합니다.');
    const target = await this.resolve(parseStorageKey(key, 'KEY'));
    await this.writeAtomically(target, (temporary) => writeFile(temporary, body, { flag: 'wx' }));
  }

  async get(key: string): Promise<Readable> {
    const target = await this.resolve(parseStorageKey(key, 'KEY'));
    let handle;
    try {
      handle = await open(target, 'r');
    } catch (error) {
      if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') throw new FileNotFound();
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
    try {
      if (!(await handle.stat()).isFile()) throw new FileNotFound();
    } catch (error) {
      await handle.close();
      if (error instanceof FileNotFound) throw error;
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
    return handle.createReadStream({ autoClose: true });
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const source = await this.resolve(parseStorageKey(fromKey, 'KEY'));
    const target = await this.resolve(parseStorageKey(toKey, 'KEY'));
    try {
      if (!(await lstat(source)).isFile()) throw new FileNotFound();
    } catch (error) {
      if (error instanceof FileNotFound || errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') throw new FileNotFound();
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
    await this.writeAtomically(target, (temporary) => copyFile(source, temporary));
  }

  async delete(key: string): Promise<void> {
    const target = await this.resolve(parseStorageKey(key, 'KEY'));
    try {
      await unlink(target);
    } catch (error) {
      if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') return;
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    const target = await this.resolve(parseStorageKey(prefix, 'PREFIX'));
    try {
      await rm(target, { recursive: true, force: true });
    } catch (error) {
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
  }

  /**
   * 마디를 뿌리와 합친 경로. 뿌리 밖이면 거부하고, 이미 있는 중간 경로가 심볼릭 링크면 따라가지 않고 거부한다(NFR1.3).
   */
  private async resolve(segments: string[]): Promise<string> {
    const target = join(this.root, ...segments);
    const inside = relative(this.root, target);
    if (inside === '' || inside.startsWith('..') || inside.split(sep).includes('..')) throw new StorageUnavailable('OUTSIDE_ROOT');
    let current = this.root;
    for (const segment of segments) {
      current = join(current, segment);
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new StorageUnavailable('OUTSIDE_ROOT');
      } catch (error) {
        if (error instanceof StorageUnavailable) throw error;
        if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') break;
        throw new StorageUnavailable('IO_FAILED', { cause: error });
      }
    }
    return target;
  }

  /** 같은 폴더의 임시 이름에 끝까지 쓴 뒤 이름을 바꾼다. 중간 실패면 임시 파일을 지우고 StorageUnavailable(BR6.4). */
  private async writeAtomically(target: string, write: (temporary: string) => Promise<void>): Promise<void> {
    const temporary = join(dirname(target), `.tmp-${randomUUID()}`);
    try {
      await mkdir(dirname(target), { recursive: true });
      await write(temporary);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new StorageUnavailable('IO_FAILED', { cause: error });
    }
  }
}

/** 설정이 없을 때의 저장소. 모든 호출이 StorageUnavailable(NOT_CONFIGURED)이다(보안 설계 「설정 검사 시점」). */
export class UnavailableFileStorage implements FileStorage {
  private fail(): Promise<never> {
    return Promise.reject(new StorageUnavailable('NOT_CONFIGURED'));
  }
  put(): Promise<void> { return this.fail(); }
  get(): Promise<Readable> { return this.fail(); }
  copy(): Promise<void> { return this.fail(); }
  delete(): Promise<void> { return this.fail(); }
  deletePrefix(): Promise<void> { return this.fail(); }
}
