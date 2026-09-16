# review-brief 설치 점검 — 2026-09-16

관련 작업: #37, PR #58, intent `260914-catchu-october-mvp`의 feasibility 작성 전 확인.

## 결론과 변경 범위

**원인에 대한 소스 수정과 임시 빌드 검증은 완료했지만, 설치 정상화는 미완료다.** 동일 버전 수정 빌드를 설치하면 배포본 무결성 검사가 실패하므로 원본 실행 파일로 복원했다. 공식 산출물 작성 전 확인·단계 승인은 진행하지 않았다.

- 설치 명령/런타임 및 프로젝트 스탬프: 모두 **2.8.1 유지**. 업데이트·refresh를 실행하지 않았다.
- 제품 문서 변경과 분리한 수정: `.codex/tools/aidlc.ts`의 `loadDelegate`에 `TOOLS.reviewBrief` → 기존 `aidlc-review-brief.ts` import 등록 **두 줄** 추가.
- 요약/리뷰 내용 생성 함수, 단계 연결, 상태·감사·승인 로직은 변경하지 않았다. 과거 승인·질문 답변을 소급 수정하지 않았다.
- 재현 가능한 읽기 전용 검사: `scripts/test-aidlc-review-brief.mjs`.

## 실패 명령과 이전 기록 대조

```sh
aidlc engine review-brief summary --stage feasibility --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/feasibility-questions.md
```

오류: `aidlc-review-brief.ts does not export main(argv)` (종료 1).

실제로는 해당 파일에 `export function main(argv: string[]): void`가 있다. CLI 명령 등록도 있지만 컴파일 실행기의 `loadDelegate` 분기에는 등록이 없어 `null`이 반환된다. 오류 메시지는 이 경우와 진짜 함수 누락을 구분하지 않는다. 설치 배포 소스와 프로젝트의 `aidlc.ts`가 수정 전 동일함도 확인했다.

| 기록 | 이번 오류와의 관계 |
|---|---|
| 이전 intent 감사 `260909-catchu-definition-review/audit/macui-macbookpro-local-fc6dadc9c037.md`, 2026-09-09T04:21:27Z | 같은 등록 누락 진단이 남아 있다. 당시 설치 해결을 입증하는 기록은 아니다. |
| 현재 intent의 `ideation/intent-capture/memory.md`, 2026-09-14T07:14:13Z | summary와 review에서 동일 오류, runtime-graph 생성 후에도 재현, 미해결 기록. 이전 대응은 독립 리뷰 원문 직접 제시였으며 전역 생략 규칙으로 승격하지 않았다고 명시한다. |
| 현재 intent 감사 `macui-macbookpro-local-3cf6d8f9dcd7.md`, 2026-09-14T07:14:02Z | 사용자의 “후속 단계에서 생략 규칙으로 저장하지 말라”는 지시. 뒤늦은 답변 기록 시도는 새 human reply 없음으로 거부됐으므로 성공한 승인으로 세지 않는다. |

이번에는 사용자의 명시적 설치 점검·최소 수정 요청에 따라 소스를 대조했다. 이전 단계의 출력 대체를 재사용하지 않았다.

## 수정·검증·복원

설치된 2.8.1의 Codex 배포 소스만 임시 경로에 복사하고 동일한 두 줄 패치를 적용했다. 재귀 비교에서 달라진 파일은 `tools/aidlc.ts` 하나였다. 기존 설치된 Bun 1.4.2로 컴파일했으며 새 도구 설치·소스 다운로드는 하지 않았다.

```sh
bun build --compile <임시 배포 소스>/tools/aidlc.ts --outfile <임시 경로>/aidlc
node scripts/test-aidlc-review-brief.mjs <임시 경로>/aidlc /Users/ljm/Desktop/github/CatchU-feasibility aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/feasibility-questions.md
```

검사 7개 통과: 버전, summary, context, review 출력, questions-file 누락 거부, intent 외부 파일 거부, 잘못된 stage 거부. 검사 전후 현재 intent 전체 파일 목록·내용 해시와 프로젝트 버전 스탬프가 동일했다. `review --why first`는 출력 경로 검사일 뿐 실제 리뷰 완료·품질 판정이 아니다.

설치 파일 교체 권한 확인 후 원본을 백업하고 임시 빌드로 교체했다. 정상 `aidlc` 진입점에서도 위 7개 검사가 통과했으나 `aidlc doctor`가 `Installed runtime 2.8.1 is incomplete: executable does not match version.json`으로 실패했다.

설치 소스 `aidlc-lifecycle.ts`의 `installVersion`은 동일 버전의 기존 asset 해시가 다르면 거부한다. 따라서 배포본 `version.json`의 해시나 VERIFIED 기록을 직접 변경하지 않았고, 같은 버전 재설치로 안전하게 해결됐다고 주장하지 않는다. 권한 확인 후 원본 실행 파일로 복원했다.

| 대상 | SHA-256 |
|---|---|
| 원본 실행 파일 및 복원 후 파일 | `4ef0db7501adbdb0e8a1ed25600d51ae074eaa6e7f70c81a9491a751328f14aa` |
| 임시 수정 빌드 | `0f3c5888ea936605a6a7392efc4276d12ac9db58ac3b9c36d3fc02f140d883f4` |
| 변경하지 않은 프로젝트 스탬프 | `11b711cbaa45fd4ed751da755ec7015f65e93bcc9a3ca5a5fbc44b2047b7c85d` |
| 변경하지 않은 현재 intent 상태 파일 | `d39e5da82506b9e0d99140a36241d2ecfd4a2e8cd5b3e37bb0098435c4adc868` |

원본 백업: `/Users/ljm/.local/share/aidlc/versions/2.8.1/aidlc.before-review-brief-20260916`.
임시 빌드/소스: `/private/tmp/catchu-aidlc-review-brief.Jaw3zr` (프레임워크 자료만 포함, 제품 실험 원문 없음). 빌드가 작업 루트에 남긴 잔여 실행 파일은 이 임시 경로로 이동했다.

복원 후 doctor: 설치 불일치 문제 해소, 0 problems. 최신 버전 안내·미커밋 기록·runtime-graph 미생성 3 warnings는 기존 경고다. 그 경고를 없애려고 버전·상태를 변경하지 않았다. 원래 등록 누락은 복원된 배포 바이너리에 남아 있으므로 **정상화 완료가 아니다**.

## refresh 및 다음 조치

- 프로젝트 refresh 시 `.codex/tools/aidlc.ts`의 두 줄이 덮어써질 수 있다. 동일 2.8.1을 유지한다면 재적용 대상이지만, **프로젝트 소스 패치만으로 설치된 바이너리가 바뀌지는 않는다**. 테스트 스크립트·이 점검 기록은 프로젝트 관리 파일이다.
- 향후 수정된 공식 배포본을 쓰려면 별도 버전 변경 승인이 필요하다. 이번에는 실행하지 않는다.
- 버전 변경 없는 대안은 `review-brief`에만 한정하여 동일 버전의 기존 도구를 실행하는 별도 진입점 보완이다. 이는 공식 배포본 교체와 다른 로컬 유지보수 방식이므로 적용 전에 사용자에게 방향을 확인한다. 승인/감사/상태 명령은 기존 경로를 유지해야 한다.
- 그 대안도 채택하지 않으면 소스 패치·검증만 보존하고 설치 오류 해소를 기다린다. 어느 경우든 실제 요약 안내 정상 출력 후에만 원래 작성 전 확인을 다시 제시한다.
- 이번 사용자 답변은 누락 영향 기준 정리에 대한 동의 및 설치 수정 요청이다. feasibility 공식 승인·시간 배정·LLM 추가 API 호출 승인이 아니다. LLM 재검증 2~4시간은 추정치로 유지한다.
