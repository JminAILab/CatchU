/**
 * 선정 저장소 좌표의 불변 판본. 분석 동의의 범위 판본·허용 자료·고지 정책은 포함하지 않는다.
 * 새 이름/소유자는 새 selectionReference로 추가하고 이전 판본은 삭제·수정하지 않는다.
 */
export interface SelectedRepositoryVersion {
  readonly repositoryId: string;
  readonly owner: string;
  readonly name: string;
  readonly url: string;
  readonly selectionReference: string;
  readonly eligibility: 'ALL_AUTHENTICATED';
}

const INITIAL_VERSIONS: readonly SelectedRepositoryVersion[] = Object.freeze([
  Object.freeze({ repositoryId: '570342307', owner: 'ljm0850', name: 'TheMe',
    url: 'https://github.com/ljm0850/TheMe',
    selectionReference: 'catchu:selected-repository:2026-10-16:570342307:v1',
    eligibility: 'ALL_AUTHENTICATED' as const }),
  Object.freeze({ repositoryId: '547322698', owner: 'ljm0850', name: 'BEASTA-ZOO',
    url: 'https://github.com/ljm0850/BEASTA-ZOO',
    selectionReference: 'catchu:selected-repository:2026-10-16:547322698:v1',
    eligibility: 'ALL_AUTHENTICATED' as const }),
]);

/**
 * 보관 좌표 자료. 현재 선정·활성·범위 판본의 정본은 DB의 repository_selection(#252)이며
 * listCurrent(#319 초기 판본 목록)로 목록·접수·실행을 허가하지 않는다. 세 공급은 resolve만 쓴다.
 * ALL_AUTHENTICATED는 대상 범위 표기일 뿐 현재 회원 자격·GitHub 연결·분석 동의를 대신하지 않는다.
 * current 목록에서 제외된 판본도 resolve로 읽어 종료된 분석의 당시 좌표를 보존한다.
 */
export class SelectedRepositoryCatalog {
  private readonly versions = new Map<string, SelectedRepositoryVersion>();
  private readonly current: readonly SelectedRepositoryVersion[];

  constructor(versions: readonly SelectedRepositoryVersion[] = INITIAL_VERSIONS,
    currentSelectionReferences: readonly string[] = INITIAL_VERSIONS.map(row => row.selectionReference)) {
    for (const row of versions) {
      if (!row || typeof row.repositoryId !== 'string' || typeof row.owner !== 'string' ||
        typeof row.name !== 'string' || !/^[1-9][0-9]*$/.test(row.repositoryId) ||
        !/^[A-Za-z0-9-]+$/.test(row.owner) || !/^[A-Za-z0-9_.-]+$/.test(row.name) ||
        ['.', '..'].includes(row.name) || row.url !== `https://github.com/${row.owner}/${row.name}` ||
        typeof row.selectionReference !== 'string' || row.selectionReference.length === 0 ||
        row.eligibility !== 'ALL_AUTHENTICATED' || this.versions.has(row.selectionReference)) {
        throw new Error('Invalid selected repository catalog');
      }
      this.versions.set(row.selectionReference, Object.freeze({
        repositoryId: row.repositoryId, owner: row.owner, name: row.name, url: row.url,
        selectionReference: row.selectionReference, eligibility: row.eligibility,
      }));
    }
    const current = currentSelectionReferences.map(reference => this.versions.get(reference));
    if (current.some(row => !row) || new Set(current.map(row => row?.repositoryId)).size !== current.length) {
      throw new Error('Invalid current repository selection');
    }
    this.current = Object.freeze(current as SelectedRepositoryVersion[]);
  }

  listCurrent(): readonly SelectedRepositoryVersion[] { return this.current; }

  resolve(selectionReference: string): SelectedRepositoryVersion | null {
    return this.versions.get(selectionReference) ?? null;
  }
}
