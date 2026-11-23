# Phase Check — Construction → Operation

**Verdict: PASS** — 네 단위 모두 만들고 시험했고, 코드 생성 검토는 모두 READY이며, 단위 사이 요구사항·수락 기준 관문이 통과했다. CI 관문은 Build and Test가 기록한 빌드·시험 명령을 돈다.

검사 시각: 2026-11-22. 근거: `construction/build-and-test/cross-unit-traceability.md`, 각 단위 `code-generation/traceability.json`·`reviews/`, `construction/ci-pipeline/quality-gates.md`.

| 단위 | 추적 파일 | 항목 | OK | N/A | 풀리지 않은 것 | 코드 생성 검토 |
|---|---|---|---|---|---|---|
| u1-preset-contract | `construction/u1-preset-contract/code-generation/traceability.json` | 117 | 92 | 25 | 없음 | READY(review-01) |
| u2-applicant-screens | `construction/u2-applicant-screens/code-generation/traceability.json` | 83 | 78 | 5 | 없음 | READY(review-01, 되돌아가기 1 review-02) |
| u3-reader-views | `construction/u3-reader-views/code-generation/traceability.json` | 53 | 45 | 8 | 없음 | READY(review-01) |
| u4-privacy-policy | `construction/u4-privacy-policy/code-generation/traceability.json` | 7 | 7 | 0 | 없음 | READY(review-01) |

- 단위 사이 관문: `cross-unit-traceability.md` 판정 통과, 빠진 ID 0개.
- 시험: Build and Test 두 번째 실행(885f9714)에서 모든 빌드·시험 명령 통과, 줄 커버리지 api 98.46%·web 92.87%. 되돌아가기 1회(U2, `test-results.md` 「Loop-Back Log」).
- CI: `quality-gates.md`의 병합 전 관문이 Build and Test의 web·api lint·typecheck·전체 시험·build 명령과 같다. 커버리지는 CI에서 재지 않는다(CI Pipeline Q1 A).

## 남은 것(막지 않음)

| 항목 | 누가·언제 |
|---|---|
| 실제 브라우저로 못 본 것: U3 다른 탭 출처 이동, 「저장했습니다.」의 화면 낭독기 읽힘, U2 개발 모드 멈춤, 자료 화면 거절 초점 | 팀장, dev PR 본문에 적음 |
| dev PR 본문: 배포 전 파일 지우기 안내(U1 NFR2.15), 받아들인 한계(320px 회원 머리글 넘침, U2 검토 Minor 1·3) | dev PR 작성 때 |
| main 배포 전 `members/*/publications/` 파일 지우기 | 팀장 |

- [ ] 사람 확인(CI Pipeline 승인으로 대신한다)
