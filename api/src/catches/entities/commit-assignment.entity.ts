import { Check, Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { deleteWithParent } from '../../database/foreign-keys';
import { CatchAssetEntity } from './catch-asset.entity';

/**
 * 소속 기록(CR2): 한 회원·한 GitHub 저장소 안에서 커밋 SHA 하나가 어느 Catch에 속하는지 적는다.
 * 결과 반영의 등록 트랜잭션에서 한 번 쓰고 바꾸지 않는다. 같은 (회원, 저장소, SHA)가 다시 오면 무시한다.
 * 열쇠 세 칸이 곧 기본 키다(따로 둔 내부 ID 없음). Catch는 (catch_id, member_id) 한 쌍으로 가리켜, 회원이
 * Catch 주인과 다르면 DB가 거부한다(ADR-002). 회원·분석 요청을 직접 가리키는 외래 키는 두지 않고 Catch를 따라서만
 * 지워진다(회원 탈퇴·분석 요청 삭제 → Catch → 소속 기록, docs/member-withdrawal-deletion.md).
 * 새 Catch NC2부터 발행이 이 표를 읽어 사본 근거의 본인 커밋 표지(`ownCommit`)를 정한다(publications/publish.service.ts). 소속의 뜻이나 쓰는 규칙을 바꾸면
 * 면접관 화면의 표지도 바뀐다. worker에 새 작업 전체 한계 문장을 더하면 publications/work-limit-sentences.ts의 상수 목록에도 더해야 면접관 화면에 보인다.
 */
@Entity('commit_assignment')
@ForeignKey(() => CatchAssetEntity, ['catchId', 'memberId'], ['catchId', 'ownerId'], deleteWithParent)
// Catch가 지워질 때 연쇄 삭제가 소속 기록 전체를 훑지 않게 한다.
@Index(['catchId', 'memberId'])
@Check('char_length("github_repository_id") >= 1')
@Check('"commit_sha" ~ \'^[0-9a-f]{40}$\'')
export class CommitAssignmentEntity {
  @PrimaryColumn({ name: 'member_id', type: 'uuid' })
  memberId!: string;

  /** 분석 요청의 저장소 ID(analysis_request.repository_id) 그대로. 불투명 문자열이라 대소문자·앞 0을 바꾸지 않는다. */
  @PrimaryColumn({ name: 'github_repository_id', type: 'text' })
  githubRepositoryId!: string;

  @PrimaryColumn({ name: 'commit_sha', type: 'char', length: 40 })
  commitSha!: string;

  @Column({ name: 'catch_id', type: 'uuid' })
  catchId!: string;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;
}
