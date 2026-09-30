# 저장소 연결 관리 (D, #153)

내 자산 Catch 탭 위쪽의 **GitHub 저장소 연결 관리** 영역과 모달이다. 정본은 [web 기능 설계 「내 자산 화면 구조」·「화면 상태 전이」](../../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md)이며, 상태 아이콘과 B 연결 방식은 [#153 입출력 제안](https://github.com/JminAILab/CatchU/issues/153#issuecomment-5868058724)을 따른다.

## 파일

| 파일 | 역할 |
|---|---|
| `repository-api.ts` | `GET /me`·`/me/repositories`·`/analysis-requests` 조회와 응답 검증. 목록은 `nextCursor`를 끝까지 따라간다(최대 20페이지) |
| `repository-status.ts` | 저장소별 최신 요청 선택, 이름 결합, 상태 아이콘·설명 문구, Catch 보기 조건. 화면과 분리한 순수 함수 |
| `repository-management.tsx` | 영역과 모달. B의 콜백을 부른다 |
| `repository-management-preview.tsx` | 상태별 모의 응답으로 B 화면과 함께 보는 개발 도구(`/preview/repository-management`) |

## 조립

B의 `AssetsConnected`가 주는 `repositoryManagement` 자리에 넣는다. 호출 함수는 #106의 `api.member`를 그대로 쓴다. 실제 `/assets` 제품 페이지는 아직 없으며, B와 담당을 정해 조립한다.

```tsx
const repositoryApi = createRepositoryApi(api.member); // 모듈 단위로 한 번 만든다

<AssetsConnected api={catchApi} repositories={...}
  repositoryManagement={(bindings) => <RepositoryManagement api={repositoryApi} bindings={bindings} />} />
```

| 조작 | B 콜백 |
|---|---|
| [연결 관리]로 모달 열기 | `onOpen()` 먼저 → Catch 상세를 닫는다 |
| 닫기·X·Esc·바깥 클릭 | `onClosed()` → 현재 필터로 목록 다시 불러오기 |
| [이 저장소 Catch 보기] | `onShowRepository(repositoryId)`만 부른다(`onClosed` 중복 없음) |

모달 아래쪽 「연결할 수 있는 저장소」는 `connectSection`으로 #154가 채운다. 넘기지 않으면 준비 중 안내만 보인다.

## 표시 규칙

- **연결된 저장소:** 분석 접수 이력이 있는 저장소. 이름은 `/me/repositories` 선정 목록과 `repositoryId`로 합치고, 목록에 없으면 식별자로 표시한다. 선정 목록과 이력 중 하나라도 조회에 실패하면 부분 목록 없이 조회 실패로 보인다.
- **최신 요청 [제안]:** 저장소별로 `submittedAt`이 가장 늦은 요청, 같으면 `updatedAt`이 늦은 요청. E 담당 확인 대기.
- **아이콘:** 처리 중·실행 불명·반영 전(반영 대기·반영 중·반영 실패·복구 중)은 분석 중, 반영 뒤 성공·부분 실패, `FAILED`는 반영 상태와 무관하게 실패.
- **설명:** 실행 불명·반영 실패·복구를 분석 실패나 재요청 가능으로 쓰지 않는다. 성공 0건은 ‘검토할 Catch가 없습니다’. `FAILED`·`NOT_READY`는 반영 설명을 붙이지 않는다(E 확인 대기).
- **Catch 보기:** `ownerResultsReady`이고 `registeredCatchIds`가 1개 이상일 때만.
- **재요청:** 화면이 판단하지 않고 `retry.allowed`가 참일 때 안내 문구만 보인다. 버튼과 새 동의는 #154.
- **GitHub 미연동·재연동 필요:** [연결 관리] 대신 `/profile/github`로 가는 링크를 보인다. 연동 뒤 돌아오는 경로와 모달 자동 열기는 A 연동 화면(#133·#137)과 정한다.
- 모달 열림은 주소에 남기지 않는다 [제안]. 상태는 자동으로 다시 조회하지 않고 [상태 새로고침]으로 다시 불러온다.

## 검사

`npm test`의 `test/repository-management.test.mjs`: 조회·페이지·검증 실패, 최신 요청 선택, 이름 결합, 아이콘 조합, 설명 문구, Catch 보기 조건.
