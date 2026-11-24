# Logical Components — u3-reader-views

근거: 기능 설계 `functional-design/frontend-components.md`(검토 review-01), 구성 요소 `inception/domain-design/components.md`(TabStrip·SnapshotViewer·RecipientScreen·PublicationDetailScreen·MaterialsScreen), 계약 `inception/contract-design/contract-summary.md` P-3, 이 단계 `performance-design.md`·`security-design.md`.

새 배포 단위·새 인프라·새 api 호출은 없다. web 배포에 들어간다.

## 부품과 실패 범위

| 논리 부품 | 자리 | 기대는 것 | 실패하면 | 영향 범위 |
|---|---|---|---|---|
| TabStrip(새, 공용) | `web/src/components/tab-strip/` | 없음 | — | 받은 사람 화면·작성자 상세·텍스트 자료 화면 셋. 바꾸면 세 화면 시험을 함께 돌린다 |
| 사본 보기(탭) | `features/publications/snapshot-view.tsx` | 사본(U1 칸 포함) | 칸이 어긋나면 응답 해석에서 조회 실패 | 받은 사람 화면·작성자 상세 |
| 출처 이동 공용 함수(새) | `features/publications/snapshot-jump.ts` | 사본, `resolveEvidenceTarget` | 대상을 못 찾으면 지금처럼 아무것도 하지 않음 | 두 화면 |
| 응답 해석 | `publications-api.ts`(`isPublishedItem`), `recipient-api.ts`(`pickItem`) | U1 응답 | 조회 실패 화면 | 두 화면. 다른 칸 처리는 바꾸지 않는다 |
| 받은 사람 화면 자리 | `features/recipient/recipient-view.tsx`(`RecipientSlots` 나눔) | AI 요약·질문하기·JD 패널 | 각 패널의 지금 실패 처리 그대로 | 받은 사람 화면 |
| 텍스트 자료 화면 탭 | `features/materials/` | TabStrip | 탭 거절 때 초점 그대로(Q1 A) | 텍스트 자료 화면 |

## 공유하는 것

- TabStrip은 세 화면이 함께 쓴다. 자료 화면의 지금 `data-testid`(`materials-tab-text`·`materials-tab-pdf`)와 탭 이름을 그대로 넘겨 지금 자료 화면 시험이 그대로 돈다.
- `isPublishedItem`은 작성자 목록·상세·발행 결과 응답도 쓸 수 있다. 프리셋 칸을 요구하는 검사가 발행본 목록 같은 다른 응답을 깨지 않는지 코드 생성이 쓰는 곳을 찾아 확인한다(사본 항목 검사만 바꿈).
- 받은 사람 화면의 AI 요약·질문하기·JD 패널(다른 담당의 부품)은 자리만 옮기고 안은 바꾸지 않는다.

## Assumptions & Open Questions

None.

## Sources

- 기능 설계 `frontend-components.md`, 검토 review-01
- 구성 요소 TabStrip·SnapshotViewer·RecipientScreen·PublicationDetailScreen·MaterialsScreen
- 계약 P-3
- 이 단계 `performance-design.md`·`security-design.md`
