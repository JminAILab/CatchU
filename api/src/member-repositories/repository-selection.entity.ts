import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { lengthBetween } from '../database/checks';

/**
 * 범위 판본의 정의(#252). 한 판본이 허용 자료 종류·수집 범위·한도·전체 선정 의미를 함께 식별한다.
 * 의미가 바뀌면 새 판본을 추가하고 기존 행은 고치거나 지우지 않는다(마이그레이션의 트리거가 막는다).
 * 10월은 저장소 전체 선정만 정의한다(#232). 부분 범위를 더하려면 이 CHECK와 세 공급의 판정을 함께 바꾼다.
 */
@Entity()
@Check(lengthBetween('scope_revision', 1, 200))
@Check(`"allowed_resource_types" <@ ARRAY['COMMIT', 'PULL_REQUEST', 'ISSUE']::text[] AND cardinality("allowed_resource_types") >= 1`)
@Check('"whole_repository" = true')
@Check(`jsonb_typeof("collection_terms") = 'object'`)
export class AllowedScopeRevision {
  @PrimaryColumn({ type: 'text' }) scopeRevision!: string;
  @Column({ type: 'text', array: true }) allowedResourceTypes!: string[];
  @Column({ type: 'boolean' }) wholeRepository!: boolean;
  // 수집 방식·범위·한도의 값과 지위(확정·제안·현행 계약). api는 해석하지 않고 판본의 의미로 보존한다.
  @Column({ type: 'jsonb' }) collectionTerms!: Record<string, unknown>;
}

/**
 * 현재 선정의 정본(#252): 저장소 ID·활성 여부·범위 판본·선정 참조. 좌표(소유자·이름)는 두지 않고
 * 선정 참조로 #319 불변 카탈로그에서 읽는다. 제외는 active=false, 좌표가 바뀌면 새 선정 참조로 바꾼다.
 */
@Entity()
@Unique(['selectionReference'])
@ForeignKey(() => AllowedScopeRevision, ['scopeRevision'], ['scopeRevision'])
@Check(`"repository_id" ~ '^[1-9][0-9]*$'`)
@Check(lengthBetween('selection_reference', 1, 200))
export class RepositorySelection {
  @PrimaryColumn({ type: 'text' }) repositoryId!: string;
  @Column({ type: 'text' }) selectionReference!: string;
  @Column({ type: 'text' }) scopeRevision!: string;
  @Column({ type: 'boolean' }) active!: boolean;
}
