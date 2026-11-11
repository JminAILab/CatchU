import type { CatchAsset, RepositoryOption } from "./types";

// 모두 화면 검토용 합성 자료다. 실제 회원·저장소·분석·저장 결과가 아니다.
// example.invalid 출처는 실제 코드 근거로 사용할 수 없는 예시 주소다.
export const previewRepositories: readonly RepositoryOption[] = [
  { repositoryId: "demo-api", name: "example-org/demo-api" },
  { repositoryId: "demo-web", name: "example-org/demo-web" },
  { repositoryId: "empty-repo", name: "example-org/empty-repo" },
];

export const previewCatches: readonly CatchAsset[] = [
  {
    catchId: "synthetic-catch-api-errors",
    title: "[합성] API 오류 응답 구분",
    repositoryId: "demo-api",
    sourceRequestId: "synthetic-request-api",
    sourceResultId: "synthetic-result-api",
    sourceCandidateId: "synthetic-candidate-api-errors",
    workFacts: [
      "입력값 오류와 처리 중 오류를 서로 다른 응답으로 구분했다.",
      "두 오류 응답의 코드와 메시지를 확인하는 검사를 추가했다.",
    ],
    subjectContribution: "연동 계정이 작성자로 기록된 변경에는 오류 응답 분기와 해당 분기를 확인하는 검사 코드가 포함됩니다.",
    evidence: [
      {
        catchEvidenceId: "synthetic-evidence-api-errors",
        sourceEvidenceId: "synthetic-source-api-errors",
        sourceUrl: "https://example.invalid/example-org/demo-api/pull/1",
        sourceRevision: "synthetic-revision-api-001",
        representedFacts: ["오류 종류별 응답 분기 추가", "응답 코드와 메시지 검사 추가"],
        contributionScope: "오류 응답 처리 함수와 해당 함수의 검사 코드",
        coverageLimits: ["운영 환경의 오류 발생 빈도와 사용자 영향은 확인하지 않았다."],
      },
      {
        catchEvidenceId: "synthetic-evidence-api-error-tests",
        sourceEvidenceId: "synthetic-source-api-error-tests",
        sourceUrl: "https://example.invalid/example-org/demo-api/commit/test-001",
        sourceRevision: "synthetic-revision-api-test-001",
        representedFacts: ["입력값 오류와 처리 오류 응답을 각각 검증하는 테스트 추가"],
        contributionScope: "오류 응답의 분기별 테스트",
        coverageLimits: ["테스트 코드 추가 사실이며 운영 장애 감소를 입증하지 않는다."],
      },
    ],
    draft: {
      status: "GENERATED",
      content:
        "입력값 오류와 처리 중 오류를 구분하는 응답 분기를 구현했다. 각 분기에서 반환하는 코드와 메시지를 검사해 오류 상황에 맞는 응답이 나오는지 확인했다.",
    },
    reflection: {
      status: "GENERATED",
      questions: ["두 오류를 구분할 때 어떤 기준을 사용했나요?", "검사하지 못한 오류 상황이 있나요?"],
    },
    confirmation: { workFactsConfirmed: false, contributionConfirmed: false },
    mismatch: false,
    visibility: "PRIVATE",
    restriction: "NONE",
    sourceMode: "MOCK",
    // 작성자 설명 걸러 보기(새 Catch BR5.4)를 미리보기에서 볼 수 있게 쓴 것과 안 쓴 것을 섞는다.
    hasAuthorDescription: false,
  },
  {
    catchId: "synthetic-catch-api-pagination",
    // 제목 유무는 설명·질문의 생성 상태와 별개다.
    title: null,
    repositoryId: "demo-api",
    sourceRequestId: "synthetic-request-api",
    sourceResultId: "synthetic-result-api",
    sourceCandidateId: "synthetic-candidate-api-pagination",
    workFacts: ["목록 응답에 다음 페이지 식별자를 포함했다.", "마지막 페이지에서 다음 식별자가 없는 경우를 검사했다."],
    subjectContribution: "연동 계정이 작성자로 기록된 변경에는 다음 페이지 식별자를 만드는 로직과 마지막 페이지 검사가 포함됩니다.",
    evidence: [
      {
        catchEvidenceId: "synthetic-evidence-api-pagination",
        sourceEvidenceId: "synthetic-source-api-pagination",
        sourceUrl: "https://example.invalid/example-org/demo-api/pull/2",
        sourceRevision: "synthetic-revision-api-002",
        representedFacts: ["다음 페이지 식별자 반환 로직 추가", "마지막 페이지의 응답 검사 추가"],
        contributionScope: "목록 조회 응답과 페이지 경계 검사",
        coverageLimits: ["여러 사용자가 동시에 조회하는 상황은 이 자료에 포함되지 않았다."],
      },
    ],
    draft: {
      status: "GENERATED",
      content:
        "목록을 이어서 조회할 수 있도록 다음 페이지 식별자를 응답에 포함했다. 마지막 페이지에서는 다음 식별자가 반환되지 않는지 검사했다.",
    },
    reflection: { status: "FAILED", questions: [] },
    confirmation: { workFactsConfirmed: true, contributionConfirmed: true },
    // 불일치 표시는 확인·공개 상태를 자동으로 되돌리지 않는다.
    mismatch: true,
    visibility: "PUBLIC",
    restriction: "NONE",
    sourceMode: "MOCK",
    hasAuthorDescription: true,
  },
  {
    catchId: "synthetic-catch-web-loading",
    title: "[합성] 목록의 로딩과 빈 상태 구분",
    repositoryId: "demo-web",
    sourceRequestId: "synthetic-request-web",
    sourceResultId: "synthetic-result-web",
    sourceCandidateId: "synthetic-candidate-web-loading",
    workFacts: ["조회 대기 중에는 로딩 안내를 표시했다.", "조회 성공 후 결과가 없을 때만 빈 목록 안내를 표시했다."],
    subjectContribution: "연동 계정이 작성자로 기록된 변경에는 조회 상태별 표시 조건과 로딩·빈 목록 안내 컴포넌트가 포함됩니다.",
    evidence: [
      {
        catchEvidenceId: "synthetic-evidence-web-loading",
        sourceEvidenceId: "synthetic-source-web-loading",
        sourceUrl: "https://example.invalid/example-org/demo-web/pull/1",
        sourceRevision: "synthetic-revision-web-001",
        representedFacts: ["조회 대기와 성공 상태에 따른 표시 분기", "빈 목록 안내의 표시 조건 추가"],
        contributionScope: "목록 화면의 상태 분기와 안내 컴포넌트",
        coverageLimits: ["실제 사용자의 화면 이해도와 사용성 개선 효과는 측정하지 않았다."],
      },
    ],
    draft: { status: "FAILED", content: null },
    reflection: {
      status: "GENERATED",
      questions: ["로딩과 빈 목록을 구분하지 않으면 사용자에게 어떤 오해가 생길 수 있나요?"],
    },
    // 확인을 마쳐도 별도 공개 선택 전에는 미공개 상태를 유지한다.
    confirmation: { workFactsConfirmed: true, contributionConfirmed: true },
    mismatch: false,
    visibility: "PRIVATE",
    restriction: "NONE",
    sourceMode: "MOCK",
    hasAuthorDescription: true,
  },
  {
    catchId: "synthetic-catch-web-form",
    title: "[합성] 입력 오류의 항목별 안내",
    repositoryId: "demo-web",
    sourceRequestId: "synthetic-request-web",
    sourceResultId: "synthetic-result-web",
    sourceCandidateId: "synthetic-candidate-web-form",
    workFacts: ["입력 오류를 해당 항목 아래에 표시했다.", "오류가 나도 이미 입력한 값을 화면에 유지했다."],
    subjectContribution: "연동 계정이 작성자로 기록된 변경에는 입력 항목별 오류 메시지와 입력값 유지 처리가 포함됩니다.",
    evidence: [
      {
        catchEvidenceId: "synthetic-evidence-web-form",
        sourceEvidenceId: "synthetic-source-web-form",
        sourceUrl: "https://example.invalid/example-org/demo-web/pull/2",
        sourceRevision: "synthetic-revision-web-002",
        representedFacts: ["입력 항목별 오류 메시지 표시", "오류 이후 입력값 유지 처리"],
        contributionScope: "입력 폼의 오류 안내와 화면 상태 처리",
        coverageLimits: ["서버 검증의 구현과 운영 중 입력 오류 비율은 이 자료로 확인할 수 없다."],
      },
    ],
    draft: { status: "NOT_GENERATED", content: null },
    reflection: { status: "NOT_GENERATED", questions: [] },
    confirmation: { workFactsConfirmed: true, contributionConfirmed: true },
    mismatch: false,
    visibility: "PUBLIC",
    // 공개 선택과 원본 보호 제한은 별도 값이며 수신자 열람 가능성을 뜻하지 않는다.
    restriction: "SOURCE_PRIVATE",
    sourceMode: "MOCK",
    hasAuthorDescription: false,
  },
];
