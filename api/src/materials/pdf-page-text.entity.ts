import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../database/foreign-keys';
import { PdfMaterial } from './pdf-material.entity';

/**
 * PDF 원본의 쪽 하나에서 worker가 뽑은 글(U8 기능 설계 entities.md PdfPageText, 계약 C-06).
 *
 * - 추출 결과 수신(W2)이 한 트랜잭션에서 쪽 행을 전부 넣는다. 부분 저장은 없다(BR3.4).
 * - `readable = (text <> '')`: 글이 없는 쪽은 readable=false·빈 글이고(FR3.4), 글이 있는 쪽은 readable=true다.
 *   worker 판정(BR3.1: 공백·제어 문자만이면 빈 글)과 수신 검사(BR3.3)가 같은 규칙을 쓰고, DB가 마지막으로 막는다.
 * - `text`는 신뢰할 수 없는 입력이다. 가공 없이 두되 저장할 수 없는 NUL만 뺀다(BR3.5). 로그·오류에 싣지 않는다.
 * - 발행 때 이 행들을 복사해 published_pdf_page로 고정한다(BR4.3). 원본 삭제는 PDF 자료를 따라 연쇄된다.
 */
@Entity('pdf_page_text')
@ForeignKey(() => PdfMaterial, ['pdfMaterialId'], ['pdfMaterialId'], deleteWithParent)
@Unique(['pdfMaterialId', 'pageNumber'])
@Check('"page_number" >= 1')
@Check(`"readable" = ("text" <> '')`)
export class PdfPageText {
  @PrimaryColumn({ type: 'uuid' })
  pdfPageTextId: string = randomUUID();

  @Column({ type: 'uuid' })
  pdfMaterialId!: string;

  /** 1부터 빈틈 없이 연속. 연속성은 수신 검사(BR3.3)가, 중복은 UNIQUE가 막는다 */
  @Column({ type: 'integer' })
  pageNumber!: number;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'boolean' })
  readable!: boolean;
}
