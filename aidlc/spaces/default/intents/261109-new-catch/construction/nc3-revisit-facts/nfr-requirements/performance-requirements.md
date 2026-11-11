# NC3 다시 볼 곳 사실과 작업 시각 — 성능 요구사항

입력:
- 기능 설계 `construction/nc3-revisit-facts/functional-design/`(functional-spec.md, rules.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR1, NFR6)
- 계약 `inception/contract-design/contract-summary.md`(C2·C4)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q4 A)

NC3는 새 GitHub·AI 호출을 만들지 않는다. 더해지는 일은 셋이다. worker 메모리 안의 계산, api 결과 검사, 본인 목록 정렬 조건 바뀜이다.

## 인셉션 NFR1(호출과 수집)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR1.1 | 파일 내용 식별값은 이미 받는 커밋 상세 응답의 `sha`에서 남긴다. 새 GitHub 호출, 새 쪽 넘김, 새 diff 요청이 없다. RevisitFacts는 GitHub·AI를 부르지 않는다. | 빌드와 시험: TheMe를 바꾸기 전·후로 분석해 GitHub 호출 수와 AI 호출 수(지금 종결·수집 로그의 값)가 같다. worker 시험: RevisitFacts가 호출 객체 없이 커밋 기록만 받아 돈다. | NFR1, BR1.1, BR2.1 |
| NFR1.2 | 분석이 끝난 뒤 사실을 다시 계산하거나 GitHub를 다시 읽지 않는다. 등록 뒤 새 칸을 고치는 경로가 없다. | 코드 검토: api·worker에 새 칸을 갱신하는 경로가 없다. api 시험: 재분석 뒤 기존 Catch의 사실·시각이 그대로다(S20). | NFR1, BR6.1, FR12.4 |
| NFR1.3 | RevisitFacts는 후보 하나의 커밋 기록만 한 번 훑는다. 다시 고친 곳은 (경로, 줄 글자) 사전을 쓴다. 비용은 그 후보 patch 줄 수에 비례하고, 커밋 쌍마다 다시 훑지 않는다. 시간 숫자 목표는 두지 않는다(NFR 설계 Q1, 2026-11-11 코드 생성 때 고침). | 코드 검토: 위 구조(한 번 훑기, (경로, 줄 글자) 사전, 쌍마다 다시 훑지 않음)를 본다. 빌드와 시험: TheMe 분석 종결 로그의 `elapsedSeconds`를 바꾸기 전·후로 함께 적어 기록만 한다(AI 호출 시간이 섞여 합격 기준으로 쓰지 않음). RevisitFacts만 따로 재거나 시험에서 시간을 단정하지 않는다. | NFR1, BR3.1 |

## 그 밖의 품질 요구

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR6.1 | 「다시 볼 곳」은 h3 「다시 볼 곳」 + 작은 글자 「본인만 확인」과 `ul`이다. 커밋 링크만 Tab 순서에 든다. 링크 글자는 식별값 앞 7자이고 화면 낭독기에 「(새 탭)」이 읽힌다(발행본 링크와 같은 숨은 글자). 사실이 없으면 제목과 칸을 그리지 않아 화면 낭독기에도 없다. | 화면 시험: 사실 있음·없음 두 경우의 요소와 숨은 글자를 본다(AC9.1.3, AC9.1.4). | NFR6, BR9.1, BR9.3, interaction-spec 6절 |

## 본인 목록 읽기

- 지금 질의에 정렬 조건만 바뀐다. 회원 조건과 `LIMIT`은 그대로다. 새 인덱스를 더하지 않는 결정과 다시 판단할 조건은 확장성 요구사항 NFR1.6에 있다(Q4 A).

## 결과 메시지 크기

- 사실은 Catch 하나에 30개까지다. 경로 1,024자, 한 사실의 경로·커밋 20개 상한(BR2.5)이 있어 결과 메시지 증가에 끝이 있다.
- 보통 경로 길이(수십 자)면 후보 하나에 몇 KB다. 지금 종결 로그의 `resultBytes`로 바꾸기 전·후를 함께 적는다.

## 해당하지 않는 것

- 응답 시간 목표(SLO)는 새로 두지 않는다. 지금 본인 목록·상세에도 수치 목표가 없고, 바뀌는 것은 정렬 조건뿐이다.

## Sources

- `construction/nc3-revisit-facts/functional-design/rules.md`(BR1.1, BR2.1, BR2.5, BR3.1, BR6.1, BR7.1, BR9.1, BR9.3), `functional-spec.md` W1·W3·6절
- `inception/requirements-analysis/requirements.md` NFR1, NFR6
- `inception/contract-design/contract-summary.md` C2·C4
- `inception/refined-mockups/interaction-spec.md` 6절
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc3-revisit-facts/nfr-requirements/nfr-requirements-questions.md` Q4
