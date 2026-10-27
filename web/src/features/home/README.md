# 로그인 후 홈 (D, #155)

`/home`의 연결 상태 안내와 다음 행동 이동이다. 근거는 [홈 흐름 초안](../../../../docs/ai-dlc-input-mvp/CatchU_서비스홈_흐름_와이어프레임_초안.md) §5.3·§5.4·§6.2와 #155 완료 기준이며, 초안의 문구·배치는 [제안] 지위 그대로다.

## 파일

| 파일 | 역할 |
|---|---|
| `home-readiness.ts` | 조회 결과 → 표시 상태 판정(순수 함수). 상태별 상태 이름·문구·단계·다음 행동 |
| `use-home-readiness.ts` | `GET /v1/me` 조회와 재조회. 저장소 연결 관리(#153)의 `githubState()`를 그대로 쓴다 |
| `home-guide.tsx` | 연결 안내 표시 컴포넌트. 받은 내용만 그린다 |
| `home-member-page.tsx` | 조회 중·조회 실패·연결 안내와 다음 행동 버튼을 조립한다 |
| `home.module.css` | 홈 스타일. 전역 색·글꼴 변수만 쓴다 |

## 표시 규칙

| 조회 결과 | 상태 이름 | 표시 | 다음 행동 |
|---|---|---|---|
| 조회 중 | — | ‘계정 연결 상태를 확인하고 있습니다’ | 없음 |
| 조회 실패·계약과 다른 응답 | — | ‘계정 연결 상태를 확인하지 못했습니다’ + [다시 불러오기] | 같은 조회만 다시 보낸다 |
| `DISCONNECTED` | GitHub 미연결 | 단계 표시(현재: GitHub 연결) + 연결 안내 | [프로필에서 GitHub 연결] → `/profile/github`. 전환 꺼짐: 비활성 + 이유 |
| `REAUTH_REQUIRED` | GitHub 재연결 필요 | 단계 표시(현재: GitHub 연결) + 재확인 안내 | [GitHub 다시 연결] → `/profile/github`. 전환 꺼짐: 비활성 + 이유 |
| `CONNECTED` | GitHub 연결됨 | 단계 표시 없이 관리 안내 | [내 자산에서 저장소 연결 관리] → `/assets` |

- 조회 중·조회 실패는 미연동으로 표시하지 않는다(#155 완료 기준).
- 미연동·재연동 필요의 목적지는 GitHub 연동 화면(`/profile/github`, [#253](../github-connection/README.md))이다. 공통 인증 통합 시험 전환(`NEXT_PUBLIC_AUTH_SESSION_INTEGRATION`)을 끈 제품 기본값에서는 GitHub에 다녀오면 로그인이 사라져 연결을 마칠 수 없으므로, 두 버튼을 비활성(`unavailable`)으로 두고 연동 화면과 같은 이유를 버튼 아래에 보인다(`aria-describedby`). 기준과 문구는 #253의 `githubStartBlockedReason`이며 `use-home-readiness.ts`가 `homeView()`에 넘긴다. 전환을 켜면 연동 화면으로 이동한다.
- 재연동 필요의 안내 방식은 초안 §6.2에서 [미정]이다. 지금은 미연동과 상태 이름·문구·버튼 이름을 구분하고 같은 연동 화면을 가리킨다.
- `/me` 조회는 회원 가드의 조회와 별도로 한 번 더 보낸다(`/assets`의 저장소 연결 관리와 같은 방식).

## 인증 연결 기준과 후속

- 현재 조회는 dev의 기존 회원 호출(`api.member`, 메모리 토큰)과 회원 가드 기준이다. 아래 검사와 브라우저 확인도 **공통 인증 통합 시험 전환(#308 `auth-integration`)을 끈 상태** 기준이다.
- **후속(#308 전환 시):** 홈의 `use-home-readiness.ts`는 메모리 토큰 저장소로 세션을 구분한다. 전환을 켜면 공통 인증의 세션 범위·`skipped`(보내지 않은 요청·이전 세션 응답) 처리에 맞춰 홈 조회를 연결하고, 조회 중·실패·재시도·세션 변경을 다시 검증해야 한다. #308이 자산·링크 화면에 한 연결과 같은 작업이며 이 PR에는 포함하지 않는다.

## 아직 하지 않는 것

- **‘저장소 연결 전’·‘준비 완료’ 판정:** 분석 접수 저장소 유무를 홈에 전달할 최소 데이터가 미결이다(#155 `선행 조건과 미결`). 정해지기 전에는 `CONNECTED`를 저장소 연결 여부를 단정하지 않는 안내로만 보인다. 분석 이력 API(#372)를 홈에서 쓸지는 A/E와 별도로 정한다.
- 분석 상태·결과·집계, 공유 링크 상자, 12월 피드(초안 §5.1·§5.5·§5.6).

## 외형 보완

- 바꿔도 되는 곳: `home-guide.tsx`의 마크업, `home.module.css`, `home-member-page.tsx`의 배치와 `HomeActionButton`의 모양.
- 바꾸지 않는 곳: `home-readiness.ts`의 상태 판정·상태 이름·이동 대상·비활성 이유, `use-home-readiness.ts`의 조회·재조회, 비활성 버튼의 `disabled`·이유 연결. 바꿔야 하면 #155에서 먼저 조율한다.
- 조회 중·조회 실패가 연결 안내처럼 보이지 않게 하고, 단계 표시는 현재 단계를 시각만이 아니라 `aria-current`로도 구분한다.

```tsx
<HomeGuide status={view.status} step={view.step} title={view.title} description={view.description}
  action={<HomeActionButton action={view.action} />} />
```

## 검사

- `npm test`의 `test/home-readiness.test.mjs`: 조회 중, 세 연동 상태의 상태 이름·단계·다음 행동(이동 대상, 전환 꺼짐의 비활성과 이유), 미연동과 재연동 필요의 구분, ‘연결 전’ 표기 미사용, 조회 실패·통신 오류·계약과 다른 응답(연동 필드 없음·알 수 없는 값)이 미연동이 아닌 조회 실패가 되는지. 합성 응답이며 실제 로그인·API 연결은 검사하지 않는다.
- 브라우저 확인 기록은 #155 PR에 남긴다.
