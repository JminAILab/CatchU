import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from '../common/errors';
import { GITHUB_CONFIG, GitHubConfig } from './github.config';
import { GitHubAccessToken, GitHubIssuedCredential } from './github.client';

export interface StoredCredential extends GitHubIssuedCredential { memberId: string }
/** 파일 누락 또는 인증 복호화 실패. 다른 보관 장애와 구분해 재연결을 요구한다. */
export class CredentialUnavailableError extends Error {
  constructor() { super('GitHub credential is unavailable'); }
}
/** 외부의 전용 보관 디렉터리에 인증 암호문만 둔다. DB에는 무작위 참조만 저장한다. */
@Injectable()
export class CredentialVault {
  constructor(@Inject(GITHUB_CONFIG) private readonly config: GitHubConfig) {}
  private path(reference: string): string {
    if (!this.config.enabled || !/^github-v1:[a-f0-9-]{36}$/.test(reference)) throw new ApiError('INTERNAL_ERROR');
    return join(this.config.vaultDirectory, reference.slice(10) + '.enc');
  }
  async save(value: StoredCredential): Promise<string> {
    if (!this.config.enabled) throw new ApiError('INTERNAL_ERROR');
    const reference = 'github-v1:' + randomUUID();
    try {
      await mkdir(this.config.vaultDirectory, { recursive: true, mode: 0o700 });
      if ((await lstat(this.config.vaultDirectory)).isSymbolicLink()) throw new Error('invalid directory');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);
      cipher.setAAD(Buffer.from(reference));
      const plaintext = Buffer.from(JSON.stringify({ memberId: value.memberId, accountLogin: value.accountLogin,
        externalAccountReference: value.externalAccountReference, expiresAt: value.expiresAt.toISOString(), token: value.token.reveal() }));
      let ciphertext: Buffer;
      try { ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]); } finally { plaintext.fill(0); }
      await writeFile(this.path(reference), Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), { flag: 'wx', mode: 0o600 });
      return reference;
    } catch (error) {
      // 저장 도중 생긴 불완전 파일만 정리한다. 파일 오류 원문은 노출하지 않는다.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await unlink(this.path(reference)).catch(() => undefined);
      throw new ApiError('INTERNAL_ERROR');
    }
  }
  async read(reference: string, memberId: string): Promise<StoredCredential> {
    if (!this.config.enabled) throw new ApiError('INTERNAL_ERROR');
    try {
      const path = this.path(reference);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size < 29 || info.size > 16384) throw new Error('invalid file');
      const data = await readFile(path);
      const decipher = createDecipheriv('aes-256-gcm', this.config.encryptionKey, data.subarray(0, 12));
      decipher.setAAD(Buffer.from(reference));
      decipher.setAuthTag(data.subarray(12, 28));
      const decrypted = decipher.update(data.subarray(28));
      let plaintext: Buffer;
      try { plaintext = Buffer.concat([decrypted, decipher.final()]); }
      catch { throw new CredentialUnavailableError(); }
      finally { decrypted.fill(0); }
      let value: Record<string, unknown>;
      try { value = JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>; } finally { plaintext.fill(0); }
      if (value.memberId !== memberId || typeof value.accountLogin !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(value.accountLogin)
          || typeof value.externalAccountReference !== 'string' || !/^[1-9][0-9]*$/.test(value.externalAccountReference)
          || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))
          || typeof value.token !== 'string') throw new Error('invalid credential');
      return { memberId, accountLogin: value.accountLogin, externalAccountReference: value.externalAccountReference,
        expiresAt: new Date(value.expiresAt), token: new GitHubAccessToken(value.token) };
    } catch (error) {
      if (error instanceof CredentialUnavailableError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new CredentialUnavailableError();
      throw new ApiError('INTERNAL_ERROR');
    }
  }
  async remove(reference: string): Promise<void> {
    try { await unlink(this.path(reference)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ApiError('INTERNAL_ERROR');
    }
  }
}
