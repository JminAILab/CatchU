# Units Generation 검증 기록

## 확인한 사실

- 작성 전 확인 91064e502481f2fb5ea6a665fc288ae731d82ffef26cc947f31160c398a2b0f4 등록 성공. 네 산출물의 자동 ARTIFACT_CREATED 및 매핑표 수정의 ARTIFACT_UPDATED가 이 식별자에 연결됐다.
- 기존 배포 단위 3개·도메인 구성요소 7개, FR 59개(OK 22 / Deferred 33 / N/A 4)를 추적한다.
- 필수 절/의존 YAML 검사 통과(edge_block=ok), 상위 입력 참조 검사 통과, git diff --check 통과.
- Domain Design·상류 승인 문서는 수정하지 않았다. 기존 별도 웹 시연 intent와 intents.json 미커밋 변경은 커밋 대상에서 제외한다.
- #80이 dev에 병합됨을 확인했다(13f0327). 새 PR은 dev 기준이며 이 세션에서 #80을 병합하거나 base를 바꾸지 않았다.

## 남은 검사 문제

추적성 검사가 `unit-of-work-story-map.md contains no story-to-unit mappings`를 반환했다. 최초 검사 뒤 열 제목을 `Story ID / Status / Unit ID / Directory`로 맞췄으나 같은 결과다. 열 제목이 원인이라는 초기 추정은 확인되지 않았다. 실제 내용 누락인지, 형식/판정의 문제인지는 아직 확정하지 않는다.

동일 대상의 두 수동 검사 실패 후 재호출을 중단했다. 자동 저장 시에도 같은 실패가 기록됐다. doctor는 60 passed / 0 failed이며 버전 업데이트와 미커밋 기록 안내만 있었다. 버전·검사 코드·훅·상태·감사 직접 수정과 검사 우회는 하지 않았다.

독립 검토는 실제 FR/Unit 매핑을 별도 대조하며 이 검사 실패를 통과로 대체하지 않는다. 추적성 오류가 남은 채 단계 승인이나 다음 단계 진행을 요청하지 않는다.

[독립 검토 결과](review.md): 문서 매핑 일치·소유 경계 결함 없음. 검증 한계 R-01 Minor/New를 별도로 유지하며 REVIEW_COMPLETED 등록을 마쳤다. 이 R-01은 Domain Design에서 해결된 FR2.1 지적과 별개다.
