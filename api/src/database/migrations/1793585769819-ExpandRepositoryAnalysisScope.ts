import { MigrationInterface, QueryRunner } from "typeorm";

const PREVIOUS_SCOPE = 'catchu:allowed-scope:2026-10-19:v1';
const CURRENT_SCOPE = 'catchu:allowed-scope:2026-11-01:v1';
// #424 2026-11-01 결정: 커밋3000·상세1500·PR600·이슈1000·호출2500·수집1800초.
// 같은 결정의 생성300회는 worker 생성 상한이며 collection_terms에 원래 없던 필드를 추가하지 않는다.
// range/limits에는 PR 커밋 목록30·총량/응답/연결/비교 등의 유지된 제안값도 섞여 있어 기존 PROPOSED 지위를 유지한다.
const COLLECTION_TERMS = {
    method: { status: 'DECIDED', value: 'GITHUB_API' },
    range: { status: 'PROPOSED', value: { defaultBranchCommits: 3000, linkedAccountCommitDetails: 1500, pullRequests: 600,
        linkedAccountPullRequestCommitLists: 30, issueListItems: 1000 } },
    limits: { status: 'PROPOSED', value: { calls: 2500, collectionSeconds: 1800, totalBytes: 52428800, responseBytes: 10485760,
        connectTimeoutSeconds: 5, readTimeoutSeconds: 15, comparePages: 10, baseBranchCommits: 100,
        associatedPullRequestLookupBatch: 100 } },
    retries: { status: 'CONTRACT', value: 'NONE' },
};

export class ExpandRepositoryAnalysisScope1793585769819 implements MigrationInterface {
    name = 'ExpandRepositoryAnalysisScope1793585769819';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 과거 판본·동의 사본은 불변이다. down 뒤 재적용도 같은 정의인지 먼저 확인한다.
        await queryRunner.query(`INSERT INTO allowed_scope_revision
            (scope_revision, allowed_resource_types, whole_repository, collection_terms)
            VALUES ($1, $2, true, $3) ON CONFLICT (scope_revision) DO NOTHING`,
            [CURRENT_SCOPE, ['COMMIT', 'PULL_REQUEST', 'ISSUE'], JSON.stringify(COLLECTION_TERMS)]);
        const [definition] = await queryRunner.query(`SELECT
            allowed_resource_types = $2::text[] AND whole_repository = true AND collection_terms = $3::jsonb AS matches
            FROM allowed_scope_revision WHERE scope_revision = $1`,
            [CURRENT_SCOPE, ['COMMIT', 'PULL_REQUEST', 'ISSUE'], JSON.stringify(COLLECTION_TERMS)]) as { matches: boolean }[];
        if (!definition?.matches) throw new Error('Current analysis scope revision has a different immutable definition');
        await queryRunner.query(`UPDATE repository_registration SET scope_revision = $1 WHERE scope_revision = $2`,
            [CURRENT_SCOPE, PREVIOUS_SCOPE]);
        await queryRunner.query(`UPDATE repository_selection SET scope_revision = $1 WHERE scope_revision = $2`,
            [CURRENT_SCOPE, PREVIOUS_SCOPE]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 새 판본으로 받은 동의가 있으면 과거 범위로 되돌리지 않는다. 이력 보존을 검토한 별도 전환이 필요하다.
        const [usage] = await queryRunner.query(`SELECT EXISTS
            (SELECT 1 FROM analysis_consent WHERE scope_revision = $1) AS used`, [CURRENT_SCOPE]) as { used: boolean }[];
        if (usage.used) throw new Error('Scope rollback requires preservation of analysis consents for the current revision');
        await queryRunner.query(`UPDATE repository_registration SET scope_revision = $1 WHERE scope_revision = $2`,
            [PREVIOUS_SCOPE, CURRENT_SCOPE]);
        await queryRunner.query(`UPDATE repository_selection SET scope_revision = $1 WHERE scope_revision = $2`,
            [PREVIOUS_SCOPE, CURRENT_SCOPE]);
        // 새 정의도 불변 행이므로 지우지 않는다. 재적용은 같은 정의일 때만 허용한다.
    }

}
