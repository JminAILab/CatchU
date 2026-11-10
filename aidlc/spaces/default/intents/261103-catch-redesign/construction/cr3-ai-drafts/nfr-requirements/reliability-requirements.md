# CR3 AI 쪽 — 신뢰성 요구사항

입력: 기능 설계(BR2.2·BR2.5·BR2.6·BR3.5·BR5.4·BR6.4), 요구사항 NFR2·NFR3.

## 인셉션 NFR2·NFR3에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR2.5 | 판정 호출은 자동으로 다시 시도하지 않는다. SDK의 다시 시도도 끈다. 실패한 Catch 판정은 설명 FAILED(실패 코드 JUDGEMENT_CALL_FAILED·JUDGEMENT_TIMEOUT·JUDGEMENT_RESPONSE_UNREADABLE), 제목·둘째 줄은 판정 없음이다. 실패한 재료 판정은 규칙 순서로 담고 Catch 판정은 그대로 보낸다. | 합성 판정이 실패를 돌려주면 같은 후보에 판정 요청이 다시 나가지 않는다(S7·S11·S15). | NFR2, BR2.2·BR3.5·BR5.4·BR6.4 |
| NFR3.1 | AI 쪽은 FR10 기준(틀린 제목 통과 0건, 틀린 문장 통과 1건 이하)을 넘었을 때만 운영에서 켠다. 판정 문턱은 0.9에서 시작한다. 못 넘으면 공급자를 `openai`(기본)로 두고 판정 키를 넣지 않은 채 합치고, 고지는 v2 그대로다. `claude` 공급자 설정도 넣지 않는다. | FR10 확인 기록(건수·결과·결정). 배포 설정에 `CATCHU_JUDGEMENT_PROVIDER=claude`·판정 키가 없다. | NFR3, BR9.3·BR8.1 |

## 실패 때의 결과

| 실패 | 제목 | 작업 사실 둘째 줄 | 설명 초안 |
|---|---|---|---|
| 판정 공급자 꺼짐(키 없음) | CR1 규칙 | 규칙 그대로 | 틀 문장 |
| Catch 판정 호출 실패 | 판정 없음(BR3.5) | 남김 | FAILED |
| 판정 시간 부족·상한 | 판정 없음 | 남김 | NOT_GENERATED + 요청 실패 1건 |
| 판정 답 일부 빠짐 | 빠진 질문만 판정 없음(BR2.5) | RECORD_WHAT이 빠지면 남김 | 빠진 문장은 버림 |
| 재료 판정 실패 | 영향 없음 | 영향 없음 | 재료가 규칙 순서 |

## 확인 사항

- 판정 공급자가 오래 멈추면 AI 쪽이 켜진 동안 설명 초안이 모두 FAILED가 된다. 끄는 방법은 공급자 설정에 따라 하나로 정한다(기능 설계 Q4 A, 따로 끄는 스위치 없음): `CATCHU_JUDGEMENT_PROVIDER`를 `openai`로 두거나 지우고(기본값이 openai) `CATCHU_JUDGEMENT_API_KEY`를 비운다. 공급자가 `claude`였어도 이 둘을 바꾸면 꺼진다. 생성 키(`CATCHU_GENERATION_API_KEY`)는 worker 기동에 필요하므로 지우지 않는다. 바꾼 뒤 worker를 다시 띄운다.
