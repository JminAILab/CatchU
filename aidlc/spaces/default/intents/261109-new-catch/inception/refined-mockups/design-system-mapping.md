# 새 Catch — 화면 모양 대응표

CatchU에는 따로 된 디자인 시스템 꾸러미가 없다. 화면은 기능마다 CSS 모듈(`web/src/features/assets/assets.module.css`, `web/src/features/publications/publications.module.css`)과 공통 값(`web/src/app/globals.css`의 `--color-*`, `.visually-hidden`)을 쓴다. 새 부품은 이 모양을 그대로 쓰고, 꼭 필요한 하나(h5)만 더한다.

근거:
- 대략 화면 `ideation/rough-mockups/wireframes.md`(반응형·접근성은 기존 기준, Q6)
- 사용자 흐름 `ideation/rough-mockups/user-flow.md`
- 요구사항 `inception/requirements-analysis/requirements.md` NFR6
- 이 단계의 답 Q1~Q4

## 새 부품과 쓰는 모양

| 새 부품 | 화면 | 쓰는 지금 모양 | 새로 더하는 것 |
|---|---|---|---|
| 「작성자 설명」 선택 칸 | 본인 목록 | `assets.module.css` `.filters`·`.filter`(이름이 위에 붙은 `select`) | 없음 |
| 개수 줄 | 본인 목록 | `.count` + `aria-live="polite"`(지금 그대로) | 없음 |
| 빈 결과 안내 | 본인 목록 | 지금 `StateMessage`(제목 + 한 줄) | 없음 |
| 칸 제목 8개와 글칸 | 지원자 상세 | 글칸은 `.descriptionInput`(지금 그대로), 칸 제목은 발행 화면 `.field`처럼 위에 굵은 글자 | `assets.module.css`에 칸 제목 줄 모양 하나(`.field`와 같은 값). 글칸 높이는 3줄로 시작(Q1 A) |
| 안내 문장들 | 지원자 상세 | `.small` | 없음 |
| 발행하면 면접관에게 열릴 링크 | 지원자 상세 | h4(지금 `.evidence h4`와 같은 14px) + 목록, `.small` 안내 | 없음 |
| 합계 글자 줄 | 지원자 상세 | `.small`(지금 그대로, 글만 「(칸 제목 포함)」 더함) | 없음 |
| 다시 볼 곳 | 지원자 상세 | `.detailSection` + h3 + `.small` 「본인만 확인」(지금 「생각해 볼 질문」과 같은 꼴) | 없음 |
| 다시 볼 곳 커밋 링크 | 지원자 상세 | 링크 + `.visually-hidden` 「(새 탭)」(발행본 링크와 같은 꼴) | 없음 |
| 권장 안내 한 줄 | 발행 화면 | `publications.module.css` `.small` | 없음 |
| 「작성자 설명을 쓴 Catch만 보기」 | 발행 화면 | `.check`(지금 「비밀번호 사용」 체크 칸) | 없음 |
| 걸러 본 개수 줄 | 발행 화면 | 본인 목록의 개수 줄과 같은 꼴(가정) | 발행 화면 모듈에 개수 줄 모양 하나 |
| 항목 작은 줄의 저장소·「설명 안 씀」 | 발행 화면 | 단추 안 `.small`(지금 「공개 · 불일치 표시됨」 줄)에 이어 붙임(Q2 A) | 없음 |
| 빈 결과 안내 | 발행 화면 | 지금 「고를 수 있는 Catch가 없습니다.」와 같은 `p` | 없음 |
| 확인 단계 안내 | 발행 화면 | `.notice`(지금 비공개 Catch 안내와 같은 꼴) | 없음 |
| 저장소 줄 | 발행본 | `.small` 또는 `.muted` 한 줄 | 없음 |
| 작성 시점 | 발행본 | h4 안 작은 글자(지금 지원자 상세 h3 「작성자 설명」 옆 `.small`과 같은 꼴) | 발행본 모듈의 작은 글자 모양을 h4 안에서 씀 |
| 칸 제목 | 발행본 | — | **h5 글자 모양 하나**(Q3 A). h4(14px)보다 한 단계 작고 굵게. 정확한 값은 코드에서 정함 |
| 칸 글 | 발행본 | `.freeText`(`white-space: pre-wrap`, `overflow-wrap: anywhere`) | 없음 |
| 링크 이름 | 발행본, 지원자 상세 목록 | 지금 링크 글자 + `.visually-hidden` 「(새 탭)」 | 마우스를 올리면 주소 전체가 보이게 하는 것(새로 붙임) |
| 본인 커밋 표지 | 발행본 | 후보: `.kindBadge`처럼 둥근 작은 글자 | 모양은 기능 설계(NFR5). 작성자 글과 구별되고 색만으로 나타내지 않아야 함 |
| 이 기록으로 알 수 없는 것 | 발행본 | 굵은 글자 + 목록(지금 지원자 상세의 「이 근거로 알 수 없는 것」과 같은 꼴) | 없음 |
| 근거 강조 | 발행본 | `.highlight`(지금 그대로, 링크와 겹치면 링크 전체) | 없음 |

## 색과 글자

- 새 색은 없다. 안내는 `--color-muted`, 경고 꼴 안내는 지금 `.notice` 색을 쓴다.
- 새 글자 모양은 발행본 h5 하나다.

## 좁은 화면

지금 화면의 배치 규칙을 그대로 쓴다. 칸 제목을 글칸 위에 두므로(Q1 A) 좁은 화면용 배치를 따로 만들지 않는다. 화면 폭 기준은 내 자산 화면(`assets.module.css`)의 760px 하나이고, 발행 화면과 받은 사람 화면은 기준이 없다. 걸러 보기 칸은 760px 이하에서 세로로 쌓이고(`flex-direction: column`), 그 위에서는 자리가 모자라면 줄을 바꿔 놓인다(`flex-wrap: wrap`).

## Sources

- `ideation/rough-mockups/wireframes.md` 1~4절
- `ideation/rough-mockups/user-flow.md` 정보 구조
- `inception/requirements-analysis/requirements.md` NFR6
- `inception/refined-mockups/refined-mockups-questions.md` Q1~Q4
- 지금 코드: `web/src/features/assets/assets.module.css`, `web/src/features/publications/publications.module.css`, `web/src/app/globals.css`
