# Contract Design 단독 정정 검증 — 2026-10-09 Catch 제목 (#120)

검사 위치는 `/Users/ljm/Desktop/github/CatchU`이며 브랜치는 `docs/catch-title-contract-1009`다. 판본은 HEAD·origin/dev·분기 기준 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28` 위의 미커밋 계약 정정이다. 근거는 [Catch 결정](../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md) 86~97행과 팀장 지시다. 명령·스크립트 전문과 후속 Unit 기록은 [도구 기록](single-2026-10-09-tools.json)에 모은다.

## 결정·반영 대조

| 결정 문서 행 | 반영 파일:행 | 확인한 내용 |
|---|---|---|
| 88 — 제목 칸 | worker-messages.yaml:85, common.yaml:172·197 | Candidate·Catch·PublicCatch title 세 곳은 string/minLength=1/nullable=true이며 필수 목록 유지 |
| 88 — 제목 없음 | contract-summary.md:94 | 제목이 없으면 null이며 생성된 제목처럼 꾸미지 않음 |
| 88 — 근거 순서 | contract-summary.md:94 | 목록 순서가 표시 순서이며 B가 받은 순서를 저장하고 회원·수신자 응답에 유지 |
| 88 — failures | contract-summary.md:160 | 초안이 나왔는데 제목만 null이면 failures가 아님 |
| 89 — 재호출 예외 | contract-summary.md:140 | 한 분석 안 제목 형식 위반만 고쳐 쓰기, 제목당 3회·요청 호출/총 시간 상한, 생성 상한에서 제외, 상한 뒤 null, 호출 실패 재호출 금지 |
| 89 — 분석 재시도 | contract-summary.md:69 | 한 분석 안 제목 고쳐 쓰기는 분석 재시도가 아님 |
| 90 — CatchAsset.title | ../../construction/u2-api/functional-design/entities.md:100 | 별도 u2-api 요약 확인 뒤 required=false·min_length=1·null/빈 문자열 금지를 반영. 독립 검토 READY·단독 완료 kind:done |
| 90 — 근거 위치 | ../../construction/u2-api/functional-design/entities.md:138 | 별도 u2-api 요약 확인 뒤 position(정수·필수·1부터) 반영. 팀장이 #165 위임을 거둔 결정 기록. 유일성 추가 없음 |
| 92 — BR3.2 | ../../construction/u3-worker/functional-design/rules.md:22·23·56 | 별도 u3-worker 요약 확인 뒤 근거 조각·모델/코드 역할·null·제목만 null인 다섯 경우의 failures 제외 반영. 지정 수정 검증 통과 |
| 93 — BR3.4 | ../../construction/u3-worker/functional-design/rules.md:39 | 별도 u3-worker 요약 확인 뒤 제목 형식 고쳐 쓰기의 좁은 예외 반영 |
| 94 — BR3.5 | ../../construction/u3-worker/functional-design/rules.md:47 | 별도 u3-worker 요약 확인 뒤 한 분석 안 제목 고쳐 쓰기는 분석 재시도가 아님을 반영 |
| 95 — worker 기능 설계 | ../../construction/u3-worker/functional-design/functional-spec.md:42 | 별도 u3-worker 요약 확인 뒤 새 예외 문단 반영. 기존 R-01·R-02 적용 40행 바이트 보존 확인 |
| 96 — web 기능 설계 | ../../construction/u1-web/functional-design/functional-spec.md:41 | 별도 u1-web 확인 뒤 null을 대체하지 않고 제목 없이 보이는 한 문장 반영. READY·kind:done |
| 97 — 소급 수정 금지 | single-2026-10-09-questions.md:Q4 | 요구사항·실행 허가 표·도메인 components/ADR-007/Q4·Q5 및 기존 승인·검증 기록을 소급 수정하지 않고 이 경우만 좁힌다고 기록 |

## 검증과 보존

| 항목 | 결과 |
|---|---|
| 계약 YAML 파싱 | 통과. 계약 YAML 4개 및 요약의 YAML 3블록을 기준/현재 판본 모두 파싱 |
| 참조·응답 | 통과. $ref 203개 모두 해석, 응답 코드 집합 동일(원본 API 연산 18개와 요약 복제 18개, 총 36개 인덱스 항목) |
| 제목·링크 제목 | 통과. 세 title만 nullable 추가; required/minLength 유지. ShareLink·ShareCreate title 및 나머지 YAML 내용 보존 |
| 필수 절 | 통과. H2 11개, findings 0 |
| 상류 참조 | 통과. unreferenced 없음, findings 0 |
| 세 검사기 — 변경 전 | 통과. API 운영 검사기는 null·빈 문자열·칸 삭제 모두 false, API/worker 도우미는 모두 SCHEMA_INVALID |
| 세 검사기 — 변경 후 | 통과. null만 운영 true/도우미 VALID. 빈 문자열·칸 삭제는 false/SCHEMA_INVALID 유지 |
| 검사기 비교 자료 | 합성 MOCK Result만 사용. fillTemplate/fill_template 결과 동일. 실제 API·DB·화면이나 end-to-end 동작의 증거가 아님 |
| 직접 계약 로더 | API 운영·시험 도우미 및 worker가 같은 YAML을 읽음. 운영 인스턴스 생성 시 읽으므로 서비스 재시작/새 인스턴스에 적용. web에는 직접 YAML 로더 없음 |
| API 설치·빌드 | 통과. npm ci 및 npm run build 성공; package.json·package-lock.json 보존 |
| 시험 DB | 실행하지 못함. Docker daemon 소켓 연결이 샌드박스 안팎에서 실패. 5433 리스너 없음, 컨테이너 생성/삭제 없음 |
| 추적 기준선 | u3-worker 변경 전후 FAIL 39건·출력 JSON 동일, u2-api FAIL 23건 유지. u1-web FAIL 43건도 기존과 동일함을 확인 |
| 서비스·문서·최종 diff | API lint/typecheck·합성 16건 및 worker lint/format/mypy·pytest 267건·문서 크기 통과. API npm test는 DB 연결 거부로 본문 실행하지 못함. 최종 diff·해시 결과는 아래 추가 |
| CHANGE_ACCEPTED / SUMMARY_ARTIFACT_UNAUTHORIZED | 계약 단계에는 없음. 기능 설계 검토 요청에서 CHANGE_ACCEPTED u2 3건·u3 4건·u1 2건, 총 9건. SUMMARY_ARTIFACT_UNAUTHORIZED는 관측되지 않음. 최종 감사 대조는 아래 추가 |

## 단독 실행 연결과 결과

감사 기록으로 확인한 `2026-09-23T07:02:00Z`의 `single-stage:contract-design` 시작에 이어 붙였다. 계약 새 실행을 열지 않았다. 팀장의 이 단계 응답 `Looks correct`만 기록한 뒤 계약 세 파일을 정정했다. 요약 확인 식별자는 `2fea78f56d2d62dc07624c7994df94c4fd05d6c3da56ce7ce871fc7fbb0f2646`다.

검토 요청은 1회, exit 1 및 `SUMMARY_RECEIPT_MISSING`으로 거부됐다. 독립 검토가 시작되지 않았으므로 READY 판정이나 검토 사본은 없다. 완료 보고도 1회, exit 0이지만 JSON `kind:error`로 거부됐다. 이전 선례에서 확인한 단계 전체 질문 확인 요구와 같은 거부이며 성공으로 바꾸어 기록하지 않는다. 재시도·질문 파일 이동/삭제·추가 영수증·우회·제안된 복구 명령을 실행하지 않았다.

계약 설계 단독 실행은 열린 채 두며, 이번 정정의 확인은 PR 리뷰로 한다. 요약 확인과 단독 완료는 PR 승인이나 후속 구현 완료를 뜻하지 않는다. 요구사항·도메인 설계의 금지 문장은 소급 수정하지 않고 이 경우만 좁힌다.

## 환경·주변 상태

- 원래 active-intent는 `260914-catchu-october-mvp`였다. 동일 10월 intent를 명시해 선택했다. 12월 intent 추적 파일 36개를 기준선에 포함했다.
- 실행 binary/runtime 및 프로젝트 스탬프는 2.10.0이다. 버전 검사 전후 감사 파일 크기는 156,038바이트로 같다. doctor·refresh·Guard Policy/설정 변경 없음.
- 착수 감사 파일 크기 156,038바이트 = HEAD/origin-dev 판본 143,643 + 이미 붙은 미커밋 12,395바이트. 백업 tail.md는 11,847바이트이고 나머지 548바이트는 이번 세션 시작 기록이다.
- HEAD 판본 앞부분과 준비 백업 꼬리를 바이트 비교했다. stash·백업을 지우지 않는다. 기존 감사 파일은 직접 편집하지 않는다.
- 산출물 7개를 제외한 보호 추적 파일 243개와 전체 추적 파일 1,077개의 SHA-256 기준선을 저장소 밖에 기록했다. 기준선 manifest SHA-256은 `79eecc72353344d90c9351607da878f3d8ebadf98b9b722229fabcc5d8e4d73c`다.
- B 구현 읽기 조회에서 다른 근거 위치 속성 이름은 관측되지 않았다. 원격 쓰기는 하지 않았다. 기존 서비스 코드·docs·12월 intent·하네스·memory는 수정 범위 밖이다.
- team.md:29의 NCP 배포 대상은 보고만 하며 수정하지 않는다.

## 요약 확인·검토 요청·완료 보고 원문

아래 명령은 모두 위 프로젝트 위치에서 실행했다. YAML 검증/변경 후 비교는 미커밋 계약 정정을 읽었고 변경 전 비교는 분기 기준 산출물을 읽었다. 각 원문은 도구 기록에도 보존한다.

### contract-summary-decision

```text
aidlc engine log decision --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
```

exit_code: 0

```text
{"emitted":"DECISION_RECORDED","stage":"contract-design"}
```

### contract-summary-answer

```text
aidlc engine log answer --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-questions.md --details 'Looks correct'
```

exit_code: 0

```text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"contract-design","summary_authorization_id":"2fea78f56d2d62dc07624c7994df94c4fd05d6c3da56ce7ce871fc7fbb0f2646"}
```

### contract-required-sections

```text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design
```

exit_code: 0

```text
{"pass":true,"h2_count":11,"headings":["## 계약의 지위와 경계","## M — 회원 API","## 분석 접수·상태·재요청","## B 등록·공개 및 E/F 반영 경계","## P — 수신자 API","## 공통 오류·요청 안전성","## W — worker 메시지 계약","## Contract ownership rules","## Open questions","## 담당자 확인 요청","## 추적 정보"],"findings_count":0}
```

### contract-upstream-coverage

```text
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design --consumes unit-of-work,unit-of-work-dependency,components,requirements --deliverables contract-summary
```

exit_code: 0

```text
{"pass":true,"consumes":["unit-of-work","unit-of-work-dependency","components","requirements"],"unreferenced":[],"scanned_files":["/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md"],"findings_count":0}
```

### contract-yaml-validation

```text
node /private/tmp/catchu-title-1009/validate-contract.cjs /Users/ljm/Desktop/github/CatchU
```

exit_code: 0

```text
{
  "repositoryRoot": "/Users/ljm/Desktop/github/CatchU",
  "baselineCommit": "3b025df9ba5c2d5285a4cacd28382e7a3fd45a28",
  "parsing": {
    "passed": true,
    "baseline": [
      "common.yaml",
      "member-api.yaml",
      "recipient-api.yaml",
      "worker-messages.yaml",
      "contract-summary.md#yaml-1",
      "contract-summary.md#yaml-2",
      "contract-summary.md#yaml-3"
    ],
    "current": [
      "common.yaml",
      "member-api.yaml",
      "recipient-api.yaml",
      "worker-messages.yaml",
      "contract-summary.md#yaml-1",
      "contract-summary.md#yaml-2",
      "contract-summary.md#yaml-3"
    ],
    "currentSha256": {
      "common.yaml": "41c74e9dfd3ed4ecab7e5e880ef2f770edc912c57dbae905984418920d35ce2b",
      "member-api.yaml": "310c9a578b26fe49e0a60d58778d25ad51f85a8dd0027debf47eac9f66029248",
      "recipient-api.yaml": "1565d7b5d8fd639cb7c5295fcff6cc17e1f9d23935d981b295999db555a20e36",
      "worker-messages.yaml": "1ec654a2a76aaf5fddad3a4490f4a7d75f4d8daed0fbedf07535d4e3d559c736",
      "contract-summary.md#yaml-1": "b9e59b068cda30028e780428b1e7fa9a57a9c60e4031a2739424aa0bc86a3573",
      "contract-summary.md#yaml-2": "b0d359afd9f5f26a835c330ba0941a860acf522c0771631a66bc88e9937d0e95",
      "contract-summary.md#yaml-3": "ae431b3c64c4db056e4d8f4f60b806729efd18f1d95a70bca2476aad4a7061b8"
    }
  },
  "references": {
    "passed": true,
    "baseline": {
      "count": 203,
      "resolved": 203,
      "byDocument": {
        "common.yaml": 24,
        "member-api.yaml": 131,
        "recipient-api.yaml": 20,
        "worker-messages.yaml": 7,
        "contract-summary.md#yaml-1": 13,
        "contract-summary.md#yaml-2": 4,
        "contract-summary.md#yaml-3": 4
      }
    },
    "current": {
      "count": 203,
      "resolved": 203,
      "byDocument": {
        "common.yaml": 24,
        "member-api.yaml": 131,
        "recipient-api.yaml": 20,
        "worker-messages.yaml": 7,
        "contract-summary.md#yaml-1": 13,
        "contract-summary.md#yaml-2": 4,
        "contract-summary.md#yaml-3": 4
      }
    }
  },
  "responseCodes": {
    "passed": true,
    "operationCount": 36,
    "operations": {
      "member-api.yaml GET /me": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml PUT /me/profile": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /me/repositories": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /analysis-notice": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /analysis-requests": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml POST /analysis-requests": [
        "200",
        "202",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /analysis-requests/{requestId}": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /catches": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /catches/{catchId}": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml PUT /catches/{catchId}/confirmation": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml PUT /catches/{catchId}/visibility": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml PUT /catches/{catchId}/mismatch": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml GET /share-links": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "member-api.yaml POST /share-links": [
        "200",
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "429",
        "500"
      ],
      "member-api.yaml PUT /share-links/{linkId}/stop": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "recipient-api.yaml POST /public/links/{token}/unlock": [
        "200",
        "400",
        "401",
        "404",
        "429",
        "500"
      ],
      "recipient-api.yaml GET /public/links/{token}": [
        "200",
        "400",
        "401",
        "404",
        "500"
      ],
      "recipient-api.yaml GET /public/links/{token}/catches/{catchId}": [
        "200",
        "400",
        "401",
        "404",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /me": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 PUT /me/profile": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /me/repositories": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /analysis-notice": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /analysis-requests": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 POST /analysis-requests": [
        "200",
        "202",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /analysis-requests/{requestId}": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /catches": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /catches/{catchId}": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 PUT /catches/{catchId}/confirmation": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 PUT /catches/{catchId}/visibility": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 PUT /catches/{catchId}/mismatch": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 GET /share-links": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-1 POST /share-links": [
        "200",
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "429",
        "500"
      ],
      "contract-summary.md#yaml-1 PUT /share-links/{linkId}/stop": [
        "200",
        "400",
        "401",
        "403",
        "404",
        "409",
        "500"
      ],
      "contract-summary.md#yaml-2 POST /public/links/{token}/unlock": [
        "200",
        "400",
        "401",
        "404",
        "429",
        "500"
      ],
      "contract-summary.md#yaml-2 GET /public/links/{token}": [
        "200",
        "400",
        "401",
        "404",
        "500"
      ],
      "contract-summary.md#yaml-2 GET /public/links/{token}/catches/{catchId}": [
        "200",
        "400",
        "401",
        "404",
        "500"
      ]
    }
  },
  "titles": {
    "passed": true,
    "checked": [
      {
        "file": "worker-messages.yaml",
        "schema": "Candidate",
        "title": {
          "type": "string",
          "minLength": 1,
          "nullable": true
        },
        "required": true
      },
      {
        "file": "common.yaml",
        "schema": "Catch",
        "title": {
          "type": "string",
          "minLength": 1,
          "nullable": true
        },
        "required": true
      },
      {
        "file": "common.yaml",
        "schema": "PublicCatch",
        "title": {
          "type": "string",
          "minLength": 1,
          "nullable": true
        },
        "required": true
      }
    ]
  },
  "shareTitles": {
    "passed": true,
    "checked": [
      {
        "schema": "ShareLink",
        "title": {
          "type": "string"
        },
        "sourceBytesUnchanged": true
      },
      {
        "schema": "ShareCreate",
        "title": {
          "type": "string",
          "minLength": 1,
          "description": "trim 후 1~50자. 글자 수는 유니코드 코드 포인트(DB char_length 기준)"
        },
        "sourceBytesUnchanged": true
      }
    ]
  },
  "onlyAllowedYamlChanges": {
    "passed": true,
    "checked": [
      "common.yaml",
      "member-api.yaml",
      "recipient-api.yaml",
      "worker-messages.yaml",
      "contract-summary.md#yaml-1",
      "contract-summary.md#yaml-2",
      "contract-summary.md#yaml-3"
    ],
    "excluded": [
      "worker-messages.yaml#/components/schemas/Candidate/properties/title",
      "common.yaml#/components/schemas/Catch/properties/title",
      "common.yaml#/components/schemas/PublicCatch/properties/title"
    ]
  },
  "failures": [],
  "passed": true
}
```

### validators-before-escalated

```text
node /private/tmp/catchu-title-1009/compare-title-validators.cjs before /Users/ljm/Desktop/github/CatchU
```

exit_code: 0

```text
Installed 11 packages in 10ms
{
  "phase": "before",
  "repositoryRoot": "/Users/ljm/Desktop/github/CatchU",
  "contractDirectory": "/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design",
  "fixtureFile": "/Users/ljm/Desktop/github/CatchU/worker/fixtures/m1-synthetic/results/succeeded-one-candidate.json",
  "fixtureSha256": "94ef908748ef7efff0dfab6e5b8d9258e5c05a55bfa48858a47ea7a5da00a5cb",
  "contractSha256": {
    "worker-messages.yaml": "7aed0b4093368722ea96a521ab667a1ca504341d430ca305d09408b258ecb81e",
    "common.yaml": "3ab3e8036f8195f7c798a8045b53ad34fe41b268aea890b94ac46581184273bc"
  },
  "syntheticInput": {
    "contextFile": "/Users/ljm/Desktop/github/CatchU/worker/fixtures/m1-synthetic/context.sample.json",
    "sourceMode": "MOCK",
    "fillingFunctionsAgree": true
  },
  "baseline": {
    "apiRuntime": true,
    "apiHelper": {
      "verdict": "VALID",
      "unidentifiedFields": [],
      "errors": []
    },
    "workerHelper": {
      "verdict": "VALID",
      "unidentifiedFields": [],
      "errors": []
    },
    "passed": true
  },
  "cases": [
    {
      "case": "null",
      "apiRuntime": false,
      "apiHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0/title",
            "keyword": "type"
          }
        ]
      },
      "workerHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0/title",
            "keyword": "type"
          }
        ]
      },
      "expected": {
        "apiRuntime": false,
        "helperVerdict": "SCHEMA_INVALID"
      },
      "passed": true
    },
    {
      "case": "empty",
      "apiRuntime": false,
      "apiHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0/title",
            "keyword": "minLength"
          }
        ]
      },
      "workerHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0/title",
            "keyword": "minLength"
          }
        ]
      },
      "expected": {
        "apiRuntime": false,
        "helperVerdict": "SCHEMA_INVALID"
      },
      "passed": true
    },
    {
      "case": "missing",
      "apiRuntime": false,
      "apiHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0",
            "keyword": "required"
          }
        ]
      },
      "workerHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0",
            "keyword": "required"
          }
        ]
      },
      "expected": {
        "apiRuntime": false,
        "helperVerdict": "SCHEMA_INVALID"
      },
      "passed": true
    }
  ],
  "passed": true
}
```

### validators-after

```text
node /private/tmp/catchu-title-1009/compare-title-validators.cjs after /Users/ljm/Desktop/github/CatchU
```

exit_code: 0

```text
{
  "phase": "after",
  "repositoryRoot": "/Users/ljm/Desktop/github/CatchU",
  "contractDirectory": "/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design",
  "fixtureFile": "/Users/ljm/Desktop/github/CatchU/worker/fixtures/m1-synthetic/results/succeeded-one-candidate.json",
  "fixtureSha256": "94ef908748ef7efff0dfab6e5b8d9258e5c05a55bfa48858a47ea7a5da00a5cb",
  "contractSha256": {
    "worker-messages.yaml": "1ec654a2a76aaf5fddad3a4490f4a7d75f4d8daed0fbedf07535d4e3d559c736",
    "common.yaml": "41c74e9dfd3ed4ecab7e5e880ef2f770edc912c57dbae905984418920d35ce2b"
  },
  "syntheticInput": {
    "contextFile": "/Users/ljm/Desktop/github/CatchU/worker/fixtures/m1-synthetic/context.sample.json",
    "sourceMode": "MOCK",
    "fillingFunctionsAgree": true
  },
  "baseline": {
    "apiRuntime": true,
    "apiHelper": {
      "verdict": "VALID",
      "unidentifiedFields": [],
      "errors": []
    },
    "workerHelper": {
      "verdict": "VALID",
      "unidentifiedFields": [],
      "errors": []
    },
    "passed": true
  },
  "cases": [
    {
      "case": "null",
      "apiRuntime": true,
      "apiHelper": {
        "verdict": "VALID",
        "unidentifiedFields": [],
        "errors": []
      },
      "workerHelper": {
        "verdict": "VALID",
        "unidentifiedFields": [],
        "errors": []
      },
      "expected": {
        "apiRuntime": true,
        "helperVerdict": "VALID"
      },
      "passed": true
    },
    {
      "case": "empty",
      "apiRuntime": false,
      "apiHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0/title",
            "keyword": "minLength"
          }
        ]
      },
      "workerHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0/title",
            "keyword": "minLength"
          }
        ]
      },
      "expected": {
        "apiRuntime": false,
        "helperVerdict": "SCHEMA_INVALID"
      },
      "passed": true
    },
    {
      "case": "missing",
      "apiRuntime": false,
      "apiHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0",
            "keyword": "required"
          }
        ]
      },
      "workerHelper": {
        "verdict": "SCHEMA_INVALID",
        "unidentifiedFields": [],
        "errors": [
          {
            "path": "/candidates/0",
            "keyword": "required"
          }
        ]
      },
      "expected": {
        "apiRuntime": false,
        "helperVerdict": "SCHEMA_INVALID"
      },
      "passed": true
    }
  ],
  "passed": true
}
```

### contract-review

```text
aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
```

exit_code: 1

```text
{"error":"Cannot start review for \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds.\n{\"kind\":\"ask\",\"ask_type\":\"guard-recovery\",\"response_route\":\"execute-remedy\",\"question\":\"The next action for \\\"contract-design\\\" would be refused. Choose one authority-preserving recovery action.\",\"stage\":\"contract-design\",\"reason_codes\":[\"SUMMARY_RECEIPT_MISSING\"],\"remedies\":[{\"op\":\"restore-or-jump\",\"action\":\"This stage is already approved; restore the reviewed source state, or jump back with /aidlc --stage contract-design to redo it.\",\"operation\":{\"kind\":\"restart-stage\",\"stage\":\"contract-design\"},\"command\":\"aidlc engine orchestrate next --stage contract-design\",\"requiresHuman\":true,\"executableNow\":true,\"interaction\":\"command\"}]}"}
```

### contract-report

```text
aidlc engine orchestrate report --single --stage contract-design --result completed
```

exit_code: 0

```text
{"kind":"error","message":"Refusing to complete \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds."}
```

## 커밋 전 최종 보존 확인

최종 검사 통과: git diff --check, 대상 7개 word-diff, 전체 추적 SHA-256 1,077개·보호 243개 대조. 기존 추적 변경은 지정 7개와 감사 파일뿐이며 허용 밖 추적/미추적 변경은 없다(.local-handoffs는 보존·커밋 제외). 보호 243개 중 감사만 추가됐고 12월 intent 36개·서비스 코드·docs·하네스·memory·기존 승인 기록·aidlc-state.md는 그대로다. worker functional-spec 기존 40행도 바이트 동일하다.

감사 대조 시점 178,695바이트 = HEAD/origin-dev 143,643 + 준비 꼬리 11,847 + 이번 시작 기록 548 + 착수 이후 추가 22,657이다. HEAD 및 착수 156,038바이트 앞부분과 백업 꼬리를 그대로 보존했다. 착수 이후 CHANGE_ACCEPTED 9건, SUMMARY_ARTIFACT_UNAUTHORIZED 0건이다. 보존 대조 이후 엔진/세션이 추가한 바이트는 별도로 구분한다.

최종 서비스·CI 명령: API lint·typecheck·합성 수신 16/16, worker ruff·format(38파일)·mypy(36파일)·pytest(267건, 의존성 사용 중단 경고 1건), 문서 크기 통과. API npm test는 빌드 후 시험 DB(127.0.0.1:5433/catchu_test) ECONNREFUSED로 본문을 실행하지 못했다(exit 1). Docker 준비 실패로 이번에 생성/삭제한 컨테이너는 없다. 첫 worker ruff의 샌드박스 uv 캐시 접근 거부(exit 2)는 같은 명령을 승인된 외부 실행으로 통과했다. 실제 서비스 연결·DB·화면·LLM·배포 완료의 증거로 삼지 않는다.

네 단계 요약 확인을 각각 기록했고 u2/u3/u1 독립 검토 READY·완료 kind:done이다. 계약은 검토/완료 각 1회 거부된 열린 실행으로 보존한다. 산출물 7개와 기록은 별도 로컬 커밋으로 묶으며 기록 커밋 전 준비 꼬리 사건 종류·세션·첫/끝 시각을 별도 확인받는다. push·PR은 팀장의 “올려” 전에는 하지 않는다.

### 최종 검사 — api-lint

작업 위치: `/Users/ljm/Desktop/github/CatchU/api`

```text
npm run lint
```

exit_code: 0

````text

> @catchu/api@0.0.0 lint
> eslint . --max-warnings=0
````

### 최종 검사 — api-typecheck

작업 위치: `/Users/ljm/Desktop/github/CatchU/api`

```text
npm run typecheck
```

exit_code: 0

````text

> @catchu/api@0.0.0 typecheck
> tsc --noEmit -p tsconfig.json
````

### 최종 검사 — api-test

작업 위치: `/Users/ljm/Desktop/github/CatchU/api`

```text
npm test
```

exit_code: 1

````text

> @catchu/api@0.0.0 test
> npm run build && node scripts/test-with-db.cjs


> @catchu/api@0.0.0 build
> node scripts/clean-dist.cjs && tsc -p tsconfig.build.json

테스트 DB(127.0.0.1:5433/catchu_test)에 접속하지 못했습니다: connect ECONNREFUSED 127.0.0.1:5433
api/README.md 「DB 테스트」의 docker run 명령으로 테스트 DB를 띄운 뒤 다시 실행하세요.
````

### 최종 검사 — api-analysis-fixtures

작업 위치: `/Users/ljm/Desktop/github/CatchU/api`

```text
npm run test:analysis-fixtures
```

exit_code: 0

````text

> @catchu/api@0.0.0 test:analysis-fixtures
> npm run build && node --test test/analysis/shared-fixtures.check.cjs


> @catchu/api@0.0.0 build
> node scripts/clean-dist.cjs && tsc -p tsconfig.build.json

✔ #103 공용 자료 수신: succeeded-one-candidate (5.961917ms)
✔ #103 공용 자료 수신: empty (0.5965ms)
✔ #103 공용 자료 수신: partial-failed (1.891583ms)
✔ #103 공용 자료 수신: failed (0.315583ms)
✔ #103 공용 자료 수신: unidentifiable (0.311792ms)
✔ #103 공용 자료 수신: redelivery (0.475ms)
✔ #103 공용 자료 수신: same-id-different-content (0.592375ms)
✔ #103 공용 자료 수신: two-candidates-same-work (0.472ms)
✔ #103 공용 자료 수신: progress-events (0.677042ms)
✔ #103 음성 대조: missing-title (0.328375ms)
✔ #103 음성 대조: invalid-date-time (0.171917ms)
✔ #103 음성 대조: date-time-space-separator (0.131834ms)
✔ #103 음성 대조: invalid-uri (0.130458ms)
✔ #103 음성 대조: empty-evidence (0.130333ms)
✔ #103 음성 대조: empty-result-id (0.113416ms)
✔ #103 음성 대조: non-string-request-id (0.108292ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 289.745167
````

### 최종 검사 — worker-ruff

작업 위치: `/Users/ljm/Desktop/github/CatchU/worker`

```text
uv run --locked ruff check .
```

exit_code: 2

````text
error: Failed to initialize cache at `/Users/ljm/.cache/uv`
  Caused by: failed to open file `/Users/ljm/.cache/uv/sdists-v9/.git`: Operation not permitted (os error 1)
````

### 최종 검사 — worker-ruff-escalated

작업 위치: `/Users/ljm/Desktop/github/CatchU/worker`

```text
uv run --locked ruff check .
```

exit_code: 0

````text
All checks passed!
````

### 최종 검사 — worker-format

작업 위치: `/Users/ljm/Desktop/github/CatchU/worker`

```text
uv run --locked ruff format --check .
```

exit_code: 0

````text
38 files already formatted
````

### 최종 검사 — worker-mypy

작업 위치: `/Users/ljm/Desktop/github/CatchU/worker`

```text
uv run --locked mypy
```

exit_code: 0

````text
Success: no issues found in 36 source files
````

### 최종 검사 — worker-pytest

작업 위치: `/Users/ljm/Desktop/github/CatchU/worker`

```text
uv run --locked pytest
```

exit_code: 0

````text
============================= test session starts ==============================
platform darwin -- Python 3.12.10, pytest-9.1.1, pluggy-1.6.0
rootdir: /Users/ljm/Desktop/github/CatchU/worker
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.15.1
collected 267 items

tests/test_collection_boundary.py ....................                   [  7%]
tests/test_collection_controls.py ...................................... [ 21%]
..................                                                       [ 28%]
tests/test_collection_flow.py ...........................                [ 38%]
tests/test_collection_transport.py ..................                    [ 45%]
tests/test_health.py .                                                   [ 45%]
tests/test_processing.py ............................................... [ 63%]
...................................                                      [ 76%]
tests/test_request_check.py .................................            [ 88%]
tests/test_worker_messages.py ..............................             [100%]

=============================== warnings summary ===============================
.venv/lib/python3.12/site-packages/starlette/testclient.py:53
  /Users/ljm/Desktop/github/CatchU/worker/.venv/lib/python3.12/site-packages/starlette/testclient.py:53: DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated, use anyio.from_thread.BlockingPortal instead.
    _PortalFactoryType = Callable[[], AbstractContextManager[anyio.abc.BlockingPortal]]

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
======================== 267 passed, 1 warning in 4.96s ========================
````

### 최종 검사 — doc-sizes

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
bash .github/scripts/check-doc-sizes.sh
```

exit_code: 0

````text
통과    29540 / 36000  docs/CatchU_작업관리.md
통과    17998 / 19000  docs/CatchU_coding_procedures.md
통과    23024 / 36000  web/README.md
통과    33599 / 36000  api/README.md
통과    24115 / 36000  worker/README.md
통과    19640 / 36000  api/CONVENTIONS.md
통과     8507 / 36000  api/docs/analysis-receiver.md
통과     3916 / 36000  api/docs/auth-review.md
통과     7960 / 36000  api/docs/catch-owner-read-preparation.md
통과     5149 / 36000  api/docs/catch-registration-database.md
통과     5196 / 36000  api/docs/catch-registration-e-integration.md
통과     4152 / 36000  api/docs/catch-registration-proposal.md
통과     6869 / 36000  api/docs/catch-registration-rules.md
통과     6397 / 36000  api/docs/catch-visibility.md
통과    10984 / 36000  api/docs/member-analysis.md
통과    10353 / 36000  api/docs/member-profile.md
통과     6210 / 36000  api/docs/member-repositories.md
통과    10319 / 36000  api/docs/result-application.md
통과    26247 / 36000  api/docs/share-links.md
통과     4314 / 36000  api/docs/verification-records.md
없음        - / 36000  worker/docs/*.md
통과    19607 / 36000  web/src/features/assets/README.md
통과     4106 / 36000  web/src/features/repository-management/README.md
통과    10454 / 36000  web/src/features/share-links/README.md
통과    28930 / 36000  docs/CatchU_큐_기술검증.md
통과    20457 / 36000  docs/CatchU_queue_verification_results.md
통과    22486 / 36000  docs/CatchU_queue_requirements.md
통과    20287 / 36000  docs/CatchU_작업동일성_판별기준.md
통과    30195 / 36000  docs/CatchU_수집통제_임시자료.md
통과    28016 / 36000  docs/CatchU_통합검증표.md
통과    34872 / 36000  docs/CatchU_work_identity_cases.md
통과    33265 / 36000  docs/CatchU_work_identity_records.md
통과    21463 / 36000  docs/CatchU_work_identity_rules.md
통과    23484 / 36000  docs/CatchU_work_identity_unit.md
통과    17789 / 36000  docs/CatchU_collection_control_checks.md
통과    25572 / 36000  docs/CatchU_collection_control_scope.md
통과    10175 / 36000  docs/CatchU_collection_control_temp_data.md
통과    27697 / 36000  docs/CatchU_integration_rows_intake.md
통과    21514 / 36000  docs/CatchU_integration_rows_sharing.md
통과     6568 / 36000  docs/CatchU_security_checks.md
통과    13529 / 32768  AGENTS.md (루트부터 합산)
````

### 최종 검사 — final-diff-check

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
git diff --check
```

exit_code: 0

````text

````

### 최종 검사 — final-word-diff

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
git diff --word-diff -- aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
```

exit_code: 0

````text
diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
index 529a634..356ee6f 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
@@ -38,7 +38,7 @@ Catch 탭 위쪽에는 **GitHub 저장소 연결 관리** 영역과 [연결 관

실패 재요청은 고지 요약과 **[동의하고 다시 요청]** 버튼 하나로 새 동의·새 요청을 만든다. 기존 동의를 재사용하지 않는다. 10월에는 연결 해제 버튼을 두지 않으며, 해제 뒤 자료 처리는 후속 입력의 OQ2에서 정한다.

Catch 탭 아래쪽에는 **저장소 필터가 있는 Catch 목록**을 두고, Catch 상세는 **모달**로 연다. 목록·상세는 F가 생성하고 B가 저장한 `title`을 사용하며 구직자의 제목 편집은 제공하지 않는다. {+제목이 null이면 다른 값으로 채우지 않고 제목 없이 보인다.+} 필터와 상세 모달의 식별자는 주소 파라미터에 담아 새로고침·뒤로 가기·재로그인 뒤에도 같은 화면을 연다. W03-R과 A-02·A-03 별도 화면은 두지 않는다.

| 담당 | 화면·연결 책임 |
|---|---|
diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md
index eb937cd..46ce7ef 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md
@@ -97,7 +97,7 @@ entities:
    description: "등록된 작업·기여·초안·최소 질문의 서비스 정본"
    attributes:
      - {name: catchId, type: id, required: true, unique: true, primary: true}
      - {name: title, type: string, required: [-true,-]{+false,+} min_length: 1, constraints: "F가 생성한 값을 저장하며 구직자는 수정할 수 [-없음"}-]{+없음. 없으면 null이며 값이 있으면 1자 이상(빈 문자열 금지)"}+}
      - {name: ownerId, type: id, required: true, references: MemberAccount.memberId}
      - {name: sourceRequestId, type: id, required: true, references: AnalysisRequest.requestId}
      - {name: sourceResultId, type: external-id, required: true}
@@ -135,6 +135,7 @@ entities:
      - {name: representedFacts, type: "list<string>", required: true, min_items: 1}
      - {name: contributionScope, type: string, required: true}
      - {name: coverageLimits, type: "list<string>", required: true}
      {+- {name: position, type: integer, required: true, min: 1, constraints: "받은 evidence 목록에서의 위치(1부터). 근거 목록 순서가 표시 순서이며 회원·수신자 응답은 이 순서로 근거를 돌려줌"}+}
    constraints: ["unique(catchId, sourceEvidenceId); 다른 Catch의 근거 일부 중첩 허용", "근거 출처는 Catch의 원 요청/범위와 일치"]
  - name: RepositoryProtection
    owner: B
diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md
index f716ef8..227d71f 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md
@@ -39,6 +39,8 @@ F(팀원 1)의 제공자 비종속 결과 처리 설계다. [entities](entities.

R-01·R-02 수정본 90bf289를 적용한다. 공식 Contract 단독 실행은 열린 상태로 보존하고 수정본의 확인은 PR #89 담당 리뷰로 진행한다. 보류 정책·추가 호출 금지와 기존 M1 첫 연결 결과 승인 1회를 유지한다.

{+2026-10-09 팀장 결정([Catch 결정](../../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md))으로 위 추가 호출 금지에 예외를 하나 둔다. worker는 한 분석 안에서 Catch 제목이 형식을 어겼을 때만 제목을 고쳐 쓰려고 LLM을 다시 부를 수 있다. 제목당 최대 3회이고, 요청당 고쳐 쓰기 호출 상한(이슈에서 정함)과 요청당 총 처리 시간 상한 안이며 생성 호출 상한에는 세지 않는다. 요청당 상한에 이르면 그 뒤 제목은 null로 둔다. 생성 호출이나 고쳐 쓰기 호출이 실패하면(시간 초과·서버 오류 포함) 다시 부르지 않는다. 한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다.+}

## 담당자 확인 요청

- 1 F: 결과·근거/초안/질문 의미와 실제/모의 구분, 보존/생성 상세의 개발 이슈 확인.
diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
index 0754a7b..cc96016 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
@@ -19,8 +19,8 @@ rules:
    category: validation
    applies_to: [WorkCandidate, AnalysisEvidence]
    trigger: 후보 구성
    logic: "IF 근거·기여와 등록 기준을 실패 영향과 분리해 확인하면 제공; 이유/성과 부재·작은 변경/단일 커밋만으로 제외하지 않음. title은 ‘무엇을 했나’를 짧은 명사구로 [-생성하며-]{+나타낸다. 제목은 근거가 가리키는 회원 커밋의 추가·삭제 줄과 변경 파일(경로·상태)로 확인되는 조각(대상·종류·동작)으로만 만든다. 모델은 대상과 근거 줄을 지목하고, 종류·동작과 제목 글자는 코드가 정한다.+} 평가하는 [-말과 workFacts에 없는 사실을-]{+말을+} 넣지 [-않음. 제목 생성 실패 시 workFacts 첫 항목으로 채워 항상 비어 있지 않은 값을 제공"-]{+않음(대상 이름 안의 낱말은 거르지 않는 한계). 생성이나 확인에 실패하면 null로 둔다"+}
    violation: "근거 부족/기준 미달은 notProvided, 수집/생성 오류는 failures로 [-구분;-]{+구분. 초안이 나왔는데 제목만 null인 경우(확인 실패, 3회 고쳐 써도 형식 위반, 요청당 고쳐 쓰기 상한에 이름, 시간 부족으로 멈춤, 고쳐 쓰기 호출 실패)는 failures에 넣지 않는다;+} 없는 사실을 추정하지 않음"
    source: [FR2.1]
  - id: BR3.3
    statement: 정상 0건과 부분/전체 실패를 구분한다
@@ -36,7 +36,7 @@ rules:
    applies_to: [WorkCandidate, DraftOutcome]
    trigger: 초안·최소 질문 생성 결과 구성
    logic: "초안 실패여도 적합 후보 제공; GENERATED일 때만 초안 본문 제공. 최소 질문은 F가 생성해 E를 통해 B로 전달"
    violation: "실패 상태를 보존하고 없는 본문을 만들지 않음; 답변 저장/수신자 공개/자동 재호출을 추가하지 [-않음"-]{+않음. 예외: 제목 형식 고쳐 쓰기(제목당 최대 3회, 요청당 상한 안, 호출이 실패하면 다시 부르지 않음)"+}
    source: [FR2.1, FR2.2]
  - id: BR3.5
    statement: 결과 전달과 Catch 등록·공개를 분리한다
@@ -44,7 +44,7 @@ rules:
    applies_to: AnalysisResult
    trigger: E로 결과 전달 및 수신 확인
    logic: "ResultReceipt는 식별 가능한 세 ID가 있을 때만 사용; E의 형식/맥락 확인과 B 등록은 별개. 같은 결과 재전달은 기존 결과 참조"
    violation: "식별 불가 메시지는 Receipt 없이 거부 기록만 남기고 ID를 추정하지 않음; F가 DB 저장/공개 또는 새 분석 재시도를 수행하지 [-않음"-]{+않음. 한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다"+}
    source: [FR2, FR2.2, FR1.4]
```

@@ -53,7 +53,7 @@ rules:
| 규칙 | 확인할 경계 |
|---|---|
| BR3.1 | E 요청·동의 연결, F 허용 범위 |
| BR3.2·BR3.3 | 적합 후보/근거와 미제공 사유·오류·0건 구분. title은 [-작업 사실의-]{+근거로 확인되는 조각(대상·종류·동작)으로만 만든+} 짧은 명사구이며 [-생성 실패 시 workFacts 첫 항목 사용-]{+생성이나 확인에 실패하면 null(제목만 null이면 failures 아님)+} |
| BR3.4 | 초안 실패와 등록 기준 분리, 최소 질문 F→E→B |
| BR3.5 | F 결과 의미 / E 수신·반영 / B 정본·공개 분리 |

diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml b/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
index dcd14ed..510b828 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
@@ -169,7 +169,7 @@ components:
        - "sourceMode"
      properties:
        catchId: {"type":"string","minLength":1}
        title: [-{"type":"string","minLength":1}-]{+{"type":"string","minLength":1,"nullable":true}+}
        repositoryId: {"type":"string","minLength":1}
        sourceRequestId: {"type":"string","minLength":1}
        sourceResultId: {"type":"string","minLength":1}
@@ -194,7 +194,7 @@ components:
      required: ["catchId","title","workFacts","subjectContribution","evidence","draft"]
      properties:
        catchId: {"type":"string","minLength":1}
        title: [-{"type":"string","minLength":1}-]{+{"type":"string","minLength":1,"nullable":true}+}
        workFacts: {"type":"array","items":{"type":"string"}}
        subjectContribution: {"type":"string"}
        evidence: {"type":"array","items":{"$ref":"#/components/schemas/PublicEvidence"}}
diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md b/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
index 7a1879e..8b8e324 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
@@ -66,7 +66,7 @@ components:
**전이·불변 조건**

- 접수는 QUEUED/NOT_READY/ACTIVE. F 진행은 RUNNING, 실행이 확인되지 않으면 UNCERTAIN을 유지한다. #77 이전에 큐 시간 초과로 실패 확정하는 규칙은 만들지 않는다.
- 검증된 종결 결과 수신 뒤 PENDING → APPLYING → APPLIED. 반영 오류는 APPLY_FAILED, 복구 작업이 실제 진행할 때만 RECOVERING이다. 둘 다 ACTIVE로 잠그며 새 분석을 실행하지 않는다. 저장 결과 재전달·반영 복구와 분석/LLM 재호출은 별개이고 이번 계약은 자동 분석 재시도를 허용하지 않는다. {+한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다.+}
- APPLIED는 결과/실패 의미의 반영도 포함한다. EMPTY도 결과 0건이라는 사실을 저장한 뒤 APPLIED/CLOSED이며 정상 완료다. FAILED는 실패가 확정되고 반영할 유효 결과가 없다는 사실이 저장된 뒤 APPLIED/CLOSED가 될 수 있다.
- SUCCEEDED는 후보 1개 이상이고 실패 0건, EMPTY는 후보 0개·실패 0건이다. PARTIAL_FAILED는 실패와 분리된 적합 후보 1개 이상과 실패 1건 이상, FAILED는 후보 0개·실패 1건 이상이다. 근거 부족·등록 기준 미달은 notProvided로 구분하며 그 자체를 시스템 오류로 만들지 않는다.
- 초안 실패라도 근거·기여/등록 조건을 충족한 후보를 제공한다. 초안/질문 실패는 해당 결과와 failures에 분리해 담는다. 본문은 GENERATED일 때만 문자열, 나머지는 null이다. 초안이 없다고 후보 없음/등록 불가로 바꾸지 않는다. 질문 실패의 보완 경로는 OQ-B2에 남긴다.
@@ -91,6 +91,8 @@ B의 판정 결과·등록과 E 반영 확인은 재진입 가능해야 한다.

workIdentity 생성은 F가 제안하고 B/E가 검토한다(OQ-F2). 같은 근거 일부를 공유해도 다른 작업임을 확인하면 별도 Catch, 같은 작업의 표현만 바꾸면 중복이다. 이 계약이 커밋마다 Catch를 만드는 규칙은 아니다.

{+Catch 제목(Candidate·Catch·PublicCatch의 `title`)은 필수 칸이되 값 없음을 허용한다(null 허용, 값이 있으면 1자 이상). 제목이 없으면 null이며 생성된 제목처럼 꾸미지 않는다. 근거 목록 순서가 표시 순서다. B는 받은 evidence 순서를 저장하고 회원·수신자 응답의 evidence를 같은 순서로 돌려준다.+}

## P — 수신자 API

```yaml
@@ -135,7 +137,7 @@ components:

생성 POST는 Idempotency-Key를 사용자·operation에 묶는다. 동일 키/정규화된 동일 본문은 기존 응답·자원 참조를 반환하고 다른 본문은 409다. 저장 전/응답 유실이 불명확하면 새 키로 자동 재전송하지 않는다. 요청/발급 기록이 존재하는 동안 중복 방지 연결을 유지하며 기록 삭제 후 키 재사용 규칙은 보관 정책 결정 없이 추정하지 않는다. Catch 확인/공개/표시와 링크 중단은 PUT 상태 지정으로 반복 적용해도 추가 생성이 없다.

HTTP timeout은 실패 확정 증거가 아니다. web은 재조회·사용자 재요청을 구분한다. 정량 timeout/처리 상한은 기술 검증 후 이슈로 보완하며 자동 외부 재시도·추가 호출을 허용하지 않는다. {+worker는 한 분석 안에서 Catch 제목이 형식을 어겼을 때만 제목을 고쳐 쓰려고 LLM을 다시 부를 수 있다. 제목당 최대 3회이고, 요청당 고쳐 쓰기 호출 상한(이슈에서 정함)과 요청당 총 처리 시간 상한 안이며 생성 호출 상한에는 세지 않는다. 요청당 상한에 이르면 그 뒤 제목은 null로 둔다. 생성 호출이나 고쳐 쓰기 호출이 실패하면(시간 초과·서버 오류 포함) 다시 부르지 않는다.+}

## W — worker 메시지 계약

@@ -155,7 +157,7 @@ components:
|---|---|
| Request | E가 영속 요청/새 동의에 연결한 requestId·attemptId·memberId·repositoryId·consentId와 허용 scope를 제공. scope의 허용 자료 종류는 요청마다 한정하며 전체 종류 열거가 수집 허가가 아님 |
| ProcessingEvent | RECEIVED/RUNNING은 F 관측, UNCERTAIN은 실행 불명. 순서 역전으로 종결 상태를 되돌리지 않음. 전달 방식·실행 불명 해소는 #77 |
| Result | 후보는 근거/기여와 실패 분리 확인을 충족한 것만. notProvided의 근거 부족/기준 미달과 failures의 수집/생성 오류를 구분. {+초안이 나왔는데 제목만 null인 경우는 failures가 아니다.+} schemaVersion=1 |
| ResultReceipt | resultId·requestId·attemptId를 모두 식별할 수 있는 메시지에만 전송. E의 형식·맥락 검사 후 ACCEPTED/DUPLICATE/REJECTED. ACCEPTED는 DB/Catch 등록 완료가 아니며 E application이 별도로 표시 |
| mock 연결 | 같은 Request/Result를 합성 fixture·가짜 생성기로 연결. sourceMode=MOCK를 유지하고 실제 분석 성공으로 표시하지 않음. 제공자명·모델명·SDK·API 키 의존 필드 없음 |

diff --git a/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml b/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
index 6a3178c..dae65fc 100644
--- a/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
+++ b/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
@@ -82,7 +82,7 @@ components:
        - "reflection"
      properties:
        candidateId: {"type":"string","minLength":1}
        title: [-{"type":"string","minLength":1}-]{+{"type":"string","minLength":1,"nullable":true}+}
        workIdentity: {"type":"string","minLength":1}
        workFacts: {"type":"array","items":{"type":"string"}}
        subjectContribution: {"type":"string"}
````

### 최종 검사 — final-preservation

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
python3 /private/tmp/catchu-title-1009/final-preservation.py
```

exit_code: 0

````text
{
  "head": "3b025df9ba5c2d5285a4cacd28382e7a3fd45a28",
  "merge_base": "3b025df9ba5c2d5285a4cacd28382e7a3fd45a28",
  "branch": "docs/catch-title-contract-1009",
  "tracked_count": 1077,
  "protected_count": 243,
  "december_count": 36,
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml"
  ],
  "unexpected_tracked_changes": [],
  "protected_changed": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_protected_changes": [],
  "status": [
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md"
    },
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml"
    },
    {
      "status": "??",
      "path": ".local-handoffs/catch-title-contract-codex.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/github-issues-crosscheck-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-117-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-118-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-118-plan.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-217-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-217-plan.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/parallel-work-status.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-06.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-07.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-08.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-09-verification.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-09-verification.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/single-2026-10-09-verification.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-tools.json"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-verification.md"
    }
  ],
  "unexpected_status": [],
  "target_diff_paths": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml"
  ],
  "audit": {
    "bytes": 178695,
    "head_bytes": 143643,
    "start_bytes": 156038,
    "preexisting_uncommitted_bytes": 12395,
    "backup_tail_bytes": 11847,
    "session_start_bytes": 548,
    "current_added_since_start_bytes": 22657,
    "head_prefix_preserved": true,
    "start_prefix_preserved": true,
    "backup_tail_preserved": true,
    "current_event_counts": {
      "ARTIFACT_CREATED": 5,
      "ARTIFACT_UPDATED": 8,
      "DECISION_RECORDED": 4,
      "HUMAN_TURN": 5,
      "SUMMARY_CONFIRMATION_RECORDED": 4,
      "SESSION_COMPACTED": 2,
      "ERROR_LOGGED": 1,
      "STAGE_STARTED": 3,
      "CHANGE_ACCEPTED": 9,
      "REVIEW_REQUESTED": 3,
      "REVIEW_COMPLETED": 3,
      "STAGE_COMPLETED": 3,
      "SESSION_ENDED": 1,
      "SESSION_STARTED": 1
    }
  },
  "tail_metadata": {
    "bytes": 11847,
    "sha256": "4cf9ce04f9685951baf654d825d4f0ca04ec7ba2dec4aa7ae7b70d8d27d208af",
    "event_counts": {
      "SESSION_ENDED": 16,
      "SESSION_RESUMED": 4,
      "HUMAN_TURN": 34,
      "SESSION_STARTED": 12,
      "SESSION_COMPACTED": 5
    },
    "session_ids": [
      "01a0d704-2d63-7582-9733-eecabb1c8a5a",
      "01a111bd-83b6-7260-be9a-07d1ad89ebd1",
      "01a11335-60f7-7331-8a3a-6294e0fe2e5d",
      "01a113a3-e947-7983-92eb-1cd742416d02",
      "01a113b3-20dd-7fc3-b7d3-a183ae8ef7e8",
      "01a113d3-026a-7f32-a774-93f2d9dfb35f",
      "01a11538-063b-79b0-94e4-f2f6eef8488a",
      "01a11588-2312-7003-8d39-e6bbf8c7cd75",
      "01a118cc-302c-7d32-aabc-acdb7ae13345",
      "01a11928-4da9-7b73-a314-5a625b8244ad",
      "01a1192a-0880-7e43-9d7d-0968badc5fd5",
      "01a1192f-579e-7331-b38b-dea6c114bf20",
      "01a11a54-de06-7b50-8c29-9fd0dfa0e85f"
    ],
    "first_timestamp": "2026-10-06T10:07:28Z",
    "last_timestamp": "2026-10-08T07:18:10Z",
    "unexpected_event_types": []
  },
  "worker_spec_line40_byte_unchanged": true,
  "state_unchanged": true,
  "passed": true
}
````

### 로컬 커밋 연결

산출물 7개 커밋: `e3058d0dd8f97be51a5496da95b105e17ab541bb`. 메시지: `docs: Catch 제목 null 허용과 제목 고쳐 쓰기 예외를 계약·설계에 반영 (#120)`. 기록 커밋의 감사 꼬리 포함은 팀장이 승인했고, 추가 API 검사 조건도 아래와 같이 충족했다. 원격 push·PR은 미실행이다.

### 팀장 확인 뒤 API 전용 DB 재검사 및 기록 커밋

팀장은 착수 전 감사 꼬리 11,847바이트를 포함하는 기록 커밋을 승인하면서 Docker 기동 뒤 전용 DB로 npm test를 다시 실행하고, 실패하면 커밋하지 말도록 지시했다. 표시한 꼬리의 SHA-256 `4cf9ce04f9685951baf654d825d4f0ca04ec7ba2dec4aa7ae7b70d8d27d208af`와 사건 종류·세션·시각은 그대로다. 이 확인은 단계 요약 확인과 별개이며 확인된 질문 파일을 다시 저장하지 않았다.

**최종 결과: API npm test 통과 — 574 tests, 574 pass, fail/skipped/cancelled 0, exit 0.** 판본은 산출물 커밋 `e3058d0dd8f97be51a5496da95b105e17ab541bb`와 미커밋 검증 기록이다. 최초 Docker 미기동/DB 연결 거부 결과는 당시 결과로 보존하며 이 추가 실행이 최종 API 판정이다.

5433 리스너가 없고 이름 충돌도 없어 README대로 catchu-db-test를 만들었다. 127.0.0.1:5433/catchu_test, PostgreSQL 16, tmpfs이며 TEST_DB_*를 명시해 이 DB만 사용했다. 컨테이너 ID `510cec58f036d3cce09521a13c311188a95eec3aae9b143ae0e0d0cb03d60ac4`의 pg_isready 성공 뒤 테스트했다. 종료 후 이 ID만 삭제하고 docker ps -a로 부재 및 기존 컨테이너 보존을 확인했다. 실회원 자료·외부 GitHub 원문을 사용하지 않은 로컬 합성/API·DB 검사이며 운영 배포·실제 LLM 완료 증거는 아니다.

재검사 뒤 보존 대조도 통과했다. 기존 추적 파일은 지정 7개와 감사 외 변화가 없고 상태·12월 36개·서비스 코드·의존성 파일·기존 승인 기록을 보존했다. 감사는 179,235바이트 = origin/dev 143,643 + 준비 꼬리 11,847 + 이번 시작 기록 548 + 착수 이후 23,197이며 원본/착수 앞부분과 꼬리가 그대로다. CHANGE_ACCEPTED 9건, SUMMARY_ARTIFACT_UNAUTHORIZED 0건이다. 기록 커밋 조건을 충족했으며 커밋 뒤 추가 감사 바이트는 끼워 넣지 않는다. push·PR은 아직 승인받지 않아 실행하지 않는다.

### 추가 실행 원문 — db-retry-create

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
docker run -d --name catchu-db-test -p 127.0.0.1:5433:5432 -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu_test --tmpfs /var/lib/postgresql/data postgres:16
```

exit_code: 0

````text
510cec58f036d3cce09521a13c311188a95eec3aae9b143ae0e0d0cb03d60ac4
````

### 추가 실행 원문 — db-retry-ready

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
docker exec 510cec58f036d3cce09521a13c311188a95eec3aae9b143ae0e0d0cb03d60ac4 pg_isready -U catchu -d catchu_test
```

exit_code: 0

````text
/var/run/postgresql:5432 - accepting connections
````

### 추가 실행 원문 — api-test-with-db

작업 위치: `/Users/ljm/Desktop/github/CatchU/api`

```text
TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5433 TEST_DB_USER=catchu TEST_DB_PASSWORD=catchu_local TEST_DB_NAME=catchu_test npm test > /private/tmp/catchu-title-1009/api-test-with-db.log 2>&1
```

exit_code: 0

````text

> @catchu/api@0.0.0 test
> npm run build && node scripts/test-with-db.cjs


> @catchu/api@0.0.0 build
> node scripts/clean-dist.cjs && tsc -p tsconfig.build.json

테스트 DB(127.0.0.1:5433/catchu_test) 마이그레이션 적용: 새로 적용 5개
✔ 개발 주입 차단: 설정 없음 (0.997833ms)
✔ 개발 주입 차단: false (0.091875ms)
✔ 개발 주입 차단: 1 (0.082833ms)
✔ 개발 주입 차단: production + true (0.076167ms)
✔ 개발 주입 차단: 미지정 환경 (0.08475ms)
✔ 접수 대역의 본인 맥락으로만 템플릿을 채우며 MOCK을 유지한다 (4.523375ms)
✔ 타인/없는 요청, LIVE 요청/템플릿, 고정 값으로 요청을 바꾸는 주입은 차단한다 (0.495708ms)
✔ 주입도 식별자 누락을 복구하지 않으며 진행 이벤트에 Receipt를 만들지 않는다 (0.730208ms)
✔ #87 Guard/CurrentMemberId와 연결한 테스트 전용 주입: 인증 없음/타인 차단, 본인 정상 (289.661875ms)
✔ Nest 조립 시 주입 설정 없음이면 인증해도 거부한다 (66.999ms)
✔ Nest 조립 시 production + 주입 설정 true라도 인증된 주입을 거부한다 (42.862083ms)
✔ 진행 RECEIVED: 결과 ID/Receipt 없이 관측하며 계약의 전이만 반영 (1.378916ms)
✔ 진행 RUNNING: 결과 ID/Receipt 없이 관측하며 계약의 전이만 반영 (0.246083ms)
✔ 진행 UNCERTAIN: 결과 ID/Receipt 없이 관측하며 계약의 전이만 반영 (0.107833ms)
✔ 진행 형식/맥락/현재 시도 오류는 상태에 반영하지 않는다 (0.283917ms)
✔ SUCCEEDED: 메타데이터 저장 후 ACCEPTED, 등록/열람 준비/요청 종료는 하지 않는다 (4.8315ms)
✔ EMPTY: 메타데이터 저장 후 ACCEPTED, 등록/열람 준비/요청 종료는 하지 않는다 (0.25075ms)
✔ PARTIAL_FAILED: 메타데이터 저장 후 ACCEPTED, 등록/열람 준비/요청 종료는 하지 않는다 (1.668666ms)
✔ FAILED: 메타데이터 저장 후 ACCEPTED, 등록/열람 준비/요청 종료는 하지 않는다 (0.205208ms)
✔ 진행 이전 결과, 중복 진행, 확정되지 않은 진행 간 전이를 구분한다 (0.321333ms)
✔ 초안 실패 적합 후보는 제거하지 않으며 정상 0건과 기준 미달을 구분한다 (0.276292ms)
✔ 세 ID 누락/빈 값/타입 오류는 Receipt 없이 안전한 거부 코드만 남긴다 (0.241958ms)
✔ 식별 가능한 형식/의미 오류는 REJECTED/SCHEMA_INVALID이고 입력을 보정하지 않는다 (0.53675ms)
✔ 회원/저장소/동의/범위/자료 모드/요청과 현재 시도를 접수 정본과 대조한다 (0.492416ms)
✔ 같은 결과 재전달/객체 키 순서/새 messageId는 중복이며 payload 충돌을 덮어쓰지 않는다 (0.392542ms)
✔ 동시 재전달은 저장소 원자 구간에서 한 번만 저장하고 중복으로 수렴한다(대역) (0.408583ms)
✔ 커밋 전에는 Receipt가 반환되지 않고 저장/커밋 실패에도 성공 확인을 만들지 않는다 (3.82025ms)
✔ await 중 입력 변경을 저장하지 않고 반영/복구 상태에서 중복은 현재 상태를 보존한다 (0.424917ms)
✔ 현재 시도가 바뀌었거나 불완전한 종결 기록이면 기존 상태를 보존한다 (0.223083ms)
✔ 수신 스키마가 OpenAPI nullable 초안과 필수 값 경계를 그대로 사용한다 (0.066458ms)
✔ 토큰 없는 보호 API는 AUTH_REQUIRED, health와 명시적 공개 경로는 200 (146.403958ms)
✔ 존재하지만 잘못된 Authorization 헤더는 AUTH_INVALID이며 원문을 노출하지 않는다 (31.927459ms)
✔ 개발 로그인 토큰의 회원 ID를 읽으며 요청 입력으로 대체하지 않는다 (71.6285ms)
✔ 변조·만료·필수 값 오류 토큰은 AUTH_INVALID이며 토큰·JWT 오류를 노출하지 않는다 (37.760958ms)
✔ 명시적으로 켠 개발 로그인은 development에서 허용 (36.875208ms)
✔ 명시적으로 켠 개발 로그인은 test에서 허용 (30.24675ms)
✔ 개발 로그인 거부: 설정 없음 (24.154542ms)
✔ 개발 로그인 거부: 명시적 비활성 (28.299959ms)
✔ 개발 로그인 거부: 정확한 true가 아닌 값 (22.805125ms)
✔ 개발 로그인 거부: NODE_ENV 미지정 (25.107708ms)
✔ 개발 로그인 거부: NODE_ENV 공란 (28.67125ms)
✔ 개발 로그인 거부: staging 환경 (35.044875ms)
✔ 개발 로그인 거부: 그 밖의 환경 (31.241667ms)
✔ 개발 로그인 거부: 대소문자가 다른 환경 (23.462542ms)
✔ 개발 로그인 거부: 공백이 포함된 환경 (34.677583ms)
✔ 개발 로그인 거부: 운영 환경에서 활성화 요청 (19.350916ms)
✔ 개발 로그인의 잘못된 회원 ID는 VALIDATION_FAILED와 필드·규칙 이름으로 응답한다 (40.481542ms)
✔ 개발 로그인은 추가 필드를 제거해 통과시키지 않고 입력값 없이 검증 오류로 거부한다 (24.231666ms)
✔ 비밀값 기본값이 없고 수명·서명 키 설정 오류에 실제 값을 노출하지 않는다 (0.449208ms)
✔ 회원 토큰 변조·만료·형식 오류는 보안 사건 한 줄씩, 분류 코드·경로 틀·시각·요청 식별자만 남긴다 (26.146125ms)
✔ 토큰 없는 요청·정상 요청·다른 업무 거부는 보안 사건으로 남기지 않는다 (27.14775ms)
✔ 요청 식별자는 같은 요청에 같은 값, 다른 요청에 다른 값이다 (0.22975ms)
✔ 새 Catch는 입력에 공개·확인 값을 주입해도 미공개·미확인으로 시작한다 (0.655791ms)
✔ 후보의 제목·설명·작업 키와 근거의 출처·한계를 변조하지 않는다 (0.387917ms)
✔ 초안·질문이 FAILED여도 내용을 꾸며 넣거나 근거를 버리지 않는다 (0.087167ms)
✔ 초안·질문이 NOT_GENERATED여도 내용을 꾸며 넣거나 근거를 버리지 않는다 (0.061542ms)
✔ 생성 상태와 본문이 모순되면 임의 보정하지 않고 거부한다 (0.719375ms)
✔ MOCK/LIVE를 보존하고 알 수 없는 생성 방식을 실제 분석으로 바꾸지 않는다 (0.0935ms)
✔ 변환 중 발생한 일반 Error와 TypeError는 입력 거부로 재분류하지 않는다 (0.103625ms)
✔ 변환 전후 배열을 공유하지 않아 후보 변경이 준비한 근거를 바꾸지 않는다 (0.078ms)
▶ 본인 Catch HTTP·PostgreSQL
  ✔ 개발 로그인 회원이 조회·확인·공개·숨김하고 타인 변경은 거부하며 수신자 조회에 반영한다 (181.303792ms)
  ✔ 본인 목록·상세는 계약 필드를 반환하며 조회로 DB를 바꾸지 않는다 (72.538334ms)
  ✔ repositoryId와 sourceRequestId는 본인 범위 안에서 AND로 적용한다 (100.32175ms)
  ✔ 페이지 기본20·최대100, 마지막 페이지, 커서의 회원·필터 결합을 확인한다 (210.592083ms)
  ✔ 토큰 없는 목록·상세·변경 요청은 공통 401이고 /v1 밖에는 기능 경로가 없다 (34.842584ms)
  ✔ 유효한 서명이어도 legacy-sub 토큰은 Catch 조회·변경을 401로 거부한다 (54.988416ms)
  ✔ 유효한 서명이어도 missing-member 토큰은 Catch 조회·변경을 401로 거부한다 (67.544125ms)
  ✔ 유효한 서명이어도 deleted-member 토큰은 Catch 조회·변경을 401로 거부한다 (92.744958ms)
  ✔ 회원 조회 DB 오류는 인증 거부나 빈 목록이 아닌 안전한 500으로 처리한다 (55.104833ms)
  ✔ 타인·없는·UUID가 아닌 Catch는 같은 404이며 다른 회원 입력으로 우회하지 못한다 (180.06225ms)
  ✔ 목록·상세 쿼리와 PUT 본문은 추가 키·중복 키·잘못된 타입을 400으로 거부한다 (117.962875ms)
  ✔ 확인은 두 값을 함께 true로 저장하고 PRIVATE·불일치·나머지 자료를 보존하며 반복 가능하다 (55.918916ms)
  ✔ 불일치는 true/false 상태 지정이며 공개·확인·본문·출처·근거를 바꾸지 않는다 (78.265792ms)
  ✔ SOURCE_PRIVATE도 본인은 조회하고 제한 상태를 보며 자동 공개 변경은 없다 (47.416ms)
  ✔ 보호 판단 행 누락은 상세·전체 목록의 500이며 NONE 또는 빈 목록으로 숨기지 않는다 (71.952334ms)
  ✔ 보호 관측 상태 SQL null은 조회 500과 확인·불일치 저장 롤백으로 처리한다 (112.776083ms)
  ✔ 보호 관측 상태 JSON null은 조회 500과 확인·불일치 저장 롤백으로 처리한다 (103.900541ms)
  ✔ 보호 관측 출처 SQL null은 조회 500과 확인·불일치 저장 롤백으로 처리한다 (98.122583ms)
  ✔ 보호 관측 출처 JSON null은 조회 500과 확인·불일치 저장 롤백으로 처리한다 (86.347667ms)
  ✔ 보호 관측 시각 SQL null은 조회 500과 확인·불일치 저장 롤백으로 처리한다 (95.962708ms)
  ✔ 보호 관측 조회 실패만 존재은 조회 500과 확인·불일치 저장 롤백으로 처리한다 (124.102917ms)
  ✔ 유효 관측 뒤 최근 조회 실패가 있어도 본인 조회·확인·불일치를 허용한다 (146.181292ms)
  ✔ 실제 DB 조회 오류는 상세·목록의 500이며 SQL이나 빈 자료를 응답하지 않는다 (46.354834ms)
  ✔ 실제 DB 변경 실패는 확인·불일치 PUT을 500으로 끝내고 전체 자료를 보존한다 (43.34625ms)
  ✔ 저장 뒤 응답 무결성 검사 실패도 확인·불일치 변경을 함께 롤백한다 (44.909875ms)
  ✔ 공개 PUT은 PUBLIC/PRIVATE만 받고 추가 필드·쿼리·잘못된 본문을 거절한다 (50.179958ms)
  ✔ 두 확인 항목을 모두 저장하기 전에는 409이며 PRIVATE을 유지한다 (65.049958ms)
  ✔ 생성·확인 후에는 비공개, 별도 공개 후 노출, 숨긴 뒤 다음 공개 조회에서 제외된다 (110.232667ms)
  ✔ 불일치 표시와 초안·질문 생성 실패는 독립적이며 공개 필드만 전달한다 (173.7155ms)
  ✔ 현재 원본 보호가 제한되면 공개는 409, 수신자는 제외, 본인 조회·숨김은 가능하다 (78.282708ms)
  ✔ 수신자 상세에서 숨김·타인·없는·원본 제한 Catch는 동일한 404이다 (68.796125ms)
  ✔ 수신자 페이지는 현재 허용 집합을 조회하고 숨김·보호 변경을 다음 페이지에도 적용한다 (188.851542ms)
  ✔ 수신자 커서는 본인용·다른 소유자와 섞이지 않고 잘못된 필터를 거절한다 (93.956375ms)
  ✔ 보호 행 누락·DB 오류·응답 무결성 오류를 공개 가능이나 빈 결과로 보정하지 않는다 (71.774791ms)
  ✔ 보호 관측 상태 SQL null이면 공개 변경을 롤백하고 수신자 조회도 실패한다 (105.257292ms)
  ✔ 보호 관측 상태 JSON null이면 공개 변경을 롤백하고 수신자 조회도 실패한다 (88.610958ms)
  ✔ 보호 관측 출처 SQL null이면 공개 변경을 롤백하고 수신자 조회도 실패한다 (113.902792ms)
  ✔ 보호 관측 출처 JSON null이면 공개 변경을 롤백하고 수신자 조회도 실패한다 (115.698125ms)
  ✔ 보호 관측 시각 SQL null이면 공개 변경을 롤백하고 수신자 조회도 실패한다 (110.227ms)
  ✔ 이전 유효 관측에 최근 조회 실패가 추가되어도 공개와 수신자 조회를 허용한다 (87.458708ms)
  ✔ 공개 저장·응답 매핑에 실패하면 PUBLIC 변경을 롤백한다 (102.818375ms)
  ✔ 보호 변경이 먼저 잠그면 공개 요청은 대기 후 최신 제한을 읽고 409로 거절한다 (103.274084ms)
✔ 본인 Catch HTTP·PostgreSQL (4459.555417ms)
✔ 본인 응답은 common.yaml의 필드만 내보내고 저장소는 원 요청에서 구한다 (1.946916ms)
✔ 타인 자료는 PUBLIC이어도 존재하지 않는 자료와 같은 null을 반환한다 (0.142584ms)
✔ 원 요청의 회원·식별자와 근거의 Catch 연결이 다르면 성공 응답을 만들지 않는다 (0.36775ms)
✔ 보호 자료 누락 또는 회원·저장소 불일치를 NONE으로 보정하지 않는다 (0.215458ms)
✔ 관측 상태·출처·시각의 null·누락은 상세와 전체 페이지를 실패시킨다 (0.44825ms)
✔ 이전 유효 관측이 있으면 최근 실패 정보가 있어도 적용된 보호 상태를 보존한다 (0.094041ms)
✔ 확인 두 값·불일치·공개·보호·출처 모드는 서로 독립적으로 보존한다 (0.972292ms)
✔ 초안 실패·미생성을 Catch 없음으로 바꾸지 않고 상태와 null 본문을 보존한다 (0.107916ms)
✔ 초안 생성 상태와 본문이 모순되면 실패한다 (0.139625ms)
✔ 등록된 Catch의 작업 사실·근거·근거가 대표하는 사실은 1개 이상이어야 한다 (0.198292ms)
✔ 같은 Catch 안에서 근거 기본키 또는 원본 근거 ID가 중복되면 실패한다 (0.140791ms)
✔ 서로 다른 근거는 저장된 순서와 최소 질문을 그대로 제공한다 (0.108916ms)
✔ 근거 출처는 URI여야 하며 잘못된 값이 내부 오류 메시지에 섞이지 않는다 (0.0975ms)
✔ 필수 식별자·열거형·불리언 오류를 기본값으로 숨기지 않는다 (0.257834ms)
✔ 조회 변환은 입력을 변경하지 않으며 반환 배열을 고쳐도 정본 자료는 변하지 않는다 (0.183ms)
✔ 정상 조회한 빈 페이지는 빈 items와 전달받은 커서를 보존한다 (0.077375ms)
✔ 본인 페이지는 순서와 커서를 유지하고 필터·페이지 종료를 임의로 결정하지 않는다 (0.069458ms)
✔ 페이지에 타인·누락·깨진 본인 자료가 섞이면 일부 결과나 빈 목록으로 숨기지 않는다 (0.115416ms)
✔ 인증 회원 ID가 없거나 커서 자료형이 틀리면 성공 페이지를 만들지 않는다 (0.082625ms)
✔ 적합 후보의 저장값은 미공개·미확인이며 저장 완료 정보는 만들지 않는다 (0.806209ms)
✔ 같은 작업은 제목이 달라도 한 묶음이며 두 후보의 내용을 각각 보존한다 (0.568292ms)
✔ 서로 다른 작업은 제목과 근거가 같아도 합치지 않는다 (0.135125ms)
✔ 작업 키를 공백 제거·대소문자 변환으로 임의 정규화하지 않는다 (0.156875ms)
✔ 후보가 없으면 빈 준비 결과만 반환하고 결과의 성공·실패를 판정하지 않는다 (0.265291ms)
✔ 같은 결과 안의 후보 ID 중복은 작업 키가 같거나 달라도 거부한다 (0.114708ms)
✔ 근거·기여 확인 또는 실패 영향 분리 조건이 충족되지 않으면 거부한다 (0.158667ms)
✔ 등록에 필요한 제목·작업·기여·근거 누락과 잘못된 형식을 거부한다 (0.324167ms)
✔ 한 후보 안에서 같은 근거 ID를 두 번 등록하려는 입력은 거부한다 (0.093ms)
✔ 초안이나 질문 중 하나만 실패해도 다른 등록 조건이 맞으면 준비한다 (0.129125ms)
✔ 뒤쪽 후보가 잘못되면 앞쪽 후보만 성공 반환하거나 입력을 수정하지 않는다 (0.424125ms)
✔ 분류 결과와 입력의 배열을 분리하고 오류에 후보 원문을 싣지 않는다 (0.135958ms)
✔ 입력 거부 오류의 메시지·필드·원인에 후보 본문·ID·URL을 싣지 않는다 (0.885375ms)
✔ 검사 중 뜻밖의 Error와 TypeError를 입력 거부로 감싸지 않는다 (0.161875ms)
▶ Catch 등록 PostgreSQL
  ✔ 실제 요청·동의·시도는 지정 ID로 연결되며 기존 ACTIVE 요청을 자동 종료하지 않는다 (60.411291ms)
  ✔ 새 후보는 PRIVATE Catch·근거·후보 연결을 함께 저장한다 (30.051166ms)
  ✔ 원 요청 저장소의 보호 판단이 없으면 이번 등록 전체를 롤백하고 준비됐다고 기록하지 않는다 (24.185792ms)
  ✔ NONE: 최초 조회 실패만 남음이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (29.363125ms)
  ✔ SOURCE_PRIVATE: 최초 조회 실패만 남음이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (28.532041ms)
  ✔ NONE: 확인 상태 SQL NULL이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (30.386167ms)
  ✔ SOURCE_PRIVATE: 확인 상태 JSON null이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (33.010958ms)
  ✔ NONE: 확인 출처 SQL NULL이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (44.16875ms)
  ✔ SOURCE_PRIVATE: 확인 출처 JSON null이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (30.492666ms)
  ✔ NONE: 확인 시각 SQL NULL이면 신규 등록 전체를 롤백하고 수신·보호 기록을 보존한다 (57.395167ms)
  ✔ NONE: 유효 관측이 빠지면 기존 등록 재전달과 새 요청의 기존 Catch 참조를 거부한다 (63.159666ms)
  ✔ NONE: 이전 유효 관측과 최근 조회 실패가 함께 있으면 열람 준비와 보호 자료를 유지한다 (65.842125ms)
  ✔ SOURCE_PRIVATE: 유효 관측이 빠지면 기존 등록 재전달과 새 요청의 기존 Catch 참조를 거부한다 (75.182834ms)
  ✔ SOURCE_PRIVATE: 이전 유효 관측과 최근 조회 실패가 함께 있으면 열람 준비와 보호 자료를 유지한다 (51.648333ms)
  ✔ SOURCE_PRIVATE 보호가 있어도 본인 열람 준비는 허용하며 보호 판단을 바꾸지 않는다 (68.240583ms)
  ✔ 다른 소유자의 같은 저장소 보호 판단은 본인의 누락 판단을 대신하지 않는다 (36.186917ms)
  ✔ 생성 실패·미생성 상태는 등록 후에도 보존한다 (28.245167ms)
  ✔ 호출자가 E 완료 상태를 같은 manager로 쓰면 B 자료와 함께 커밋된다 (53.517333ms)
  ✔ 두 후보가 같은 작업이면 Catch 하나와 후보 연결 두 개를 만든다 (33.8325ms)
  ✔ 같은 수신 기록 재호출은 같은 ID와 최초 CREATED 판정을 보존한다 (34.426875ms)
  ✔ 보호 판단이 없어진 뒤 재전달되면 과거 ready 값을 성공으로 다시 반환하지 않는다 (30.781833ms)
  ✔ 기존 Catch의 저장소 불일치는 원 요청의 보호 판단 부재보다 먼저 거부한다 (45.509875ms)
  ✔ 유효한 대문자 UUID도 같은 맥락으로 등록·재호출하며 입력을 바꾸지 않는다 (36.026125ms)
  ✔ 같은 sourceMode·저장소의 다른 요청과 재반영은 기존 본문·출처·공개·확인·근거를 보존한다 (71.467042ms)
  ✔ 같은 소유자·작업의 기존 Catch와 sourceMode가 다르면 새 연결을 거부한다 (49.624958ms)
  ✔ 저장된 후보 연결도 기존 Catch와 sourceMode가 다르면 재반영을 거부한다 (65.397792ms)
  ✔ 앞 그룹 저장 뒤 기존 Catch의 sourceMode가 충돌하면 전체 롤백하고 E·수신 기록을 보존한다 (53.576416ms)
  ✔ 같은 소유자·작업의 기존 Catch와 저장소가 다르면 새 연결을 거부한다 (52.791333ms)
  ✔ 저장된 후보 연결도 기존 Catch와 저장소가 다르면 재반영을 거부한다 (62.482459ms)
  ✔ 앞 그룹 저장 뒤 기존 Catch의 저장소가 충돌하면 전체 롤백하고 E·수신 기록을 보존한다 (76.975292ms)
  ✔ 기존 Catch의 원 요청 소유자가 다르면 재호출과 다른 요청의 참조를 거부한다 (83.160708ms)
  ✔ 서로 다른 작업은 같은 근거 ID가 있어도 각각 등록한다 (70.248334ms)
  ✔ 뒤 후보가 잘못되면 이번 반영 전체를 거부하고 수신 기록은 남긴다 (25.509208ms)
  ✔ 근거 INSERT의 DB 실패는 Catch와 연결까지 롤백한다 (31.595667ms)
  ✔ E 완료 기록이 실패하면 B 저장도 롤백되고 바깥에서 APPLY_FAILED만 남긴다 (49.788125ms)
  ✔ 지연 FK가 커밋에서 실패해도 B 저장과 E 완료 변경을 함께 롤백한다 (66.417041ms)
  ✔ 활성 트랜잭션 밖에서는 저장을 거부한다 (22.109917ms)
  ✔ 소유자·결과·출처 맥락이 다르면 저장을 거부한다 (36.492375ms)
  ✔ 현재 시도가 바뀐 늦은 수신 기록은 등록하지 않는다 (22.911625ms)
  ✔ 같은 수신 기록의 후보 집합 변경은 기존 등록을 보존하며 거부한다 (44.124959ms)
  ✔ 완료된 수신 기록 재전달과 후속 요청의 같은 작업 등록이 겹쳐도 기존 Catch를 보존한다 (69.755292ms)
  ✔ 같은 수신 기록 동시 호출은 최초 ID와 판정을 함께 반환한다 (52.623708ms)
  ✔ DB가 후보 연결의 FK와 유일성, Catch enum CHECK를 강제한다 (42.241625ms)
  ✔ #103 공용 합성 자료 succeeded-one-candidate: 후보를 그대로 등록하고 재전달 시 보존한다 (61.46275ms)
  ✔ #103 공용 합성 자료 two-candidates-same-work: 후보를 그대로 등록하고 재전달 시 보존한다 (83.170583ms)
  ✔ #103 공용 합성 자료 partial-failed: 후보를 그대로 등록하고 재전달 시 보존한다 (59.914541ms)
  ✔ #103 공용 합성 자료 empty: 후보를 그대로 등록하고 재전달 시 보존한다 (40.1075ms)
  ✔ #103 공용 합성 자료 failed: 후보를 그대로 등록하고 재전달 시 보존한다 (30.894542ms)
  ✔ B 마이그레이션 되돌리기는 선행 A/E 테이블·행을 보존하고 다시 적용된다 (90.132ms)
✔ Catch 등록 PostgreSQL (2551.585084ms)
✔ 공통 실행기가 전달한 테스트 DB를 TEST_DB 변수 없이 사용한다 (75.296667ms)
✔ 전체 검사에서는 원래 TEST_DB 변수보다 공통 실행기의 확정값을 따른다 (0.11975ms)
✔ 공통 설정이 없거나 개발 DB 이름이면 건너뛰지 않고 실패한다 (0.240542ms)
✔ B 전용 검사는 명시한 테스트 DB만 사용하고 누락·잘못된 이름을 거부한다 (0.116458ms)
▶ B의 외부 FK 메타데이터가 실제 A/E 엔티티와 기존 마이그레이션의 참조·이름·옵션을 보존한다
  ✔ fk_catch_asset_owner_id (1.080208ms)
  ✔ fk_catch_asset_source_request_id (0.100042ms)
  ✔ fk_repository_protection_owner_id (0.069375ms)
  ✔ fk_candidate_registration_application_record_id (0.072541ms)
✔ B의 외부 FK 메타데이터가 실제 A/E 엔티티와 기존 마이그레이션의 참조·이름·옵션을 보존한다 (16.526916ms)
✔ 주소 단위: IPv4는 그 주소 하나가 한 칸이다 (0.767708ms)
✔ 주소 단위: IPv4 매핑 IPv6는 점 표기·16진 표기·생략 없는 표기 모두 같은 IPv4와 한 칸이다 (3.75325ms)
✔ 주소 단위: 같은 IPv6 /64 안의 다른 주소는 표기가 달라도 한 칸이다 (0.143167ms)
✔ 주소 단위: 다른 /64는 다른 칸이다(/56 안의 이웃 /64 포함) (0.085958ms)
✔ 주소 단위: IPv4 매핑이 아닌 ::로 시작하는 IPv6는 IPv4로 바꾸지 않는다 (0.087125ms)
✔ 주소 단위: 없거나 해석할 수 없는 값은 unknown 한 칸이다 (1.130959ms)
✔ 출처 목록은 정확한 http(s) 출처만 받고 값은 오류에 넣지 않는다 (1.131041ms)
✔ http 출처는 development·test에서만 받고 production·미지정 등에서는 하나라도 있으면 거부한다 (0.261375ms)
✔ 허용한 web 출처는 CORS 헤더를 받고 Retry-After를 읽을 수 있다 (223.85975ms)
✔ 목록 밖 출처와 CORS 미설정은 허용 헤더를 받지 못한다 (68.580333ms)
✔ 잘못된 CORS 설정이면 앱을 시작하지 않는다 (15.571875ms)
✔ production에서 CORS 허용 출처에 http 주소가 있으면 앱을 시작하지 않는다: http://localhost:3000 (14.902375ms)
✔ production에서 CORS 허용 출처에 http 주소가 있으면 앱을 시작하지 않는다: https://catchu.example,http://catchu.example (15.647334ms)
✔ production에서 https 출처만 두면 앱이 시작되고 그 출처만 CORS 헤더를 받는다 (26.324375ms)
✔ 다시 빌드하면 소스에 없는 마이그레이션의 이전 빌드 결과가 탐색되지 않는다 (2257.004333ms)
✔ 규약대로 쓴 엔티티는 규약의 타입·이름으로 마이그레이션 SQL이 생성된다 (50.789583ms)
✔ 제약 이름은 결정적이고 PostgreSQL 식별자 길이(63자)를 넘지 않는다 (0.3085ms)
✔ 회원 생성은 기본 프로필·합성 연동과 원자적이며 반복·동시 로그인은 같은 UUID (106.46175ms)
✔ 개발 연동은 지정 repository 표본과 일치하며 자격정보 원문 없이 MOCK으로 조회 (33.593708ms)
✔ 기본 비활성·허용되지 않은 환경은 로그인 회원 생성과 개발 연결 조회를 모두 거부 (17.76925ms)
✔ development·test의 명시적 활성화는 회원 준비와 합성 연결 조회를 허용 (29.828209ms)
✔ 기존 회원 누락 프로필·실제 연동을 합성 자료로 보정하지 않으며 DB 오류는 실패 (26.5195ms)
✔ 프로필 저장 실패면 회원·연동까지 롤백하고 식별자 재사용으로 정상 복구 (19.069792ms)
✔ 회원당 프로필·연동 하나, 잘못된 enum·없는 회원을 DB가 거부 (16.127916ms)
✔ 요청·동의·첫 시도의 순환 FK를 한 트랜잭션으로 저장하고 실패시 세 행 전체 롤백 (32.858167ms)
✔ 중간 미완료 요청은 커밋에서 실패하며 동의·시도의 다른 요청/회원/저장소 연결도 거부 (34.762208ms)
✔ 회원당 ACTIVE 요청 하나를 동시 접수에서도 DB가 보장하고 CLOSED 후 다른 신규 요청은 허용 (29.292792ms)
✔ 동의는 요청당 하나이고 false 동의·음수 후보 수·처리 enum 위반을 거부 (26.577042ms)
✔ 같은 키 순차·동시 호출은 자원 하나와 동일 응답, 비교 함수를 재요청마다 실행 (40.452ms)
✔ 멱등 생성 HTTP 오류는 사용자 키 400·서버 내부 값 500·기존 요청 충돌 409로 구분하고 값을 노출하지 않음 (266.953084ms)
✔ 멱등 키의 1자·128자 경계와 유니코드 문자 수 검증을 유지 (48.816708ms)
✔ 다른 지문·동일 지문에서 비동기 비교 false는 충돌, 비교 예외는 서버 오류 그대로 (38.079125ms)
✔ 자원 생성·응답 구성·커밋 실패는 키와 자원을 모두 롤백하며 같은 키를 다시 사용할 수 있음 (45.953542ms)
✔ 멱등 member/operation/key 유일성과 연결 소유자·operation별 참조 무결성을 DB가 보호 (37.733334ms)
✔ 트랜잭션 없음·더 높은 격리 수준은 생성 전에 거부 (13.401875ms)
✔ C 링크 연결: 같은 지문·다른 비밀번호 판정은 409, 같은 manager로 만든 링크만 재생 (30.608709ms)
✔ 개발 로그인 HTTP 토큰의 UUID로 실제 분석 FK를 저장하며 반복 발급도 같은 회원 (85.905ms)
✔ 접수한 동의 변경과 재요청 선행 참조의 역방향 변경을 DB가 거부 (27.155208ms)
✔ 일곱 테이블은 빈 스키마에 up/down/re-up 가능하고 엔티티와 생성 DDL이 일치 (482.448458ms)
✔ 초기 프로필과 본인 회원의 허용 필드만 계약 형식으로 반환 (171.45325ms)
✔ 전체 저장 뒤 재조회하며 선택 항목 비우기·SELF_REPORTED·프로필 ID를 유지 (39.909208ms)
✔ 회원 둘의 조회·저장은 분리되고 본문·쿼리·경로로 대상을 바꾸지 못한다 (45.276334ms)
✔ 연동 상태 세 종류와 행 없음 DISCONNECTED를 투영하고 비밀 참조는 반환하지 않는다 (42.911125ms)
✔ 회원 API는 개발 로그인 플래그에 의존하지 않고 인증된 회원으로 동작 (22.531458ms)
✔ 토큰 없음·변조·만료는 조회와 저장에서 모두 401이며 원문을 노출하지 않는다 (18.131833ms)
✔ 없는·비활성·UUID 아닌 인증 주체는 같은 404이며 프로필을 생성하지 않는다 (33.215833ms)
✔ 필수 프로필 누락은 이름 미저장으로 숨기지 않으며 조회·저장 모두 500 (24.910625ms)
✔ 각 문자 제한 경계 저장·재조회와 초과 거부, 기존 값 보존 (50.091042ms)
✔ 기술 수·각 기술 길이 경계 저장 및 초과 거부 (33.586791ms)
✔ 빈·공백 이름, 필수 누락·타입·추가 필드 오류는 violations이며 저장하지 않는다 (89.864708ms)
✔ displayName의 NUL은 API에서 400으로 거부하며 DB 프로필·입력 원문 비노출을 유지 (37.028833ms)
✔ introduction의 NUL은 API에서 400으로 거부하며 DB 프로필·입력 원문 비노출을 유지 (38.208959ms)
✔ desiredRole의 NUL은 API에서 400으로 거부하며 DB 프로필·입력 원문 비노출을 유지 (34.437667ms)
✔ skills의 NUL은 API에서 400으로 거부하며 DB 프로필·입력 원문 비노출을 유지 (34.917375ms)
✔ displayName의 고립 서로게이트는 실제 API에서 400이며 DB 프로필과 원문 비노출을 유지 (183.913792ms)
✔ introduction의 고립 서로게이트는 실제 API에서 400이며 DB 프로필과 원문 비노출을 유지 (213.066709ms)
✔ desiredRole의 고립 서로게이트는 실제 API에서 400이며 DB 프로필과 원문 비노출을 유지 (202.036958ms)
✔ skills의 고립 서로게이트는 실제 API에서 400이며 DB 프로필과 원문 비노출을 유지 (221.659709ms)
✔ 정상 한글·이모지·올바른 서로게이트 쌍 저장은 PUT과 직후 GET 및 DB 값이 같다 (39.023792ms)
✔ NUL 이외의 제어문자를 추가 거부하지 않고 한글·이모지·빈 선택 입력을 저장 (57.081416ms)
✔ 실제 조회 SQL 실패는 500이고 복구 후 저장값을 다시 조회할 수 있다 (48.593625ms)
✔ 실제 저장 제약 실패는 500이며 기존 저장값과 프로필 행을 보존 (35.33725ms)
✔ 최종 커밋 실패도 성공 응답으로 보내지 않으며 전체 저장을 롤백 (31.903458ms)
✔ 신뢰 프록시 미설정: 꾸민 X-Forwarded-For는 무시하고 직접 연결 주소 하나로 센다 (2287.534292ms)
✔ 신뢰 프록시가 연결 주소를 포함하지 않으면 X-Forwarded-For를 무시한다 (2156.701792ms)
✔ 신뢰 프록시 설정: 프록시가 전한 주소별로 따로 센다 (4628.42425ms)
✔ 신뢰 프록시 설정: 수신자가 앞에 꾸며 넣은 주소는 무시하고 프록시가 붙인 마지막 주소로 센다 (2152.055417ms)
✔ 신뢰 프록시 설정: 같은 IPv6 /64는 한 칸, 다른 /64는 다른 칸이다 (2332.677084ms)
✔ 신뢰 프록시 설정: IPv4 매핑 IPv6와 같은 IPv4는 한 칸이다 (2324.673583ms)
✔ 신뢰 프록시 설정값이 잘못되면 앱을 시작하지 않는다 (64.003458ms)
✔ 운영 정책 그대로(N=30): 여러 주소의 실패가 링크 전체로 30회 쌓이면 새 unlock을 15분 막고, 중간 성공은 누적을 지우지 않으며, 받아 둔 grant로는 계속 열람한다 (6652.183917ms)
✔ [N=20] 여러 주소에서 차례로 N번 틀리면 링크가 차단되고, 새 주소의 맞는 비밀번호도 429다. 받아 둔 grant와 다른 링크는 영향이 없다 (5042.811084ms)
✔ [N=20] 서로 다른 주소에서 동시에 몰아 보내도, 모두 틀리면 차단 전 검사는 정확히 N번이다 (2879.737209ms)
✔ [N=30] 여러 주소에서 차례로 N번 틀리면 링크가 차단되고, 새 주소의 맞는 비밀번호도 429다. 받아 둔 grant와 다른 링크는 영향이 없다 (6733.990583ms)
✔ [N=30] 서로 다른 주소에서 동시에 몰아 보내도, 모두 틀리면 차단 전 검사는 정확히 N번이다 (4163.891041ms)
✔ [N=50] 여러 주소에서 차례로 N번 틀리면 링크가 차단되고, 새 주소의 맞는 비밀번호도 429다. 받아 둔 grant와 다른 링크는 영향이 없다 (10514.973ms)
✔ [N=50] 서로 다른 주소에서 동시에 몰아 보내도, 모두 틀리면 차단 전 검사는 정확히 N번이다 (6526.847792ms)
✔ 동시 검사 상한: 한 링크에 서로 다른 주소 6곳이 동시에 보내면 3개만 검사하고 3개는 실패로 세지 않고 1초로 거절한다 (3787.167917ms)
✔ 해시 차례를 기다리는 동안 링크가 중단·만료되면 해시를 계산하지 않고 404이며, 실패로 세지 않는다 (458.298334ms)
✔ 해시 차례를 기다리는 동안 차단되면 맞는 비밀번호도 해시 없이 429이고 grant를 주지 않는다 (240.336958ms)
✔ 같은 링크·주소의 요청 빈도 상한(#219)을 넘으면 맞는 비밀번호도 해시 없이 429이고, 다른 주소·다른 링크는 따로 세며 창이 지나면 다시 받는다 (1538.325041ms)
✔ 주소 차단과 링크 차단이 겹치면 Retry-After는 늦게 끝나는 쪽이다 (3958.481333ms)
✔ 비밀번호 검사 중 예외가 나도 실패로 세지 않고 해시·예약 자리를 모두 돌려준다 (221.892041ms)
✔ 전체 자원 포화는 링크 구분 없이 걸려 다른 링크의 unlock도 1초로 거절하고, 풀리면 다시 받는다 (792.592125ms)
✔ HTTP 요청을 해시 차례 대기 중에 취소하면, 서버는 차례가 왔을 때 그대로 검사·기록하고 자리를 돌려준다 (606.159625ms)
✔ HTTP 요청을 해시 실행 중에 취소해도 해시가 끝나기 전에는 실행 자리를 돌려주지 않고, 새 요청이 와도 실제 동시 해시는 2개를 넘지 않는다 (1114.525584ms)
✔ 맞는 비밀번호는 200 {grant}, 틀린 비밀번호는 401 LINK_PASSWORD_INVALID이며 회원 JWT 없이 처리한다 (990.607833ms)
✔ 없는·형식이 틀린·중단·만료 링크는 비밀번호와 무관하게 같은 404이고 details가 없다 (454.460959ms)
✔ 비밀번호 없는 링크의 unlock은 400 INVALID_REQUEST, 본문 형식 오류는 400 VALIDATION_FAILED다 (250.017083ms)
✔ unlock은 발급 길이 기준(8~64자, #223)을 적용하지 않고 저장된 검증값과 비교한다 (1349.234125ms)
✔ 10번 틀리면 맞는 비밀번호도 429 LINK_UNLOCK_LIMITED이고, Retry-After는 올림한 남은 초이며 차단 중 요청으로 늘어나지 않는다 (3675.446875ms)
✔ 같은 링크·접속지의 동시 요청은 하나씩 검사하고, 실행 중 포함 3개를 넘는 요청은 검사 없이 429(Retry-After 1)다 (784.719ms)
✔ 이미 차단된 링크·접속지는 대기열이 가득 차 있어도 실제 남은 초로 429다(Retry-After 1로 덮어쓰지 않음) (223.608791ms)
✔ 동시 요청을 몰아 보내도 비밀번호 검사는 한도(10번)를 넘지 않는다 (2079.402ms)
✔ 비밀번호를 검사하는 사이 차단이 걸리면(방어적 재확인), 늦게 성공한 요청도 429이며 grant를 주지 않고 차단을 지우지 않는다 (229.737084ms)
✔ 수신 조회 판정: 비밀번호 링크는 이 링크의 grant가 있어야 하고, grant로 중단·만료를 우회하지 못한다 (816.418792ms)
✔ 로그에 비밀번호·grant·링크 토큰을 남기지 않는다 (585.996208ms)
✔ E 자체 #103 succeeded-one-candidate: 등록 저장 대역과 E 완료를 함께 커밋·재반영 (137.306083ms)
✔ E 자체 #103 empty: 등록 저장 대역과 E 완료를 함께 커밋·재반영 (33.508959ms)
✔ E 자체 #103 partial-failed: 등록 저장 대역과 E 완료를 함께 커밋·재반영 (36.227208ms)
✔ E 자체 #103 failed: 등록 저장 대역과 E 완료를 함께 커밋·재반영 (30.288666ms)
✔ 같은 결과 동시 E 반영은 하나의 저장 묶음으로 수렴 (50.505583ms)
✔ 열람 미준비 등록은 보존하지만 결과 진입 ID를 반환하지 않으며 재반영도 동일 (32.077791ms)
✔ 결과 진입 전부 미준비: 준비된 ID만 중복 제거하고 전체 등록·재반영 ID를 보존 (31.547833ms)
✔ 결과 진입 준비·미준비 혼합: 준비된 ID만 중복 제거하고 전체 등록·재반영 ID를 보존 (33.414709ms)
✔ 결과 진입 모두 준비: 준비된 ID만 중복 제거하고 전체 등록·재반영 ID를 보존 (37.722ms)
✔ 등록 저장 중 실패는 대역·E 완료 전체 롤백, 수신 보존 후 별도 실패 기록 (59.499667ms)
✔ 최종 커밋의 지연 FK 실패도 성공을 반환하지 않음 (45.547416ms)
✔ E 완료 상태 저장 실패도 등록 대역 전체 롤백 (36.757542ms)
✔ 반환된 후보 누락·중복·저장값 불일치는 일부 저장을 완료로 만들지 않음 (107.127666ms)
✔ 호출부의 명시적 등록 오류 분류와 미분류 내부 예외를 구분·원문 비노출 (51.902084ms)
✔ 수신 지문·동의 범위·현재 시도 불일치는 등록 함수를 호출하거나 기존 상태를 바꾸지 않음 (29.121375ms)
✔ 실패 기록 자체 실패도 원래 오류와 함께 전달·수신 보존 (30.66625ms)
✔ 뒤늦은 실패는 다른 실행의 성공을 덮어쓰지 않음 (45.503833ms)
✔ 뒤늦은 실패는 다른 현재 시도를 덮어쓰지 않음 (35.2335ms)
✔ E 수신 제약·물리 매핑 및 실제 기반→E 적용·역순 되돌리기 (236.610875ms)
✔ 마이그레이션의 share_link가 DB 물리 규약·ERD 제약과 회원·멱등 기록 외래 키를 가진다 (54.779875ms)
✔ 회원 행이 없는 소유자로는 발급하지 않는다(회원 외래 키) (19.203792ms)
✔ 멱등 기록은 있는 링크와 그 소유자만 가리킬 수 있다 (17.761667ms)
✔ 공개 Catch 없이도 발급되고, 만료는 발급 시각부터 정확히 720시간 뒤다 (205.632167ms)
✔ 유효 링크와 같은 제목은 LINK_TITLE_CONFLICT이며 새 행을 만들지 않는다 (16.062542ms)
✔ 유효 링크가 5개면 LINK_LIMIT_REACHED (31.19975ms)
✔ 제목 중복과 한도 초과가 겹치면 제목 중복을 먼저 돌려준다(#23 9/28 결정) (29.541625ms)
✔ 중단한 링크는 제목 비교와 개수에서 빠진다 (29.353083ms)
✔ 만료한 링크는 제목 비교와 개수에서 빠지고, 만료 시각과 같은 순간은 만료로 본다 (40.122458ms)
✔ 제목 유일·한도는 회원별이다 (29.7875ms)
✔ 같은 회원이 서로 다른 제목으로 동시에 10번 발급해도 5개만 만들어진다 (34.637208ms)
✔ 같은 회원이 같은 제목으로 동시에 8번 발급해도 1개만 만들어진다 (23.189416ms)
✔ 같은 회원의 발급은 앞 트랜잭션이 끝날 때까지 기다리고, 다른 회원은 기다리지 않는다 (352.410708ms)
✔ 잠금을 기다리는 사이 만료된 링크는 잠금을 얻은 시각 기준으로 빠진다 (392.361334ms)
✔ 호출하는 쪽 트랜잭션이 실패하면 발급한 링크도 함께 롤백된다 (36.993583ms)
✔ 트랜잭션 밖이나 READ COMMITTED가 아닌 격리 수준에서는 발급하지 않는다 (25.806458ms)
✔ 검증을 거치지 않은 명령은 저장하지 않는다 (36.108042ms)
✔ DB 제약이 만료 계산과 중단 시각의 어긋남을 막는다 (31.3195ms)
✔ 신규 발급은 201과 계약의 ShareLink 모양으로 응답하고, 원문 비밀번호를 저장·응답하지 않는다 (404.727458ms)
✔ 대표·공개 Catch 없이 비밀번호 없는 링크도 발급한다 (34.36625ms)
✔ 같은 키·정규화한 같은 본문의 재요청은 새 링크 없이 같은 링크를 200으로 돌려준다 (597.014958ms)
✔ 같은 키에 다른 본문(비밀번호만·제목·비밀번호 유무)이면 409 IDEMPOTENCY_CONFLICT이고 링크를 만들지 않는다 (831.968625ms)
✔ 다른 키로 같은 제목을 보내면 LINK_TITLE_CONFLICT이며 멱등 기록도 남기지 않는다 (48.773917ms)
✔ 유효 링크 5개면 LINK_LIMIT_REACHED, 중단한 링크의 제목은 다시 쓸 수 있다 (71.861458ms)
✔ 중단된 링크를 같은 키로 다시 요청하면 200과 현재 상태(STOPPED)를 돌려준다 (31.064375ms)
✔ 같은 키의 동시 요청 5건은 링크 1개로 수렴한다(201 한 번, 나머지 200) (43.512167ms)
✔ 다른 키의 동시 발급 7건은 5개까지만 성공한다 (60.19425ms)
✔ 멱등 키·제목·한도는 회원별이다 (53.7375ms)
✔ 인증·멱등 키·입력 오류는 링크를 만들지 않는다 (102.837375ms)
✔ 제목 50자와 비밀번호 8자·64자 경계는 발급되고, 저장된 제목 길이는 DB char_length와 같다 (632.003125ms)
✔ #221 이전 짧은 비밀번호 요청 재전송은 400이며 기존 링크·멱등 기록과 unlock은 유지된다 (779.865625ms)
✔ #221 이전 긴 제목 요청 재전송은 400이며 기존 링크·멱등 기록과 unlock은 유지된다 (798.73ms)
✔ #221 이전 긴 비밀번호 요청 재전송은 400이며 기존 링크·멱등 기록과 unlock은 유지된다 (791.129458ms)
✔ 로그에 비밀번호 원문과 링크 토큰을 남기지 않는다 (604.108ms)
✔ 회원 UUID가 아니거나 회원 행이 없는 토큰은 401 AUTH_INVALID이며 링크·기록을 만들지 않는다 (16.414417ms)
✔ 같은 키 재요청에서 기록과 링크가 어긋나면 409가 아니라 500이다 (405.327667ms)
✔ 같은 회원의 발급 요청이 1분에 10번을 넘으면 해시 전에 429 RATE_LIMITED와 Retry-After로 거부하고 아무것도 저장하지 않는다(#219) (2295.745542ms)
✔ 입력 오류(400)도 발급 빈도로 센다: 같은 회원이 잘못된 본문을 10번 보낸 뒤에는 맞는 요청도 해시 전에 429다(#219) (35.762875ms)
✔ 링크가 없으면 정상 빈 목록(200, items [], nextCursor null)이다 (171.816125ms)
✔ 본인 링크만 발행 시각 최신순으로 돌려주고, 항목은 계약의 ShareLink 모양이다 (70.642208ms)
✔ 목록 상태는 응답 시각·중단 시각으로 구한다(ACTIVE·STOPPED·EXPIRED) (74.726875ms)
✔ limit·cursor로 나눠 읽으면 빠짐·중복 없이 끝나고, 같은 발행 시각은 linkId 역순이다 (127.671291ms)
✔ 목록 쿼리 오류는 400 VALIDATION_FAILED이며 입력값을 담지 않는다 (68.501917ms)
✔ 유효 링크를 중단하면 200·STOPPED이고, 반복 중단은 처음 stoppedAt을 유지하며 자원을 만들지 않는다 (59.1805ms)
✔ 만료 링크를 중단하면 중단 처리 없이 200·EXPIRED이고, 중단한 링크는 만료 시각이 지나도 STOPPED다 (55.165584ms)
✔ 타인 링크·없는 링크·UUID가 아닌 ID는 같은 404 RESOURCE_UNAVAILABLE이고 아무것도 바꾸지 않는다 (44.984709ms)
✔ 중단 요청에 본문이나 쿼리가 붙으면 400이고 링크를 바꾸지 않는다 (44.234375ms)
✔ 같은 링크의 동시 중단 5건은 모두 200이고 stoppedAt이 하나로 같다 (54.167708ms)
✔ 인증이 없거나 회원 UUID가 아니거나 회원 행이 없는 토큰은 목록·중단 모두 401이다 (20.910833ms)
✔ 목록 조회 중 DB 오류는 빈 목록이 아니라 500으로 전달된다 (42.599458ms)
✔ npm test는 _test로 끝나는 테스트 DB로만 테스트를 실행한다 (28.135917ms)
✔ 이름이 _test로 끝나지 않는 DB는 초기화·접속을 거부한다 (0.43225ms)
✔ 실행기는 TEST_DB_NAME이 _test로 끝나지 않으면 마이그레이션·테스트 전에 멈춘다 (38.703792ms)
✔ 초기화는 마이그레이션 기록을 남기고 나머지 테이블 자료를 지운다 (20.06675ms)
✔ timestamptz 시각은 저장·조회 뒤 같은 시각이다(Node 시간대 Asia/Seoul) (65.160708ms)
✔ 넘겨받은 EntityManager로 저장하면 한 트랜잭션으로 함께 커밋된다 (60.131041ms)
✔ 넘겨받은 쪽 저장이 실패하면 호출한 쪽 저장까지 함께 롤백된다 (18.759625ms)
✔ 규약 위반 예: 트랜잭션 안에서 전역 DataSource로 저장한 행은 롤백되지 않는다 (19.203333ms)
✔ ApiError는 기본 구분 6가지 상태와 code로 응답한다 (143.1705ms)
✔ 명세가 문구를 정한 코드는 명세 문구로 응답한다 (24.27925ms)
✔ details는 명세의 두 키만 담고 나머지는 버린다 (26.878708ms)
✔ 예상 밖 예외는 500 일반 안내만 응답하고 원인은 서버 로그에만 남긴다 (19.832541ms)
✔ 업무 거부(ApiError 4xx)는 서버 오류 로그를 남기지 않는다 (16.804541ms)
✔ 요청 본문 오류와 없는 경로는 9/28 결정의 형식으로 응답한다 (27.30475ms)
✔ 코드 없는 HttpException은 9/28 결정대로 상태를 보존하고 일반 코드로 응답한다 (19.554666ms)
✔ 인증 Guard(#87)의 토큰 없음·잘못된 토큰은 공통 필터에서 다른 AUTH 코드로 응답한다 (21.477459ms)
✔ 개발 로그인 거부(403)도 같은 형식과 no-store로 응답한다 (16.0365ms)
✔ 기능 경로는 /v1 아래에서 응답하고 /health는 접두사 없이 응답한다 (19.080834ms)
✔ 성공 응답에도 Cache-Control: no-store가 붙는다 (18.505958ms)
✔ /v1 밖의 없는 경로와 본문 오류도 HTML이 아닌 같은 형식으로 응답한다 (18.051084ms)
✔ ApiError 5xx도 메시지 대신 코드 위치를 기록하며 URL의 토큰을 남기지 않는다 (23.707875ms)
✔ 여러 줄 오류 메시지는 코드 위치처럼 보여도 로그에 남기지 않는다 (13.785208ms)
✔ 스택 생성 뒤 메시지를 줄여도 원문은 남기지 않고 실제 코드 위치만 남긴다 (16.35ms)
✔ 수집 기록이 없거나 스택 접근이 실패하면 코드 위치를 생략하고 응답은 유지한다 (16.828708ms)
✔ 예외 이름은 원문 대신 허용 목록의 고정 분류명으로 기록한다 (17.714458ms)
✔ 실행 중 해시는 maxRunning개를 넘지 않고, 나머지는 차례를 기다린다 (2.34425ms)
✔ 진행 중 요청이 maxRunning + maxWaiting개면 다음 요청은 검사 없이 거절한다 (0.327625ms)
✔ 해시 작업이 예외로 끝나도 차례를 넘겨 다음 작업이 실행된다 (0.175042ms)
✔ 운영 정책: 링크 전체 실패 상한은 30이고, 정책값이 1 이상의 정수가 아니면 만들지 않는다 (0.222417ms)
✔ GET /health는 200과 status만 반환한다 (139.46775ms)
✔ #103 succeeded-one-candidate: 실제 B 저장·E 완료·종결을 함께 커밋하고 재반영 ID 유지 (104.865375ms)
✔ #103 empty: 실제 B 저장·E 완료·종결을 함께 커밋하고 재반영 ID 유지 (40.072625ms)
✔ #103 partial-failed: 실제 B 저장·E 완료·종결을 함께 커밋하고 재반영 ID 유지 (54.05875ms)
✔ #103 failed: 실제 B 저장·E 완료·종결을 함께 커밋하고 재반영 ID 유지 (43.813709ms)
✔ 같은 결과 동시 반영은 한 묶음만 저장하고 같은 catchId로 수렴 (73.67725ms)
✔ 같은 작업 두 후보는 Catch 하나·등록 연결 둘이며 기존 본문과 공개 상태 유지 (57.053666ms)
✔ 중간 근거 저장 실패는 B 전체 롤백·수신 보존 후 별도 APPLY_FAILED, 명시적 재반영으로 복구 (50.716333ms)
✔ 지연 FK 커밋 실패까지 성공을 반환하지 않고 전체 롤백·실패 기록 (54.175041ms)
✔ B 입력 거부·맥락 거부와 DB 실패를 기존 오류 타입으로 구분 (47.27975ms)
✔ 최초 보호 조회 실패만 있는 경우 실제 B 전체 롤백·수신 보존 후 E가 APPLY_FAILED를 기록한다 (40.959125ms)
✔ 일부 후보만 반환하면 전체 완료로 처리하지 않음 (57.340792ms)
✔ 수신 원문 지문·동의 범위 불일치는 기존 기록을 바꾸지 않음 (28.239792ms)
✔ E 완료 저장 실패도 전체 롤백하고 기존 Catch·다른 완료 기록·두 수신 기록을 보존 (80.18275ms)
✔ 알 수 없는 반영 예외는 DB 오류로 단정하지 않고 원래 예외를 보존 (38.109209ms)
✔ E 수신 기록의 시도 유일성·복합 FK·지문 형식·엔티티 매핑을 검증 (116.471167ms)
✔ 실패 기록 자체의 실패는 원래 반영 실패와 함께 전달하며 수신·기존 자료 보존 (64.639458ms)
✔ 늦은 실패 기록 전에 다른 실행이 성공하면 APPLIED·CLOSED를 보존 (43.206875ms)
✔ 늦은 실패 기록은 새 현재 시도로 옮겨간 요청을 덮어쓰지 않음 (39.58325ms)
(node:72719) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
✔ #104→E→B 실제 마이그레이션 적용·역순 되돌리기에서 선행 데이터 보존 (225.657541ms)
✔ grant는 발급한 링크에서만, 만료 전까지만 유효하다 (1.05775ms)
✔ grant 수명은 링크 만료 시각을 넘지 않는다 (0.325625ms)
✔ 고치거나 형식이 틀린 grant는 예외 없이 무효다 (0.168125ms)
✔ 서명 키는 production에서 필수·형식 검사·회원 JWT 키와 분리, 개발·테스트는 없으면 무작위 (0.513166ms)
✔ [N=20] 누적 차단: 집계 기간 안에 N번 틀리면 N번째에 차단하고, 차단 중에는 예약을 받지 않는다 (1.568792ms)
✔ [N=20] 누적 차단: 차단 중 요청·기록은 세지 않아 종료 시각이 그대로이고, 풀리면 처음부터 센다 (0.240042ms)
✔ [N=20] 집계 경계: 정확히 15분 지난 실패는 빠지고, 15분 미만은 남는다 (0.133458ms)
✔ [N=20] 성공은 링크 전체 실패 기록을 지우지 않는다 (0.098125ms)
✔ [N=20] 예약 상한: 실패와 검사 중의 합이 N에 닿으면 검사 없이 1초로 거절하고, 모두 실패하면 차단 전 검사는 정확히 N번이다 (0.210708ms)
✔ [N=30] 누적 차단: 집계 기간 안에 N번 틀리면 N번째에 차단하고, 차단 중에는 예약을 받지 않는다 (0.101959ms)
✔ [N=30] 누적 차단: 차단 중 요청·기록은 세지 않아 종료 시각이 그대로이고, 풀리면 처음부터 센다 (0.564958ms)
✔ [N=30] 집계 경계: 정확히 15분 지난 실패는 빠지고, 15분 미만은 남는다 (0.110458ms)
✔ [N=30] 성공은 링크 전체 실패 기록을 지우지 않는다 (0.097708ms)
✔ [N=30] 예약 상한: 실패와 검사 중의 합이 N에 닿으면 검사 없이 1초로 거절하고, 모두 실패하면 차단 전 검사는 정확히 N번이다 (0.155584ms)
✔ [N=50] 누적 차단: 집계 기간 안에 N번 틀리면 N번째에 차단하고, 차단 중에는 예약을 받지 않는다 (0.118334ms)
✔ [N=50] 누적 차단: 차단 중 요청·기록은 세지 않아 종료 시각이 그대로이고, 풀리면 처음부터 센다 (0.307375ms)
✔ [N=50] 집계 경계: 정확히 15분 지난 실패는 빠지고, 15분 미만은 남는다 (0.140792ms)
✔ [N=50] 성공은 링크 전체 실패 기록을 지우지 않는다 (0.124959ms)
✔ [N=50] 예약 상한: 실패와 검사 중의 합이 N에 닿으면 검사 없이 1초로 거절하고, 모두 실패하면 차단 전 검사는 정확히 N번이다 (0.1525ms)
✔ 동시 검사 상한: 한 링크의 검사 중은 3개까지이고, 넘치면 실패로 세지 않고 1초로 거절한다(N과 별개) (0.137708ms)
✔ 기록 상한: 실패 누적이 남은 링크 기록은 밀어내지 않고, 집계가 끝난 기록만 정리한다 (0.15625ms)
✔ 기록 상한: 남은 기록이 모두 검사 중이면 새 링크는 1초, 차단 중이면 차단 종료까지 거절한다 (0.088417ms)
✔ 예약하지 않은 기록·중복 해제는 무시하고 검사 중 수가 음수가 되지 않는다 (0.051791ms)
✔ 새 검증값은 OWASP 권고 조합 N=2^15·r=8·p=3으로 저장된다(#219) (367.97ms)
✔ 이전 매개변수 N=2^15·r=8·p=1로 저장된 값도 계속 검증된다(#219) (184.137292ms)
✔ 검증값은 원문을 포함하지 않고 형식·매개변수를 기록한다 (180.699958ms)
✔ 같은 비밀번호도 매번 다른 salt로 다른 검증값이 된다 (547.422375ms)
✔ 맞는 비밀번호만 통과하고 공백·대소문자·유니코드 조합을 바꾸지 않는다 (1319.798917ms)
✔ 빈 비밀번호나 문자열이 아닌 값은 해시하지 않는다 (0.472791ms)
✔ 깨진 검증값은 false로 숨기지 않고 형식 오류로 알린다 (185.00125ms)
✔ 형식 오류 메시지에 원문이나 저장값을 넣지 않는다 (0.19ms)
✔ 토큰은 43자 base64url이고 매번 다르다 (3.892709ms)
✔ 토큰 형식이 아닌 값은 거부한다 (0.092958ms)
✔ 수신자 URL은 web 기준 주소 뒤에 /s/<token>을 붙인다 (0.244042ms)
✔ 잘못된 기준 주소와 토큰은 URL을 만들지 않는다 (0.289792ms)
✔ 오류 메시지에 토큰이나 기준 주소를 넣지 않는다 (0.092167ms)
✔ 표시 이름만 trim하고 내부 공백·대소문자·유니코드 조합과 선택 입력은 보존 (1.030209ms)
✔ 빈 이름·공백 이름은 거부하지만 선택 문자열 빈 값·빈 배열은 허용 (0.407125ms)
✔ displayName의 NUL은 위치와 관계없이 거부하고 원본을 변경하지 않는다 (0.240834ms)
✔ introduction의 NUL은 위치와 관계없이 거부하고 원본을 변경하지 않는다 (0.147708ms)
✔ desiredRole의 NUL은 위치와 관계없이 거부하고 원본을 변경하지 않는다 (0.127041ms)
✔ skills의 NUL은 위치와 관계없이 거부하고 원본을 변경하지 않는다 (0.148292ms)
✔ displayName의 고립 상위·하위 서로게이트와 잘못된 조합을 보정 없이 거부 (0.557ms)
✔ introduction의 고립 상위·하위 서로게이트와 잘못된 조합을 보정 없이 거부 (0.401792ms)
✔ desiredRole의 고립 상위·하위 서로게이트와 잘못된 조합을 보정 없이 거부 (0.428791ms)
✔ skills의 고립 상위·하위 서로게이트와 잘못된 조합을 보정 없이 거부 (0.529292ms)
✔ 한글·이모지·서로게이트 쌍 경계·대체 문자 자체는 변환 없이 허용 (0.073709ms)
✔ NUL 이외의 제어문자를 금지하지 않고 한글·이모지와 내부 공백을 보존 (0.066959ms)
✔ displayName 코드 포인트 50 경계는 보존하고 51은 거부 (0.078459ms)
✔ introduction 코드 포인트 200 경계는 보존하고 201은 거부 (0.054209ms)
✔ desiredRole 코드 포인트 100 경계는 보존하고 101은 거부 (0.05275ms)
✔ 기술 목록 20개·각 50자 경계와 초과를 구분하고 입력을 자르지 않는다 (0.144958ms)
✔ 결합 글자와 이모지도 코드 포인트 단위로 계산한다 (0.061375ms)
✔ 필수 필드 누락·null·잘못된 타입·기술 원소 타입을 거부 (0.212417ms)
✔ 추가 필드와 변환 시 누락되는 특수 키도 거부하고 입력 이름·값을 반사하지 않는다 (0.215292ms)
✔ 페이지 규격: 기본 20·경계 1/100, 잘못된 limit과 추가 필드 거부 (51.455417ms)
✔ 페이지는 안정된 저장소 ID 순서로 끝까지 이동하고 마지막·빈 목록의 cursor는 null (10.403292ms)
✔ 다른 회원·목록 판본·허용 범위 변경 및 변조·미지원 커서 거부 (8.920625ms)
✔ 응답 필드는 다섯 개뿐이며 불완전·중복 공급 자료는 빈 성공 대신 예외 (8.561833ms)
✔ 실제 개발 로그인·DB 연결 공급자와 #103 표본의 저장소·범위가 일치한다 (141.543792ms)
✔ 실제 인증 Guard: 토큰 없음·변조·잘못된 헤더·기존 문자열 회원 식별을 거부 (62.089792ms)
✔ 실제 DB 연결 DISCONNECTED: 다른 회원의 연결을 쓰거나 빈 성공으로 바꾸지 않는다 (47.851458ms)
✔ 실제 DB 연결 REAUTH_REQUIRED: 다른 회원의 연결을 쓰거나 빈 성공으로 바꾸지 않는다 (49.542667ms)
✔ 실제 DB 연결 missing: 다른 회원의 연결을 쓰거나 빈 성공으로 바꾸지 않는다 (43.564458ms)
✔ API 쿼리는 회원 ID·알 수 없는 필드·중복 limit/cursor·페이지 경계 위반을 거부 (50.007667ms)
✔ 다중 저장소·정상 빈 목록·HTTP 페이지 경계는 공급 함수 대역으로 구분해 검사 (41.46375ms)
✔ 커서가 있어도 매번 현재 연결을 확인하며 재인증 필요 상태는 결과를 반환하지 않는다 (34.905542ms)
✔ 실제 DB 조회 실패는 500이며 입력·SQL·자격정보·토큰을 응답·로그에 노출하지 않는다 (39.723208ms)
✔ 다른 회원의 합성 연결 참조를 본인 행에 넣어도 조회 실패로 거부한다 (47.213708ms)
✔ 기존 #104 개발 대역 제한 유지: {} (23.826667ms)
✔ 기존 #104 개발 대역 제한 유지: {"NODE_ENV":"production"} (25.4575ms)
✔ unlock은 회원 토큰 없이 인증 Guard를 통과한다 (0.45525ms)
✔ 같은 컨트롤러에 추가될 미지정 메서드는 회원 인증 예외를 상속하지 않는다 (0.495292ms)
✔ 창 안에서 상한까지 받고, 넘으면 가장 오래된 요청이 창을 벗어날 때까지 남은 초(올림)로 거부한다 (0.837791ms)
✔ 거부한 요청은 세지 않아 계속 보내도 다시 받는 시각이 늦어지지 않는다 (0.589375ms)
✔ 키마다 따로 센다 (0.072458ms)
✔ 기록 상한: 창이 지난 키부터 지우고, 그래도 차면 가장 오래 쓰지 않은 키를 밀어내며 새 요청은 거절하지 않는다 (0.109625ms)
✔ 상한 값이 1 이상의 정수가 아니면 만들지 않는다 (0.246833ms)
✔ 운영 정책: 회원 발급은 1분 10회, 같은 링크·주소의 비밀번호 확인은 1분 20회다 (0.119333ms)
✔ 빌드 main: env 파일의 인증 설정으로 기동·발급·종료 (488.128ms)
✔ 개발 소스 main: env 파일의 인증 설정으로 기동·발급·종료 (2430.167959ms)
✔ main: 터미널 production 설정이 env 파일보다 우선하여 개발 로그인을 거부한다 (429.095625ms)
✔ main: 서명 키 누락이면 기동하지 않고 실패 종료한다 (357.222416ms)
✔ main: 서명 키 공란이면 기동하지 않고 실패 종료한다 (350.02175ms)
✔ main: 수명 누락이면 기동하지 않고 실패 종료한다 (351.124042ms)
✔ main: 잘못된 수명이면 기동하지 않고 실패 종료한다 (428.477208ms)
✔ main: DB 비밀번호 누락이면 기동하지 않고 실패 종료한다 (353.38975ms)
✔ main: 바인딩 주소 형식 오류이면 기동하지 않고 실패 종료한다 (284.575792ms)
✔ main: production에서 공유 URL 주소가 http이면 기동하지 않고 실패 종료한다 (353.347208ms)
✔ main: NODE_ENV 미지정에 공유 URL 주소 없음이면 기동하지 않고 실패 종료한다 (354.283833ms)
✔ main: 앱 생성 뒤 production에서 CORS 허용 출처가 http이면 DB 연결을 닫고 바로 실패 종료한다 (391.89875ms)
✔ main: 앱 생성 뒤 포트가 이미 사용 중이면 DB 연결을 닫고 바로 실패 종료한다 (402.2135ms)
✔ main: DB에 접속할 수 없으면 기동하지 않고 DB 안내와 함께 실패 종료한다 (1377.612ms)
✔ main: BIND_HOST 미설정이면 127.0.0.1에서만 응답한다 (480.328917ms)
✔ main: BIND_HOST=::1이면 ::1에서만 응답한다 (425.900209ms)
✔ 필드 순서와 제목 앞뒤 공백은 같은 지문이 된다 (0.80175ms)
✔ 제목 안쪽 내용·대소문자·유니코드 조합이 다르면 다른 지문이 된다 (0.193375ms)
✔ 비밀번호 원문은 지문에 들어가지 않고 설정 여부만 반영된다 (0.121542ms)
✔ 검증을 거치지 않은 값은 지문을 만들지 않는다 (0.219625ms)
✔ 같은 키 재요청: 같은 제목·같은 비밀번호만 같은 요청으로 본다 (548.671042ms)
✔ 같은 키 재요청: 비밀번호 없는 링크 (0.179333ms)
✔ 기록과 링크의 비밀번호 설정 여부가 어긋나면 409가 아닌 서버 오류로 올린다 (178.694542ms)
✔ trim 결과가 빈 제목과 문자열이 아닌 제목을 거부한다 (0.577041ms)
✔ 제목 앞뒤 공백만 정규화하고 원본 객체를 변경하지 않는다 (0.364625ms)
✔ 객체가 아닌 요청을 거부한다 (0.073708ms)
✔ 클라이언트 소유자·만료시각과 알 수 없는 필드를 거부한다 (0.445375ms)
✔ 비밀번호 생략은 허용하지만 null·빈 문자열·다른 타입은 거부한다 (0.079666ms)
✔ 비밀번호는 trim하거나 대소문자를 바꾸지 않는다 (0.072667ms)
✔ 제목은 trim 뒤 50자까지 받고 51자부터 maxLength로 거부한다 (0.122833ms)
✔ 비밀번호는 입력 그대로 8~64자만 받고 7자는 minLength, 65자는 maxLength로 거부한다 (0.111459ms)
✔ 글자 수는 UTF-16 길이가 아니라 유니코드 코드 포인트로 센다 (0.121208ms)
✔ 제목·비밀번호 길이 위반은 함께 알리고 입력값을 담지 않는다 (0.120292ms)
✔ 오류 결과에 원문 비밀번호나 임의 필드 이름을 반사하지 않는다 (0.070291ms)
✔ 제목 정규화 결과는 요청 키 순서·제목 앞뒤 공백과 무관하다 (0.053166ms)
✔ 월말·윤년·서머타임 경계에서도 정확히 30일 후 만료한다 (0.902125ms)
✔ 잘못된 시각이나 Date 범위를 넘는 만료시각을 거부한다 (0.231125ms)
✔ 중단되지 않고 만료 전이면 ACTIVE, 만료 시각부터는 EXPIRED (0.445667ms)
✔ 중단이 만료보다 우선하며, 중단한 링크는 만료 시각이 지나도 STOPPED다 (0.08525ms)
✔ 잘못된 시각은 판정하지 않는다 (0.252333ms)
✔ 공유 URL 주소가 없으면 development·test만 web 개발 서버 주소를 쓰고 그 밖은 기동 실패다 (1.094542ms)
✔ production 등 development·test가 아니면 http 공유 URL 주소는 값을 드러내지 않고 기동을 멈춘다 (0.44775ms)
✔ 형식이 틀린 공유 URL 주소는 값을 드러내지 않고 기동을 멈춘다 (0.156792ms)
✔ 입력 오류의 reason은 공통 ValidationPipe처럼 규칙 이름이다 (0.186292ms)
✔ Node 기본 formatter의 .stack 문자열은 설치 전후가 같다 (0.737ms)
✔ 기존 formatter의 반환값을 보존하고, 여러 번 설치해도 한 번만 감싼다 (0.245834ms)
✔ 기존 formatter가 없으면 설치하지 않고 위치를 생략한다 (0.091333ms)
✔ 스택 생성 뒤 메시지를 줄여도 메시지와 무관한 실제 위치만 남는다 (0.590416ms)
✔ 스택을 먼저 덮어쓰거나 스택 접근이 실패하면 문자열 파싱 없이 위치를 생략한다 (0.135791ms)
✔ 함수 이름은 기록하지 않고, 동적 코드·앱 밖 파일은 자리표시자로 남긴다 (0.763125ms)
✔ 신뢰 프록시: 없거나 비어 있으면 아무 프록시도 신뢰하지 않는다 (0.674ms)
✔ 신뢰 프록시: 쉼표로 구분한 IPv4·IPv6 주소와 CIDR을 받는다 (3.733958ms)
✔ 신뢰 프록시: 이름·홉 수·불리언·전체 대역·잘못된 CIDR은 기동을 멈추고 값을 오류에 넣지 않는다 (0.373ms)
✔ 15분 안에 10번 틀리면 그때부터 15분 차단하고, 남은 초는 올림한다 (0.885708ms)
✔ 차단 중 요청·실패는 세지 않아 차단 종료 시각이 처음 그대로다 (0.772417ms)
✔ 15분 창 밖의 실패는 세지 않고, 성공하면 실패 기록을 지운다 (0.146209ms)
✔ 차단 중 성공 기록은 차단을 지우지 않는다 (0.074666ms)
✔ 링크·접속지 키마다 따로 센다 (0.096541ms)
✔ 기록 상한이 차면 만료된 기록 → 가장 오래 쓰지 않은 기록 순으로 밀어내고, 차단·검사 중 기록은 남긴다 (0.13725ms)
✔ 기록 상한이 차고 모두 차단·검사 중이면 새 키만 검사 없이 거절하고, 남은 초는 검사 중 자리가 있으면 1초다 (0.141ms)
✔ 같은 키의 작업은 하나씩 실행되고, 실행 중 포함 3개가 걸려 있으면 4번째부터 기다리지 않고 거절한다 (84.484333ms)
✔ 올바른 DTO는 통과하고 DTO 인스턴스로 변환된다 (133.94775ms)
✔ 검증 실패는 400 VALIDATION_FAILED와 필드·규칙 이름만 담는다 (26.1415ms)
✔ 필수 필드 누락도 VALIDATION_FAILED다 (24.337041ms)
✔ 선언되지 않은 필드는 거부한다(명세: 알 수 없는 필드 거부) (17.471709ms)
✔ 합성 세트는 #103 본문의 사례 9가지를 담는다 (0.899125ms)
✔ 사례 succeeded-one-candidate 메시지 1은 worker와 같은 판정을 낸다 (47.774541ms)
✔ 사례 empty 메시지 1은 worker와 같은 판정을 낸다 (0.385333ms)
✔ 사례 partial-failed 메시지 1은 worker와 같은 판정을 낸다 (1.563125ms)
✔ 사례 failed 메시지 1은 worker와 같은 판정을 낸다 (0.146833ms)
✔ 사례 unidentifiable 메시지 1은 worker와 같은 판정을 낸다 (1.07675ms)
✔ 사례 redelivery 메시지 1은 worker와 같은 판정을 낸다 (0.145542ms)
✔ 사례 redelivery 메시지 2은 worker와 같은 판정을 낸다 (0.137416ms)
✔ 사례 same-id-different-content 메시지 1은 worker와 같은 판정을 낸다 (0.141666ms)
✔ 사례 same-id-different-content 메시지 2은 worker와 같은 판정을 낸다 (0.454959ms)
✔ 사례 two-candidates-same-work 메시지 1은 worker와 같은 판정을 낸다 (0.169666ms)
✔ 사례 progress-events 메시지 1은 worker와 같은 판정을 낸다 (0.363458ms)
✔ 사례 progress-events 메시지 2은 worker와 같은 판정을 낸다 (0.157167ms)
✔ 음성 대조 missing-title는 worker와 같은 이유로 거부된다 (0.276458ms)
✔ 음성 대조 invalid-date-time는 worker와 같은 이유로 거부된다 (0.116083ms)
✔ 음성 대조 date-time-space-separator는 worker와 같은 이유로 거부된다 (0.107959ms)
✔ 음성 대조 invalid-uri는 worker와 같은 이유로 거부된다 (0.1145ms)
✔ 음성 대조 empty-evidence는 worker와 같은 이유로 거부된다 (0.111208ms)
✔ 음성 대조 empty-result-id는 worker와 같은 이유로 거부된다 (0.127667ms)
✔ 음성 대조 non-string-request-id는 worker와 같은 이유로 거부된다 (0.103417ms)
✔ 식별자는 비어 있지 않은 문자열일 때만 읽힌다 (0.04775ms)
✔ 채울 값이 없는 자리표시자는 오류로 막는다 (0.21125ms)
ℹ tests 574
ℹ suites 2
ℹ pass 574
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 133285.878375
````

### 추가 실행 원문 — db-retry-cleanup

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
docker rm -f 510cec58f036d3cce09521a13c311188a95eec3aae9b143ae0e0d0cb03d60ac4
```

exit_code: 0

````text
510cec58f036d3cce09521a13c311188a95eec3aae9b143ae0e0d0cb03d60ac4
````

### 추가 실행 원문 — db-retry-after

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

exit_code: 0

````json
{
  "output": "109bb77df581\tcatchu-db-test-219\tExited (255) 35 minutes ago\t127.0.0.1:5449->5432/tcp\n17a6f6c9a973\tcatchu-db-test-86\tExited (255) 8 days ago\t127.0.0.1:5433->5432/tcp\nf67f1e2f1f34\tcatchu-db-86\tExited (255) 8 days ago\t127.0.0.1:5432->5432/tcp\n4507c4f2892e\tedro-web-frontend-1\tExited (0) 4 months ago\t\n2fe64f443b88\tedro-web-backend-1\tExited (0) 4 months ago\t\n9090794feff7\tedro-web-celery-1\tExited (0) 4 months ago\t\naef5a3b0e765\tedro-web-nginx-1\tExited (0) 4 months ago\t\n141195f31883\tedro-web-redis-1\tExited (0) 4 months ago\t\n3091e433de10\tedro-web-db-1\tExited (0) 4 months ago\t\nd8084a52f12e\tbuildx_buildkit_mybuilder0\tUp 35 minutes\t\n"
}
````

### 추가 실행 원문 — post-db-preservation

작업 위치: `/Users/ljm/Desktop/github/CatchU`

```text
python3 /private/tmp/catchu-title-1009/final-preservation.py
```

exit_code: 0

````text
{
  "head": "e3058d0dd8f97be51a5496da95b105e17ab541bb",
  "merge_base": "3b025df9ba5c2d5285a4cacd28382e7a3fd45a28",
  "branch": "docs/catch-title-contract-1009",
  "tracked_count": 1077,
  "protected_count": 243,
  "december_count": 36,
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml"
  ],
  "unexpected_tracked_changes": [],
  "protected_changed": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_protected_changes": [],
  "status": [
    {
      "status": " M",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/catch-title-contract-codex.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/github-issues-crosscheck-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-117-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-118-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-118-plan.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-217-claude.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/issue-217-plan.md"
    },
    {
      "status": "??",
      "path": ".local-handoffs/parallel-work-status.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-06.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-07.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-08.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-09-verification.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-09-verification.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/single-2026-10-09-verification.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-questions.md"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-tools.json"
    },
    {
      "status": "??",
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-09-verification.md"
    }
  ],
  "unexpected_status": [],
  "target_diff_paths": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml"
  ],
  "audit": {
    "bytes": 179235,
    "head_bytes": 143643,
    "start_bytes": 156038,
    "preexisting_uncommitted_bytes": 12395,
    "backup_tail_bytes": 11847,
    "session_start_bytes": 548,
    "current_added_since_start_bytes": 23197,
    "head_prefix_preserved": true,
    "start_prefix_preserved": true,
    "backup_tail_preserved": true,
    "current_event_counts": {
      "ARTIFACT_CREATED": 5,
      "ARTIFACT_UPDATED": 8,
      "DECISION_RECORDED": 4,
      "HUMAN_TURN": 8,
      "SUMMARY_CONFIRMATION_RECORDED": 4,
      "SESSION_COMPACTED": 2,
      "ERROR_LOGGED": 1,
      "STAGE_STARTED": 3,
      "CHANGE_ACCEPTED": 9,
      "REVIEW_REQUESTED": 3,
      "REVIEW_COMPLETED": 3,
      "STAGE_COMPLETED": 3,
      "SESSION_ENDED": 1,
      "SESSION_STARTED": 1,
      "SESSION_RESUMED": 1
    }
  },
  "tail_metadata": {
    "bytes": 11847,
    "sha256": "4cf9ce04f9685951baf654d825d4f0ca04ec7ba2dec4aa7ae7b70d8d27d208af",
    "event_counts": {
      "SESSION_ENDED": 16,
      "SESSION_RESUMED": 4,
      "HUMAN_TURN": 34,
      "SESSION_STARTED": 12,
      "SESSION_COMPACTED": 5
    },
    "session_ids": [
      "01a0d704-2d63-7582-9733-eecabb1c8a5a",
      "01a111bd-83b6-7260-be9a-07d1ad89ebd1",
      "01a11335-60f7-7331-8a3a-6294e0fe2e5d",
      "01a113a3-e947-7983-92eb-1cd742416d02",
      "01a113b3-20dd-7fc3-b7d3-a183ae8ef7e8",
      "01a113d3-026a-7f32-a774-93f2d9dfb35f",
      "01a11538-063b-79b0-94e4-f2f6eef8488a",
      "01a11588-2312-7003-8d39-e6bbf8c7cd75",
      "01a118cc-302c-7d32-aabc-acdb7ae13345",
      "01a11928-4da9-7b73-a314-5a625b8244ad",
      "01a1192a-0880-7e43-9d7d-0968badc5fd5",
      "01a1192f-579e-7331-b38b-dea6c114bf20",
      "01a11a54-de06-7b50-8c29-9fd0dfa0e85f"
    ],
    "first_timestamp": "2026-10-06T10:07:28Z",
    "last_timestamp": "2026-10-08T07:18:10Z",
    "unexpected_event_types": []
  },
  "worker_spec_line40_byte_unchanged": true,
  "state_unchanged": true,
  "passed": true
}
````

### 기록 형식 확인

스테이징 뒤 공백 검사에서 Docker 목록의 빈 마지막 열에 있던 탭 6개가 trailing whitespace로 표시됐다. 원문을 삭제하거나 바꾸지 않고 위 db-retry-after 출력을 JSON 문자열로 인코딩해 보존했다. API 테스트 실패가 아닌 기록 표기 문제이며 다른 파일·엔진 상태·질문 파일은 수정하지 않았다.
