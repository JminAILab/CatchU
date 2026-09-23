# Units Generation 검증 기록

## 알려진 프레임워크 검사 결함 — 9/23 사용자 확인

사용자가 별도 읽기 전용 조사로 확인한 원인을 제공했다. 이 세션은 해당 코드를 추가 열람하거나 검사를 재호출하지 않고 이 확인을 근거로 기록한다.

- `.codex/tools/aidlc-sensor-traceability.ts` 300~303행: units-generation은 stories.md가 없으면 requirements의 FR ID를 기준으로 삼는다.
- 같은 파일의 `storyAssignments()` 226~248행은 `ID_PATTERNS.US`의 `US\d+.\d+` 형식만 추출한다. User Stories를 SKIP한 이번 계획의 FR 기반 매핑은 0건으로 판정된다.
- 따라서 이번 `contains no story-to-unit mappings`는 문서 내용의 결함이 아니라 **알려진 프레임워크 검사 결함**으로 분류한다. US ID 삽입·검사 코드 수정·재호출로 우회하지 않는다.
- manifest `.codex/sensors/aidlc-traceability.md`의 `default_severity: advisory`를 확인했다. 기존 실패 기록은 그대로 유지하며 검사 통과로 바꾸지 않는다.
- [독립 검토](review.md)는 requirements·매핑표·JSON의 FR 59개(OK 22 / Deferred 33 / N/A 4)와 구성요소 소유→Unit ID→Directory의 일치를 확인했다. 이 근거로 공식 Units Generation 승인 요청을 진행한다. 엔진이 차단형으로 거부하면 공식 Override blocking sensors 선택지를 사용자에게 제시하며 선택 전 적용하지 않는다.

아래 ‘원인 미확정·승인 요청 중단’은 이 확인을 받기 전 기록이다. 현재 적용은 이 절을 따른다. 기존 검토 R-01과 감사 기록을 소급 수정하거나 검토자가 검사 통과를 확인한 것으로 바꾸지 않는다.

## 확인한 사실

- 작성 전 확인 91064e502481f2fb5ea6a665fc288ae731d82ffef26cc947f31160c398a2b0f4 등록 성공. 네 산출물의 자동 ARTIFACT_CREATED 및 매핑표 수정의 ARTIFACT_UPDATED가 이 식별자에 연결됐다.
- 기존 배포 단위 3개·도메인 구성요소 7개, FR 59개(OK 22 / Deferred 33 / N/A 4)를 추적한다.
- 필수 절/의존 YAML 검사 통과(edge_block=ok), 상위 입력 참조 검사 통과. 신규 파일까지 포함한 최종 공백 검사에서는 Unit 정의·의존·traceability의 끝 빈 줄 안내가 남았다. 검토 판본 고정을 유지하며 전체 공백 검사 통과로 표기하지 않는다.
- Domain Design·상류 승인 문서는 수정하지 않았다. 기존 별도 웹 시연 intent와 intents.json 미커밋 변경은 커밋 대상에서 제외한다.
- #80이 dev에 병합됨을 확인했다(13f0327). 새 PR은 dev 기준이며 이 세션에서 #80을 병합하거나 base를 바꾸지 않았다.

## 남은 검사 문제

추적성 검사가 `unit-of-work-story-map.md contains no story-to-unit mappings`를 반환했다. 최초 검사 뒤 열 제목을 `Story ID / Status / Unit ID / Directory`로 맞췄으나 같은 결과다. 열 제목이 원인이라는 초기 추정은 확인되지 않았다. 실제 내용 누락인지, 형식/판정의 문제인지는 아직 확정하지 않는다.

동일 대상의 두 수동 검사 실패 후 재호출을 중단했다. 자동 저장 시에도 같은 실패가 기록됐다. doctor는 60 passed / 0 failed이며 버전 업데이트와 미커밋 기록 안내만 있었다. 버전·검사 코드·훅·상태·감사 직접 수정과 검사 우회는 하지 않았다.

독립 검토는 실제 FR/Unit 매핑을 별도 대조하며 이 검사 실패를 통과로 대체하지 않는다. 추적성 오류가 남은 채 단계 승인이나 다음 단계 진행을 요청하지 않는다.

[독립 검토 결과](review.md): 문서 매핑 일치·소유 경계 결함 없음. 검증 한계 R-01 Minor/New를 별도로 유지하며 REVIEW_COMPLETED 등록을 마쳤다. 이 R-01은 Domain Design에서 해결된 FR2.1 지적과 별개다.
