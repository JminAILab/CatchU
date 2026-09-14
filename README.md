# CatchU (캐치유)

개발자 구직자의 GitHub 활동에서 **증거카드**를 추출해,
구직자에게는 면접 준비 자산으로, 기업에게는 서류·면접의 판단 근거로 제공하는 양면 플랫폼.

## 구조

| 디렉터리 | 역할 | 스택 |
|---|---|---|
| [`web/`](web) | 사용자 화면 | Next.js |
| [`api/`](api) | API 서버 | NestJS |
| [`worker/`](worker) | 분석 워커 — 수집·카드 추출 | FastAPI |
| [`docs/`](docs) | 문서 정본 | — |
| [`docs/ai-dlc-input/`](docs/ai-dlc-input) | AI-DLC 시작 시점(2026-09-09) 입력 문서 스냅샷 | — |
| [`docs/ai-dlc/`](docs/ai-dlc) | AI-DLC 설치·운영 안내 | — |
| [`aidlc/`](aidlc) | AI-DLC 워크플로우 기록 — 단계별 질문·답변, 승인된 산출물, 감사 로그, memory | — |
| `.codex/` `.agents/` | AI-DLC 하네스(Codex hook·도구·스킬·규칙). `aidlc config`로 관리하며 팀 수정분은 커밋 이력에 기록 | — |

최상위 디렉터리는 **배포 단위**와 1:1로 대응한다.
스택 열의 Next.js·NestJS·FastAPI는 검토안이다(레포 컨벤션 §1 참조). `aidlc/`·`.codex/`·`.agents/`는 배포 단위가 아니라 AI-DLC 작업 기록과 도구다.

## 문서

팀 문서 정본은 [`docs/`](docs)에 있다. 문서 목록과 읽는 순서는 [`docs/README.md`](docs/README.md).
AI-DLC로 검토·승인한 산출물(현재는 요구사항 문서)은 [`aidlc/`](aidlc) 아래 intent 폴더에 있다. `docs/`와 AI-DLC 산출물의 관계는 [`docs/README.md`](docs/README.md)의 「AI-DLC 산출물과의 관계」를 따른다.

## 팀

재민아이(JAEMIN_AI) · 인공지능사관학교 기업연계 파이널 프로젝트 (2026-08 ~ 12)