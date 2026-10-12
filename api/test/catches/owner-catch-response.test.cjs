const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  CatchReadIntegrityError,
  toOwnerCatchResponse,
  toOwnerCatchPage,
} = require('../../dist/catches/owner-catch-response');

// 합성 자료만 사용한다. DB 조회·인증·HTTP 상태 검증을 대신하는 테스트가 아니다.
function fixture() {
  return {
    asset: {
      catchId: 'catch-owner-1',
      ownerId: 'member-owner',
      title: '목록 조회 오류 안내 추가',
      sourceRequestId: 'request-1',
      sourceResultId: 'result-1',
      sourceCandidateId: 'candidate-1',
      workFacts: ['조회 실패 안내를 추가했다.'],
      subjectContribution: '오류 안내와 재조회 버튼을 구현했다.',
      draftStatus: 'GENERATED',
      draftContent: '조회 실패 시 빈 목록과 구분해 안내했다.',
      reflectionStatus: 'GENERATED',
      reflectionQuestions: ['조회 실패와 빈 목록을 어떻게 구분했나요?'],
      workFactsConfirmed: true,
      contributionConfirmed: false,
      mismatch: true,
      visibility: 'PUBLIC',
      sourceMode: 'MOCK',
    },
    sourceRequest: {
      requestId: 'request-1',
      memberId: 'member-owner',
      repositoryId: 'repository-1',
    },
    evidence: [{
      catchEvidenceId: 'catch-evidence-1',
      catchId: 'catch-owner-1',
      sourceEvidenceId: 'source-evidence-1',
      sourceUrl: 'https://example.invalid/repositories/demo/pull/1',
      sourceRevision: 'synthetic-revision-1',
      representedFacts: ['조회 실패 안내 변경'],
      contributionScope: '오류 안내 구현',
      coverageLimits: ['운영 중 사용자 반응은 포함하지 않음'],
    }],
    protection: {
      ownerId: 'member-owner',
      repositoryId: 'repository-1',
      appliedRestriction: 'SOURCE_PRIVATE',
      confirmedSourceState: { synthetic: true, visibility: 'PRIVATE' },
      observationProvenance: { synthetic: true, fixture: 'owner-catch-response' },
      observedAt: new Date('2026-10-01T00:00:00Z'),
    },
  };
}

function project(source) {
  return toOwnerCatchResponse('member-owner', source);
}

function assertIntegrityError(action) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof CatchReadIntegrityError);
    assert.equal(error.message, '저장된 Catch 조회 자료가 올바르지 않습니다.');
    return true;
  });
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('본인 응답은 common.yaml의 필드만 내보내고 저장소는 원 요청에서 구한다', () => {
  const source = fixture();
  source.asset.repositoryId = 'wrong-denormalized-repository';
  source.asset.workIdentity = 'internal-work-identity';
  source.asset.registrationAssessment = { internalReason: 'internal-assessment' };
  source.sourceRequest.internalQueueReference = 'internal-queue';
  source.evidence[0].rawContent = 'internal-evidence-content';
  source.protection.observationProvenance = 'internal-observation';
  source.protection.observationFailure = 'internal-observation-failure';

  assert.deepEqual(project(source), {
    catchId: 'catch-owner-1',
    title: '목록 조회 오류 안내 추가',
    repositoryId: 'repository-1',
    sourceRequestId: 'request-1',
    sourceResultId: 'result-1',
    sourceCandidateId: 'candidate-1',
    workFacts: ['조회 실패 안내를 추가했다.'],
    subjectContribution: '오류 안내와 재조회 버튼을 구현했다.',
    evidence: [{
      catchEvidenceId: 'catch-evidence-1',
      sourceEvidenceId: 'source-evidence-1',
      sourceUrl: 'https://example.invalid/repositories/demo/pull/1',
      sourceRevision: 'synthetic-revision-1',
      representedFacts: ['조회 실패 안내 변경'],
      contributionScope: '오류 안내 구현',
      coverageLimits: ['운영 중 사용자 반응은 포함하지 않음'],
    }],
    draft: { status: 'GENERATED', content: '조회 실패 시 빈 목록과 구분해 안내했다.' },
    reflection: { status: 'GENERATED', questions: ['조회 실패와 빈 목록을 어떻게 구분했나요?'] },
    confirmation: { workFactsConfirmed: true, contributionConfirmed: false },
    mismatch: true,
    visibility: 'PUBLIC',
    restriction: 'SOURCE_PRIVATE',
    sourceMode: 'MOCK',
  });
});

test('null 제목은 초안 생성 상태와 독립적이며 상세·혼합 목록에서 필드를 보존한다', () => {
  for (const status of ['GENERATED', 'FAILED', 'NOT_GENERATED']) {
    const source = fixture();
    source.asset.title = null;
    source.asset.draftStatus = status;
    source.asset.draftContent = status === 'GENERATED' ? '제목 없이 생성된 합성 초안' : null;
    const response = project(source);
    assert.equal(response.title, null);
    assert.deepEqual(response.draft, { status, content: source.asset.draftContent });
    const page = toOwnerCatchPage('member-owner', [source, fixture()], null);
    assert.equal(page.items[0].title, null);
    assert.equal(page.items[1].title, fixture().asset.title);
  }
});

test('타인 자료는 PUBLIC이어도 존재하지 않는 자료와 같은 null을 반환한다', () => {
  assert.equal(project(null), null);
  for (const visibility of ['PRIVATE', 'PUBLIC']) {
    const source = fixture();
    source.asset.ownerId = 'member-other';
    source.asset.visibility = visibility;
    // 타인 자료의 하위 연결 정보가 잘못되어도 본인용 응답으로 노출하지 않는다.
    source.sourceRequest = null;
    source.protection = null;
    assert.equal(project(source), null);
  }
});

test('원 요청의 회원·식별자와 근거의 Catch 연결이 다르면 성공 응답을 만들지 않는다', () => {
  const breakRelation = [
    (source) => { source.sourceRequest = null; },
    (source) => { source.sourceRequest.memberId = 'member-other'; },
    (source) => { source.sourceRequest.requestId = 'request-other'; },
    (source) => { source.evidence[0].catchId = 'catch-other'; },
  ];
  for (const change of breakRelation) {
    const source = fixture();
    change(source);
    assertIntegrityError(() => project(source));
  }
});

test('보호 자료 누락 또는 회원·저장소 불일치를 NONE으로 보정하지 않는다', () => {
  const breakProtection = [
    (source) => { source.protection = null; },
    (source) => { source.protection.ownerId = 'member-other'; },
    (source) => { source.protection.repositoryId = 'repository-other'; },
    (source) => { delete source.protection.appliedRestriction; },
    (source) => { source.protection.appliedRestriction = 'LOOKUP_FAILED'; },
  ];
  for (const change of breakProtection) {
    const source = fixture();
    change(source);
    assertIntegrityError(() => project(source));
  }
});

test('관측 상태·출처·시각의 null·누락은 상세와 전체 페이지를 실패시킨다', () => {
  for (const restriction of ['NONE', 'SOURCE_PRIVATE']) {
    for (const field of ['confirmedSourceState', 'observationProvenance', 'observedAt']) {
      for (const value of [null, undefined]) {
        const source = fixture();
        source.protection.appliedRestriction = restriction;
        source.protection[field] = value;
        source.protection.observationFailure = { synthetic: true, reason: 'TIMEOUT' };
        assertIntegrityError(() => project(source));
        assertIntegrityError(() => toOwnerCatchPage('member-owner', [fixture(), source], null));
      }
    }
  }
});

test('이전 유효 관측이 있으면 최근 실패 정보가 있어도 적용된 보호 상태를 보존한다', () => {
  for (const restriction of ['NONE', 'SOURCE_PRIVATE']) {
    const source = fixture();
    source.protection.appliedRestriction = restriction;
    source.protection.observationFailure = 'synthetic-timeout';
    const response = project(source);
    assert.equal(response.restriction, restriction);
    assert.equal(Object.hasOwn(response, 'observationFailure'), false);
  }
});

test('확인 두 값·불일치·공개·보호·출처 모드는 서로 독립적으로 보존한다', () => {
  for (const workFactsConfirmed of [false, true]) {
    for (const contributionConfirmed of [false, true]) {
      for (const mismatch of [false, true]) {
        for (const visibility of ['PRIVATE', 'PUBLIC']) {
          for (const restriction of ['NONE', 'SOURCE_PRIVATE']) {
            for (const sourceMode of ['MOCK', 'LIVE']) {
              const source = fixture();
              Object.assign(source.asset, {
                workFactsConfirmed, contributionConfirmed, mismatch, visibility, sourceMode,
              });
              source.protection.appliedRestriction = restriction;
              const response = project(source);
              assert.ok(response, 'SOURCE_PRIVATE도 본인의 자료 조회는 허용한다.');
              assert.deepEqual(response.confirmation, { workFactsConfirmed, contributionConfirmed });
              assert.equal(response.mismatch, mismatch);
              assert.equal(response.visibility, visibility);
              assert.equal(response.restriction, restriction);
              assert.equal(response.sourceMode, sourceMode);
            }
          }
        }
      }
    }
  }
});

test('초안 실패·미생성을 Catch 없음으로 바꾸지 않고 상태와 null 본문을 보존한다', () => {
  for (const status of ['FAILED', 'NOT_GENERATED']) {
    const source = fixture();
    source.asset.draftStatus = status;
    source.asset.draftContent = null;
    source.asset.reflectionStatus = status;
    source.asset.reflectionQuestions = [];
    const response = project(source);
    assert.equal(response.catchId, 'catch-owner-1');
    assert.deepEqual(response.draft, { status, content: null });
    assert.deepEqual(response.reflection, { status, questions: [] });
  }
});

test('초안 생성 상태와 본문이 모순되면 실패한다', () => {
  for (const [status, content] of [
    ['GENERATED', null],
    ['GENERATED', 123],
    ['FAILED', '남아 있으면 안 되는 초안'],
    ['NOT_GENERATED', '남아 있으면 안 되는 초안'],
  ]) {
    const source = fixture();
    source.asset.draftStatus = status;
    source.asset.draftContent = content;
    assertIntegrityError(() => project(source));
  }
});

test('등록된 Catch의 작업 사실·근거·근거가 대표하는 사실은 1개 이상이어야 한다', () => {
  const removeRequiredContent = [
    (source) => { source.asset.workFacts = []; },
    (source) => { source.evidence = []; },
    (source) => { source.evidence[0].representedFacts = []; },
    (source) => { source.evidence = [null]; },
    (source) => { source.asset.workFacts = [null]; },
  ];
  for (const change of removeRequiredContent) {
    const source = fixture();
    change(source);
    assertIntegrityError(() => project(source));
  }
});

test('같은 Catch 안에서 근거 기본키 또는 원본 근거 ID가 중복되면 실패한다', () => {
  for (const duplicateField of ['catchEvidenceId', 'sourceEvidenceId']) {
    const source = fixture();
    const second = structuredClone(source.evidence[0]);
    second.catchEvidenceId = 'catch-evidence-2';
    second.sourceEvidenceId = 'source-evidence-2';
    second[duplicateField] = source.evidence[0][duplicateField];
    source.evidence.push(second);
    assertIntegrityError(() => project(source));
  }
});

test('서로 다른 근거는 저장된 순서와 최소 질문을 그대로 제공한다', () => {
  const source = fixture();
  source.evidence.push({
    ...structuredClone(source.evidence[0]),
    catchEvidenceId: 'catch-evidence-2',
    sourceEvidenceId: 'source-evidence-2',
    sourceUrl: 'https://example.invalid/repositories/demo/commit/2',
    sourceRevision: 'synthetic-revision-2',
    representedFacts: ['재조회 버튼 변경'],
  });
  const response = project(source);
  assert.deepEqual(response.evidence.map((item) => item.sourceEvidenceId), ['source-evidence-1', 'source-evidence-2']);
  assert.deepEqual(response.reflection.questions, source.asset.reflectionQuestions);
});

test('근거 출처는 URI여야 하며 잘못된 값이 내부 오류 메시지에 섞이지 않는다', () => {
  const source = fixture();
  source.evidence[0].sourceUrl = 'not-a-uri synthetic-sensitive-value';
  assertIntegrityError(() => project(source));

  // 계약의 URI 형식을 검사하되 아직 합의되지 않은 HTTP 전용 정책은 추가하지 않는다.
  source.evidence[0].sourceUrl = 'urn:example:synthetic-evidence-1';
  assert.equal(project(source).evidence[0].sourceUrl, 'urn:example:synthetic-evidence-1');
});

test('필수 식별자·열거형·불리언 오류를 기본값으로 숨기지 않는다', () => {
  const malformed = [
    (source) => { source.asset.catchId = ''; },
    (source) => { delete source.asset.title; },
    ...[undefined, '', 123, false, [], {}].map((title) => (source) => { source.asset.title = title; }),
    (source) => { source.sourceRequest.repositoryId = ''; },
    (source) => { source.asset.sourceResultId = ''; },
    (source) => { source.asset.sourceCandidateId = ''; },
    (source) => { source.asset.subjectContribution = ''; },
    (source) => { source.asset.workFactsConfirmed = 'true'; },
    (source) => { source.asset.contributionConfirmed = null; },
    (source) => { source.asset.mismatch = 0; },
    (source) => { source.asset.visibility = 'UNKNOWN'; },
    (source) => { source.asset.draftStatus = 'UNKNOWN'; },
    (source) => { source.asset.reflectionStatus = 'UNKNOWN'; },
    (source) => { source.asset.sourceMode = 'UNKNOWN'; },
  ];
  for (const change of malformed) {
    const source = fixture();
    change(source);
    assertIntegrityError(() => project(source));
  }
});

test('조회 변환은 입력을 변경하지 않으며 반환 배열을 고쳐도 정본 자료는 변하지 않는다', () => {
  const source = fixture();
  const before = structuredClone(source);
  freezeDeep(source);
  const response = project(source);
  assert.deepEqual(source, before);

  response.workFacts.push('화면에서만 변경한 사실');
  response.evidence[0].representedFacts.push('화면에서만 변경한 근거');
  response.evidence[0].coverageLimits.push('화면에서만 변경한 한계');
  response.evidence[0].sourceUrl = 'https://example.invalid/local-only';
  response.reflection.questions.push('화면에서만 추가한 질문');
  response.confirmation.workFactsConfirmed = false;
  response.draft.content = '화면에서만 바꾼 초안';
  assert.deepEqual(source, before);
});

test('정상 조회한 빈 페이지는 빈 items와 전달받은 커서를 보존한다', () => {
  for (const nextCursor of [null, 'opaque-cursor+/=?', '']) {
    assert.deepEqual(toOwnerCatchPage('member-owner', [], nextCursor), {
      items: [], page: { nextCursor },
    });
  }
});

test('본인 페이지는 순서와 커서를 유지하고 필터·페이지 종료를 임의로 결정하지 않는다', () => {
  const first = fixture();
  const second = fixture();
  second.asset.catchId = 'catch-owner-2';
  second.asset.sourceCandidateId = 'candidate-2';
  second.evidence[0].catchId = 'catch-owner-2';
  const page = toOwnerCatchPage('member-owner', [second, first], 'opaque-cursor+/=?');
  assert.deepEqual(page.items.map((item) => item.catchId), ['catch-owner-2', 'catch-owner-1']);
  assert.deepEqual(page.page, { nextCursor: 'opaque-cursor+/=?' });
});

test('페이지에 타인·누락·깨진 본인 자료가 섞이면 일부 결과나 빈 목록으로 숨기지 않는다', () => {
  const foreign = fixture();
  foreign.asset.ownerId = 'member-other';
  const broken = fixture();
  broken.protection = null;
  for (const badItem of [foreign, broken, null]) {
    assertIntegrityError(() => toOwnerCatchPage('member-owner', [fixture(), badItem], null));
  }
  assertIntegrityError(() => toOwnerCatchPage('member-owner', null, null));
});

test('인증 회원 ID가 없거나 커서 자료형이 틀리면 성공 페이지를 만들지 않는다', () => {
  assertIntegrityError(() => toOwnerCatchResponse('', null));
  assertIntegrityError(() => toOwnerCatchPage('', [], null));
  assertIntegrityError(() => toOwnerCatchPage('member-owner', [], 123));
});
