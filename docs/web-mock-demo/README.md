# 9/30 CatchU web 모의 시연 — 팀원 착수 안내

2026-09-21 승인 계획 공유 · `260920-catchu-web-mock` · express / Minimal

9/30까지 합성 자료로 연결된 화면 흐름을 시연한다. 이 문서는 팀이 같은 범위·담당·검사 기준으로 첫 작업을 준비하기 위한 안내다. 실제 앱/CI 구현과 타인 재현이 끝났다는 보고가 아니다. 일정은 목표이며 달성을 보장하지 않는다.

읽는 순서: 이 안내 → [요구사항 참조](requirements-reference.md) → [구현 계획](code-generation-plan.md) → [테스트 지침](unit-test-instructions.md). 출처·판본·사본 편집 기준은 [provenance](provenance.md)에 있다.

## 최신 착수 순서

- **팀원 1:** 승인 요구사항 안에서 시연할 화면·이동 순서·화면별 핵심 내용을 먼저 구체화한다. 그 정리가 끝난 뒤 CI를 작성한다. CI 착수 날짜는 미정이다. 모든 화면의 디자인이나 구현 완성을 기다리는 조건이 아니다.
- **팀원 3:** 최소 web 골격은 위 정리나 CI 착수·완료를 기다리지 않고 진행할 수 있다. 팀원 1의 페어링·동시 지원·새 숙련도/지원시간 조사는 시작 조건이 아니다.
- **첫 코드 PR:** 골격이 먼저 준비되면 같은 PR의 골격 검토와 타인 로컬 재현을 진행할 수 있다. CI를 뒤에 추가해 최종 **S+CI 구성**을 유지한다. 실제 CI 통과와 타인 승인 전에는 첫 병합이 대기한다.
- **A/B/C/D:** 골격 인터페이스가 준비되면 fixture로 각자 작성한다. A는 팀원 2, B는 팀원 4, 홈을 포함한 D와 C는 팀원 3이다. 기존 실제 MVP의 기능 책임은 바뀌지 않는다.

정상 흐름: 모의 로그인·프로필 → 홈 → 모의 GitHub 연동 → 자산 GitHub 탭 → 저장소/동의 → 분석 진행/완료 → Catch 목록/상세/근거 → 별도 공개 → 링크 발행 → 비로그인 수신자.
실패 후 명시적 분석 재요청만 포함한다. 완료한 분석의 재분석은 없다. 비밀번호는 링크 발행 시만 설정하며 변경하려면 기존 링크 중단 후 새 URL을 발행한다.

## 팀원별 첫 작업

검토자는 아래 제안이며 실제 수락·승인이 있었다는 뜻이 아니다. 각 작성자가 자기 검사·결함 수정을 책임진다.

| 담당 | 첫 작업·결과물 | 파일 경계 | 착수·완료 기준 | 검토자 제안 |
|---|---|---|---|---|
| 팀원 1 `ljm0850` | 시연 화면 순서표: 화면/경로, 보여줄 핵심 내용, 다음 이동, FR/NFR 대응. 그 정리 후 CI | 순서표는 문서로 제출할 경우 이 폴더에 후속 문서 PR로 추가(제안명 `demo-sequence.md`); CI는 `.github/workflows/web-pr.yml`, README의 CI 설명 | 순서표는 합성 정상 흐름과 시연할 필수 분기를 설명하고 승인 범위 밖 기능을 추가하지 않음. 작성 후 CI 착수 가능. CI 완료는 첫 코드 PR에서 실제 G0 성공·실패 차단 확인 | CI: 팀원 4, 팀원 2 대안. 순서표는 해당 화면 담당과 비동기 대조 |
| 팀원 3 `csyg0616` | S 최소 골격: 실행 틀·모의 배너·seed 1개·저장 어댑터·runner·README | `web/package.json`/lock/config, `src/app/layout.tsx`/root page/styles, `src/components/mock-banner.tsx`, `src/lib/mock/`, `src/test/setup.ts`/shared tests | CI와 독립 착수. 로컬 설치·실행/종료·TS·G0 통과와 안내 문서. 전체 로그인·분석·링크 기능은 골격에 넣지 않음. 병합은 CI 후 | 팀원 2, 팀원 4 대안 |
| 팀원 2 `yeongyeon1802` | A: 로그인·프로필·GitHub 연동·홈 이동 계약 | `web/src/features/profile/`, `src/app/login/`, `src/app/(owner)/layout.tsx`·`profile/`, profile tests | S 인터페이스 이후 fixture로 작성. FR1, TA·G0. 홈 렌더/UI 검사는 D 소유 | 팀원 4 |
| 팀원 4 `leechaeah` | B: Catch 목록/상세·근거/질문·확인/불일치·별도 공개/숨김 | `web/src/features/catches/`, `src/app/(owner)/assets/page.tsx`·`assets/[catchId]/`, catches tests | S 이후 D 결과 fixture로 독립 작성. FR4/5/6, TB·G0. 확인/불일치 취소가 자동 공개로 이어지지 않음 | 팀원 2 |
| 팀원 3 후속 D | 홈 → 저장소/동의 → 분석 상태·실패 후 재요청 | `web/src/features/home/`·`analysis/`, `src/app/(owner)/home/`·`assets/github/`·`analysis/`, home/analysis tests | S 후 A 상태 계약 fixture 사용. FR1/2/3, TD·G0. 완료/조회 실패는 재조회만 | 팀원 2 |
| 팀원 3 후속 C | 링크 발행/관리·수신자 목록/상세 | `web/src/features/links/`, `src/app/(owner)/links/`, `src/app/s/[token]/`, links tests | D 정상 경로 이후 C 정상 경로. A/B 계약 fixture 사용 가능. FR7/8, TC·G0 | 팀원 4 |

표에서 `src/`는 `web/src/`다. 상세 파일 목록과 순서는 구현 계획 OQ4/Step 1~12를 따른다.

공통 package/lock·runner·root layout·mock storage/seed·README 틀은 팀원 3이 조율한다. 기능 담당은 필요한 인터페이스/의존성 변경을 PR에서 알리고 lockfile 동시 편집을 피한다. A가 profile/연동 상태를 제공하고 D 홈이 이를 표시한다. D 결과와 B Catch는 안정 ID·상태 계약으로 연결한다. CI 파일은 팀원 1이 담당한다.

## 검사 명령과 완료

아래 명령은 **각자의 clone에서 `cd web`한 뒤**, S가 package/lock/scripts를 작성한 이후 실행한다. 현재 문서 PR에는 앱 패키지가 없으므로 지금 명령이 실행 가능한 상태라고 가정하지 않는다.

계획의 도구 조합은 Node 24.21.0 / npm 11.19.0 / Next 16.3.5 / React 19.3.0 / Vitest 5.0.1이다. S에서 실제 호환 조합과 추가 의존성 exact 버전을 검증·고정한 후 다른 작성자/CI는 lockfile로 재현한다. 실제 OAuth/API key·DB는 필요하지 않다.

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

같은 주소에서 모의 화면 확인 후 Ctrl+C로 종료한다. G0는 CI 준비 여부와 무관하게 로컬에서 수행한다.

```sh
npm run lint
npm run typecheck
npm run test -- src/test/web-mock/
npm run build
```

G0 전체에는 위 `npm ci`도 포함한다. build 이후 `npm run start -- --hostname 127.0.0.1 --port 3000`으로 실행·종료를 확인한다.

| 작업 | 해당 범위 검사 명령 |
|---|---|
| S / TS | `npm run test -- src/test/web-mock/shared/model.test.ts src/test/web-mock/shared/storage.test.ts src/test/web-mock/shared/shell.test.tsx` |
| A / TA | `npm run test -- src/test/web-mock/profile/model.test.ts src/test/web-mock/profile/repository.test.ts src/test/web-mock/profile/service.test.ts src/test/web-mock/profile/ui.test.tsx` |
| D / TD | `npm run test -- src/test/web-mock/home/ui.test.tsx src/test/web-mock/analysis/model.test.ts src/test/web-mock/analysis/repository.test.ts src/test/web-mock/analysis/service.test.ts src/test/web-mock/analysis/ui.test.tsx` |
| B / TB | `npm run test -- src/test/web-mock/catches/model.test.ts src/test/web-mock/catches/repository.test.ts src/test/web-mock/catches/service.test.ts src/test/web-mock/catches/ui.test.tsx` |
| C / TC | `npm run test -- src/test/web-mock/links/model.test.ts src/test/web-mock/links/repository.test.ts src/test/web-mock/links/service.test.ts src/test/web-mock/links/ui.test.tsx` |
| 연결 / TI | `npm run test -- src/test/web-mock/flow.test.tsx` |

test-after와 Minimal을 유지한다. 요구사항별 검사·컴포넌트 정상 경로·파일별 정상과 오류/경계 2개, lint/type/build는 필수다. 선택적 80% 커버리지를 추가하지 않는다. 정확한 테스트 설정·모의 데이터·M1~M5 수동 시나리오는 테스트 지침을 따른다.

로컬 성공은 CI 성공이 아니다. 첫 코드 PR 최종 SHA에서 G0가 실제 CI로 통과하고 타인 승인·리뷰 대화 해소가 있어야 merge commit으로 병합한다. 타인 재현은 골격 비작성자 팀원 2(대안 팀원 4) 제안으로, 새 폴더에서 안내만으로 설치·실행·종료·검사·작은 변경 PR을 실제 제출한 증거가 필요하다. 작성자 확인이나 이 문서 PR을 그 증거로 세지 않는다.

## 브랜치와 문서 PR

이번 공유 PR은 `docs/web-mock-team-handoff → dev`다. [문서 컨벤션](../CatchU_레포_컨벤션.md)과 [PR 양식](../../.github/pull_request_template.md)의 대상 규칙을 따른다. 앱·CI의 첫 S+CI PR과 별개의 문서 PR이다.

코드 작업은 `web/mock-skeleton`, `web/mock-ci`, `web/mock-a`, `web/mock-b`, `web/mock-d`, `web/mock-c`를 사용하고 `web/catchu-web-mock`에서 연결 검증 후 dev로 반영하는 승인 계획이다. 이는 기존 Construction 규칙의 intent 브랜치 예외이며 상시 web 중간 브랜치를 새로 운영한다는 뜻이 아니다. [현재 저장소의 Construction 규칙](../../aidlc/spaces/default/memory/org.md)을 함께 참조한다. PR #72의 dev 직접 PR 검토안을 채택했다고 해석하지 않는다.

각 팀원은 독립 checkout을 사용하고 공유 폴더에서 동시에 branch switch하지 않는다. 원격에 intent 브랜치가 공유된 후의 작업 예시는 다음과 같다(지금 존재한다고 가정하지 말 것).

```sh
git clone https://github.com/JminAILab/CatchU.git CatchU-web-mock
cd CatchU-web-mock
git fetch origin
git switch -c web/mock-a origin/web/catchu-web-mock
```

마지막 브랜치 이름은 본인 패키지에 맞춘다. 이미 같은 브랜치가 있으면 새로 만들거나 덮어쓰지 말고 기준과 상태부터 확인한다. 개인 branch 최신화는 적용되는 레포/Construction 규칙에 따르고, 보호 브랜치 반영은 타인 승인과 merge commit을 유지한다.

## 팀 착수 전에 남은 준비

이 목록은 공유 시점의 확인 범위다. 지속 상태는 Issue/Projects/PR에 남기며 이 문서를 일일 상태표로 사용하지 않는다.

- 원격 코드 intent 브랜치·팀원별 checkout과 기준 SHA 공유. 이번 PR은 문서 브랜치만 발행한다. 로컬 준비를 팀 전체 준비 완료로 간주하지 않는다.
- 팀원 1의 시연 흐름 정리 결과 작성, 그 뒤 CI 작성. CI 착수 날짜는 아직 미정이다.
- 팀원 3의 S 실제 구현·package/lock 및 README 작성과 로컬 검사. 전체 기능이나 CI 완료를 기다릴 필요는 없다.
- 제안 검토자·재현 담당의 실제 수락/실행 시점 확인. 골격 시작을 위한 새 숙련도·지원시간 조사나 페어링 조건은 추가하지 않는다.
- 첫 코드 PR 병합 전에 실제 CI·필수 검사 설정·타인 승인 확인. 문서 PR 생성은 이를 완료한 증거가 아니다.

기존 실제 MVP·C01/C02 조건은 유지된다. 실험 원문·키·모델 응답·대화 기록을 읽거나 포함하지 않는다.
