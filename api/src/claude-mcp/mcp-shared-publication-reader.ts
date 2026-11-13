// 받은 링크 읽개(U9 기능 설계 BR2.1~BR2.5·BR5.2, 비기능 설계 reliability-design 「실패와 결과」·「다음 쪽에서 막기」·「판정 뒤」,
// security-design 「겹겹의 검사」, NFR1.1·NFR1.2·NFR1.8·NFR1.9·NFR4.3·NFR4.7, 계약 C-10·C-15 access).
// 쪽마다 C-10 판정을 처음부터 다시 하고 판정과 사본을 캐시하지 않는다. 발행본 표는 직접 쿼리하지 않고 PublicationAccess로만 읽는다.
// 링크 거부만 McpLinkDenied로 바꾸고, 작성자 회원 행 없음·DB 오류·그 밖의 예외는 삼키지 않고 그대로 던진다(도구 쪽에서 INTERNAL_ERROR).
import { Inject, Injectable } from '@nestjs/common';
import {
  LinkPasswordRequired, LinkUnavailable, NotFound, PublicationAccess, PublishedSnapshot, RecipientAccess,
} from '../publications/publication-access';
import { PUBLICATION_ACCESS } from '../publications/publications-config';
import { extractLinkToken } from './mcp-shared-link';
import { SharedPage, buildSharedPage, parseSharedCursor } from './mcp-shared-page';
import { flattenPublishedItem } from './mcp-shared-text';

export type McpLinkDeniedCode = 'LINK_UNAVAILABLE' | 'LINK_PASSWORD_REQUIRED';

/**
 * 받은 링크를 읽을 수 없다. 도구 오류 code로 바뀌고 mcp_link_denied(log)가 남는다.
 * 토큰·link와 링크 불가의 이유(없음·모양·삭제·중지·만료·작성자 비활성)는 담지 않는다(BR2.2, NFR1.6).
 */
export class McpLinkDenied extends Error {
  override readonly name = 'McpLinkDenied';

  constructor(readonly code: McpLinkDeniedCode) {
    super(code);
  }
}

@Injectable()
export class McpSharedPublicationReader {
  constructor(@Inject(PUBLICATION_ACCESS) private readonly access: PublicationAccess) {}

  /**
   * 받은 링크의 한 쪽. 처리 순서는 BR5.2다: 토큰 꺼내기 → cursor 모양 → 판정 → 사본 읽기 → 글로 펴기 → cursor 범위 → 쪽 만들기.
   * 앞 단계가 실패하면 뒤 단계를 하지 않는다. 그래서 잘못된 link·cursor는 DB를 건드리지 않고, 판정 실패는 사본을 읽지 않는다.
   */
  async readPage(link: string, cursor?: string): Promise<SharedPage> {
    const token = extractLinkToken(link);
    if (token === null) throw new McpLinkDenied('LINK_UNAVAILABLE');
    const position = cursor === undefined ? null : parseSharedCursor(cursor);
    const { publicationId } = await this.judge(token);
    const snapshot = await this.readSnapshot(publicationId);
    const items = snapshot.items.map((item) => ({
      position: item.position, itemKind: item.itemKind, title: item.title, content: flattenPublishedItem(item),
    }));
    return buildSharedPage({ title: snapshot.title, publishedAt: snapshot.publishedAt, expiresAt: snapshot.expiresAt, items }, position);
  }

  /** grant는 언제나 null이고 시각은 호출 때의 시각이다(BR2.1). 읽는 회원은 판정에 넘기지 않는다(BR2.4). */
  private async judge(token: string): Promise<RecipientAccess> {
    try {
      return await this.access.resolveForRecipient(token, null, new Date());
    } catch (error) {
      if (error instanceof LinkUnavailable) throw new McpLinkDenied('LINK_UNAVAILABLE');
      if (error instanceof LinkPasswordRequired) throw new McpLinkDenied('LINK_PASSWORD_REQUIRED');
      throw error;
    }
  }

  /** 판정 뒤 사본이 지워졌으면(NotFound) 링크 불가다. 판정 뒤 커밋된 중지·만료로는 이 호출을 취소하지 않는다(BR2.2·BR2.5). */
  private async readSnapshot(publicationId: string): Promise<PublishedSnapshot> {
    try {
      return await this.access.readSnapshot(publicationId);
    } catch (error) {
      if (error instanceof NotFound) throw new McpLinkDenied('LINK_UNAVAILABLE');
      throw error;
    }
  }
}
