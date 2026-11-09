## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-29T04:30:08Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR1.11 확인 칸 | 주소 허용 시험이 `http://github.com/`, `github.com.evil.example`, `gist.github.com`, `javascript:` 네 가지뿐이다. 사용자 정보가 붙은 주소(`https://github.com@evil.example/`), 포트가 붙은 주소(`https://github.com:8443/`), 대문자 호스트가 빠져 있다. 또 자유 문장 안에서 주소의 끝을 어디까지로 보는지(뒤따르는 문장부호·공백) 정해져 있지 않다 | 거부 사례에 위 세 가지를 더하고, 주소 끝 판정 기준을 한 줄로 적는다. 기준이 `https://github.com/` 접두 비교인지 URL 해석 뒤 호스트 비교인지도 함께 정한다 | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR1.10·NFR1.11·NFR7.1 | 주소 링크 규칙(NFR1.11)의 적용 대상이 텍스트 자료 본문과 Catch 작성자 설명뿐이다. 같은 화면에 나오는 AI 요약·AI 설명 초안·질의응답 답에 주소가 있을 때 글자로만 보이는지는 어디에도 적혀 있지 않다 | AI가 쓴 글 안의 주소는 링크로 만들지 않고 글자로 보인다는 한 줄을 NFR1.11에 더하거나, 그 판단을 U5·U10 몫으로 넘긴다고 명시한다 | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR1.8 | 경로의 ID는 UUID 형식을 먼저 확인한다고 했지만, 받은 사람 경로의 토큰(256비트 난수)은 UUID가 아니다. 형식이 틀린 토큰이 400인지 404 `LINK_UNAVAILABLE`인지 정해져 있지 않다. 400이면 NFR1.3의 "구분 없이 404"와 어긋난다 | 형식이 틀린 토큰도 없는 토큰과 같은 404 `LINK_UNAVAILABLE`로 처리한다고 NFR1.8 또는 NFR1.3에 적는다 | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/scalability-requirements.md > NFR4.9 | 발행 빈도 제한기와 unlock 시도 제한기를 "10월 구현 그대로"라고만 하고 저장 위치를 적지 않았다. 12월 최종 환경이 EKS(복제 여러 개 가능)인데, 이 제한기가 프로세스 메모리 기반이면 비밀번호 시도 제한(NFR1.7)이 복제 수만큼 느슨해진다. 이 점을 확인하지 못했다 | 10월 제한기의 저장 위치를 한 줄로 확인해 적고, 메모리 기반이면 "복제 N개일 때 한도가 N배가 되는 한계"를 NFR1.7 또는 NFR4.9에 남긴다 | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR7.4 | 확인 방법이 "화면 문구 검토"뿐이고, 줄인 고정 안내 문구는 "받은 사람 화면 연결 전에 정한다"로 미뤄 두었다. 통과·실패 기준이 없어 다른 사람이 같은 결론에 이르기 어렵다. U2 문구 두 건(#423)도 아직 반영 전이다 | 중복 판정 기준을 적는다. 예를 들어 "U4 안내는 발행 시각만 표시하고, `fixed-copy`·U5 고지·U10 안내와 같은 의미의 문장이 한 화면에 둘 이상이면 실패"처럼 쓴다. 문구 확정 시점도 입력 변경 항목에 올린다 | Resolved (reviewer) |

> R-01 Reviewer note: NFR1.11이 거부 사례에 `https://github.com@evil.example/`와 `gist.github.com`을 더했고 대문자 호스트는 URL 해석 결과를 시험으로 기록하게 했다. 판정 기준도 `isGithubSourceUrl`의 URL 해석 뒤 비교로 못박았다. `recipient-format.ts`의 실제 판정(프로토콜 `https:`, 호스트 `github.com`, 사용자 정보 없음)과 일치한다. 포트와 주소 끝 판정은 OQ-U4-NFR-1·OQ-U4-NFR-2에 담당(U4 제안 후 팀장 결정)과 시점(본문 링크 구현 전)과 합의 전 처리(10월 판정 유지, 끝 판정 전에는 본문 자동 링크를 구현하지 않음)로 남겼다. 새 결정을 확정하지 않았다

> R-02 Reviewer note: AI가 쓴 글 안의 주소 정책을 OQ-U4-NFR-3으로 올렸다. `aiDraft`는 U4, AI 요약·질의응답은 U5, JD 요약은 U10 담당이고 결정 시점은 각 화면 연결 전이다. 합의 전 처리는 `aiDraft`에 링크를 만들지 않는 현 상태 유지다. 정책을 임의로 확정하지 않았다

> R-03 Reviewer note: NFR1.12를 신설해 받은 사람 경로의 토큰이 base64url 43자이며 형식 오류는 DB 조회 없이 404 `LINK_UNAVAILABLE`로 응답한다고 적었다. `link-token.ts`의 `TOKEN_PATTERN`(`^[A-Za-z0-9_-]{43}$`)과 `link-access.service.ts` 62행(`if (!isLinkTokenFormat(token)) throw unavailable();`)에서 확인했다. 10월 구현 확인으로만 쓰고 400 변경은 C-12 변경이라 하지 않는다고 했으며, 계약 문구 보강은 OQ-U4-NFR-4로 남겼다. NFR1.3의 구분 없는 404와도 어긋나지 않는다

> R-04 Reviewer note: NFR4.13이 두 제한기의 저장 위치를 api 프로세스 메모리로 적고(`api/docs/share-links.md` 20·78·116행과 일치) 한계(재시작 초기화, 복제 N개면 한도 최대 N배)를 남겼다. 배포 전제 대조표도 근거와 맞는다: EC2는 `container_name` 고정, EKS는 `replicas: 1`·`Recreate`·HPA 없음(`deploy/README.md` 207행, `deploy.sh`의 `__REPLICAS__` → 1). 복제 확대는 팀장 결정 때 저장 방식을 함께 정한다고 담당을 밝혔다. NFR1.7에서도 이 한계를 참조한다

> R-05 Reviewer note: 「안내 중복 통과 조건」 G1~G7을 추가했다. G1~G4는 web 시험(상태별 `RecipientGuide` 개수, `showClaudeConnect={false}`, h1 개수, 첫 초점 대상)으로, G5~G7은 문구 검토 체크리스트와 #423 병합 뒤 대조로 통과·실패 기준이 분명하다. U4 축소 문구는 미결 표에 담당(U4)과 시점(받은 사람 화면 연결 전)과 제약(G5·G6 범위 안)을 적었다

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 파싱(UTF-8) | PASS: 유효한 JSON, 최상위 키 `stage`·`unit`·`upstream_ids`·`coverage` | 구조가 읽힌다 |
| 문서 `NFRx.y` ID와 traceability 대조 | PASS: 5개 요구사항 문서의 ID 중복 없음, 문서에만 있거나 traceability에만 있는 ID 없음 | 요구사항 표와 추적 파일이 서로 맞다 |
| 저장소 대조 | PASS: `isLinkTokenFormat`·`isGithubSourceUrl`·제한기 저장 위치·배포 복제 수 인용이 실제 파일과 일치 | 산출물이 인용한 10월 동작이 사실이다 |

### Summary

이전 Minor 5건은 모두 해결됐다. 기존 구현으로 확인되는 것(NFR1.12, NFR4.13, NFR1.11의 판정 기준)은 근거와 검증 기준을 더했고, 새 결정이 필요한 것(포트, 주소 끝 판정, AI 글 안 링크, C-12 문구, 축소 문구)은 담당·결정 시점·합의 전 처리를 갖춘 미결로 남겼다. URL 허용 범위 확대, AI 글 안 링크 정책, 잘못된 토큰의 400/404 처리를 임의로 확정한 곳은 없다.
