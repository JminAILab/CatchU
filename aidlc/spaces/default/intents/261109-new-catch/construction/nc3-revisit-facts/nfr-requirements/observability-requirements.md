# NC3 다시 볼 곳 사실과 작업 시각 — 관측 요구사항

입력:
- 기능 설계 `construction/nc3-revisit-facts/functional-design/`(functional-spec.md, rules.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR4, FR15.4)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 B와 덧붙임, Q3 A)

새 지표·대시보드·알림은 두지 않는다. 더하는 것은 판정 실패 로그 한 줄뿐이다. 규칙 버림 기준과 규칙 사실 대조는 빌드와 시험 때 한 번 잰다.

## 인셉션 NFR4(규칙 사실 대조)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR4.1 | 시연 저장소(TheMe)에서 규칙이 만든 「다시 볼 곳」 줄 30~50개를 사람이 원문과 맞춘 결과를 기록한다. 남의 일을 본인 것으로 붙인 줄 0개, 그 밖에 틀린 줄 2개 이하가 합격이다. | 빌드와 시험 기록에 줄마다 맞음·틀림과 까닭을 남긴다. | NFR4 |
| NFR4.2 | 규칙 버림 기준(FR15.4)의 「규칙마다 붙은 Catch 수」는 새 로그 없이 센다. 3단계를 켠 뒤 TheMe 분석 결과가 든 로컬 DB에서, 종류마다 그 종류의 사실이 하나라도 있는 `catch_asset` 행 수와 전체 행 수를 질의로 센다. 절반 넘게 붙거나 5% 미만으로 붙는 규칙은 BR2.4 상수에서 빼는 코드 변경으로 끈다. | 빌드와 시험 기록에 질의와 종류별 수·비율을 남긴다(Q3 A). | FR15.4, Q3 A |
| NFR4.3 | RevisitFacts 판정 실패(NFR8.3)마다 worker 오류 로그 한 줄을 남긴다. 고정 문구 「다시 볼 곳 계산 실패」, 요청 ID, 시도 ID, 예외 종류 이름(`type(error).__name__`)만 싣고 경로·줄 글자·커밋 메시지·식별값은 싣지 않는다. NFR4.1·NFR4.2를 재는 분석에서 이 로그가 0줄이어야 한다. 사실이 조용히 비면 비율이 틀어지기 때문이다. | worker 시험: 로그 한 줄의 칸이 위 넷뿐이다. 빌드와 시험: 측정 분석의 worker 로그에서 「다시 볼 곳 계산 실패」 0줄을 확인해 기록한다. | Q1 덧붙임, team.md 「Code Style」 |

## 지금 로그와의 관계

- worker 종결 로그(`종결 결과 생성: … candidates=… resultBytes=… elapsedSeconds=…`)의 칸은 바꾸지 않는다(Q3 A). 바꾸기 전·후 비교에 그대로 쓴다(성능 요구사항 NFR1.1·NFR1.3).
- api 결과 검사 거부(SCHEMA_INVALID)와 등록 입력 오류는 지금 로그·영수증 그대로다. 새 칸 이름만 오류 칸에 들 수 있고, 받은 값은 싣지 않는다.

## 해당하지 않는 것

- 분산 추적, SLI/SLO 정의, 알림 임계값은 새로 두지 않는다. 지금 서비스에도 없고, 요구사항에 운영 중 비율을 보는 일이 없다(Q3).

## Sources

- `construction/nc3-revisit-facts/functional-design/rules.md`(BR2.4), `functional-spec.md` 10절
- `inception/requirements-analysis/requirements.md` NFR4, FR15.4
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `worker/app/processing/pipeline.py`(종결 로그), `worker/app/consumer/service.py`(예외 종류 이름 로그 꼴)
- `construction/nc3-revisit-facts/nfr-requirements/nfr-requirements-questions.md` Q1·Q3
