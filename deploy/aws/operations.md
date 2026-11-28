# EKS 운영 확인(#277)

12월 공개판의 최종 환경인 EKS(https://catchu.dev)에서, 재배포 뒤에도 자료·로그인·비밀값이 유지되고 운영 보안 설정이 동작하는지 확인한 결과다([#277](https://github.com/JminAILab/CatchU/issues/277)). 분석·발행·열람 같은 제품 흐름은 [통합 확인](../../docs/CatchU_통합확인.md)에서 본다.

확인한 날의 상세 기록은 이슈 댓글에 있다. 여기에는 판본·설정·검사 조건과 기대·실제 결과만 모은다. 시각은 한국 시각이다.

## 확인한 판본

| 날짜 | main 판본 | 환경 | 본 것 | 기록 |
|---|---|---|---|---|
| 10-16 | `108bb462` | 개발 서버 | 초기 배포 범위와 초기 기능 | [초기 배포 확인](https://github.com/JminAILab/CatchU/issues/277#issuecomment-6212565740). main 검사 기준은 [PR #318](https://github.com/JminAILab/CatchU/pull/318) |
| 11-18 | `5beb8593` | EKS | HTTPS 진입, WAF 빈도 제한, 신뢰 프록시 대역, 경보 | [2단계](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6970235553)·[3단계 전환](https://github.com/JminAILab/CatchU/issues/276#issuecomment-6971519828) |
| 11-19 | `007c06fa` | EKS | 로그에 비밀값·토큰이 남지 않음 | [수집 통제 실제 검증](https://github.com/JminAILab/CatchU/issues/37#issuecomment-7000321920) |
| 11-23 | `5f400769` | EKS | 보안 머리글, 개발 로그인 금지, 한 출처·CORS·CSRF·쿠키, Google 로그인 유지 | [운영 보안 설정](https://github.com/JminAILab/CatchU/issues/277#issuecomment-7098841835) |
| 11-25 | `4e0d6b76` | EKS | 12월 판본 배포, 재배포 뒤 로그인·Catch 숨김 유지 | [배포 기록](https://github.com/JminAILab/CatchU/issues/277#issuecomment-7161347544)·[재배포 확인](https://github.com/JminAILab/CatchU/issues/277#issuecomment-7160488339) |

11-25에 배포한 판본은 아래와 같다. [PR #651](https://github.com/JminAILab/CatchU/pull/651)로 dev를 main에 반영했고, 자동 배포가 19:59:07에 교체를 마쳤다.

| 항목 | 값 |
|---|---|
| main 커밋 | [`4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61`](https://github.com/JminAILab/CatchU/commit/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61) |
| 이미지 태그 | `main-4e0d6b761a6b` |
| web | `sha256:226e1aa7a7b37c5774c81906d1c8713e6c5626ab56ddf1d6ac38af96f0e527ad` |
| api | `sha256:da4acbc971f107e2037a906ef5da5b622d0849ffe9e7653c915d30a9b4a2e3f2` |
| migration | `sha256:616279d6d1aabe2b2f2866e9c58c0a6e62d0870ac8d8e100f058935cef2756cb` |
| worker | `sha256:4d7b4f70d99f1b1deb8672b6f40df56b5935b3bda68fe11f953b0100b67ed89f` |
| URL | https://catchu.dev |

## 설정

11-25 판본(`4e0d6b76`)의 실행 파일 기준이다.

| 설정 | 값 | 파일 |
|---|---|---|
| 진입 | ALB에서 HTTPS를 끝낸다(CloudFront 없음). http는 https로 옮긴다 | [`ingress.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/ingress.yaml#L17) |
| HSTS | `max-age=300` | [`ingress.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/ingress.yaml#L22) |
| 실행 수·교체 방식 | api 1·worker 3은 옛 실행을 내린 뒤 새로 띄운다(`Recreate`). web 1은 겹쳐 바꾼다 | [`api.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/api.yaml#L20-L25)·[`worker.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/worker.yaml#L18-L23)·[`web.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/web.yaml#L14-L19). 실행 수는 배포 스크립트가 넣는다 |
| 운영 모드 | `NODE_ENV=production`. 개발 로그인을 켜는 값은 없다 | [`api.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/api.yaml#L50) |
| 로그인 수명 | Access 15분(900초). 세션은 최대 7일, 마지막 갱신 뒤 24시간 | [`api.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/api.yaml#L63)·[`session.config.ts`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/api/src/auth/session.config.ts#L5-L7) |
| 신뢰 프록시 | api가 믿는 프록시 대역은 ALB가 놓인 퍼블릭 서브넷 두 대역 | [`api.yaml`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/k8s/api.yaml#L70) |
| Google 로그인 시작 빈도 | 한 주소에서 5분에 20번을 넘으면 429 | [`create-waf.sh`](https://github.com/JminAILab/CatchU/blob/4e0d6b761a6b9c8343d7bc9eb9b75139b2a3cd61/deploy/aws/scripts/create-waf.sh#L6) |
| 서명 키 | `AUTH_JWT_SECRET`·`LINK_GRANT_SECRET`은 `make-secrets.sh`로 손으로 만든 Secret `catchu-api`에서 받는다. 자동 배포는 Secret을 만들거나 바꾸지 않는다 | [k8s/README.md 「Secret과 ConfigMap」](k8s/README.md#secret과-configmap), [cd/README.md 「권한」](cd/README.md#권한)(자동 배포에 주지 않는 것), [11-24 팀장 결정](https://github.com/JminAILab/CatchU/issues/277#issuecomment-7118489624) |

## 완료 기준별 결과

| #277 완료 기준 | 검사 조건 | 기대 | 실제 | 판본 |
|---|---|---|---|---|
| 1 초기 범위와 main 검사 기준 | 2026-10-16 팀장 결정을 PR로 반영 | PR·승인·merge commit으로 반영 | 초기 범위는 [PR #320](https://github.com/JminAILab/CatchU/pull/320), main 검사 기준은 [PR #318](https://github.com/JminAILab/CatchU/pull/318)로 [레포 컨벤션 「main의 검증」](../../docs/CatchU_레포_컨벤션.md#2-브랜치)에 merge commit으로 반영했다. 두 PR 모두 승인 없이 팀장이 우회 병합했다. main 대상 PR은 운영 이미지 검사(`images`)와 자동 배포 스크립트 회귀 시험(`cd-scripts`)이 필수다 | `5b638e28`·`108bb462` |
| 2 초기 기능 확인 | 고정 main 판본, 실제 HTTPS 주소 | 미제공·미검증·health 결과를 나눠 기록 | 나눠 기록했다. 개발 서버에서 본 것이다 | `108bb462` |
| 3 12월 판본 배포 | dev→main PR, 자동 배포 | main 커밋·digest·URL 기록 | 위 「확인한 판본」 절의 두 번째 표. 배포 뒤 바깥 응답: 첫 화면 200, `/v1/me` 401, `/privacy` 200, http는 301로 https | `4e0d6b76` |
| 4 HTTPS와 http 이동 | 바깥에서 `curl` | 첫 화면 200, 로그인 없는 api 401, http는 https로 | 기대와 같다. 11-18 전환 때 보고, 11-25 배포 뒤에도 첫 화면·api·http 이동은 같았다. 체크는 https 이동·TLS를 ALB 설정이 정한다는 이유로 11-18 판본 증거를 받아들였다(11-19 팀장 판단) | `5beb8593`·`4e0d6b76` |
| 5 한 출처·Google 로그인·CORS·쿠키·CSRF | `curl`과 실제 Google 로그인 | 화면의 api 요청은 같은 출처 `/v1`. 다른 출처는 허용 머리글 없음. 갱신·로그아웃은 Origin이 다르면 403. 쿠키는 `HttpOnly`·`Secure`·`SameSite=Strict`·`Path=/v1/auth`. 새로고침해도 로그인 유지 | 기대와 같다 | `5f400769` |
| 6 Google 로그인 시작 빈도 제한 | 한 주소에서 1초 간격으로 60번 | 20번을 넘으면 429, 다른 경로는 그대로 | 31번째(43초)부터 429, 다른 경로는 그대로. WAF는 요청 수를 근삿값으로 세고 늦게 감지해 정확히 21번째에 막지 않는다 | `5beb8593` |
| 7 개발 로그인 금지 | `POST /v1/auth/dev-login` | 403 | 403 | `5f400769` |
| 8 재배포 뒤 DB 자료와 지금 권한 | 배포 전에 Catch 하나를 숨기고 재배포 | 배포 뒤에도 숨김이고, 공개 Catch 목록(새 프리셋 화면)에서 빠짐 | 기대와 같다 | `5f400769`→`4e0d6b76` |
| 9 서명 키 유지 | 배포 전에 받은 Access로 새 api 호출, 배포 뒤 새로고침 | 옛 api가 서명한 Access를 새 api가 받음, 새로고침에 로그인 유지 | 기대와 같다(상세 조회 200, 갱신 요청 없음. 새로고침에 갱신 200 → `/v1/me` 200) | `5f400769`→`4e0d6b76` |
| 10 보안 머리글 | 첫 화면 `/`와 `/v1/me`의 응답 머리글 | CSP·`nosniff`·Referrer-Policy가 붙고 HSTS는 한 줄 | 기대와 같다. `server`·`x-powered-by`는 없다 | `5f400769` |
| 11 프록시 대역·로그·경보 | 설정 대조, 로그 검색, 경보 울리기 | 신뢰 대역이 ALB 퍼블릭 서브넷과 같음, 로그에 비밀값·토큰 0줄, 경보 메일 수신 | 기대와 같다 | `5beb8593`·`007c06fa` |

## 확인하지 않은 것

- 링크 중단·만료 상태와 비밀번호 링크 증표(grant)가 재배포 뒤 이어지는지는 재배포로 보지 않았다. 11-25 배포가 변경 전 발행본을 모두 지우는 판본이라 볼 수 없었고, 링크 상태는 Pod 밖 RDS에, 서명 키는 손으로 만든 Secret에 있다는 것을 증거로 받아들였다([11-24 팀장 결정](https://github.com/JminAILab/CatchU/issues/277#issuecomment-7118489624)).
- 로그인 응답의 `Set-Cookie`는 값이 함께 찍혀 직접 읽지 않았다. 쿠키를 지우는 응답의 속성과, 쿠키를 설정할 때 같은 속성 줄을 쓰는 코드로 갈음했다.
- 로그인 수명의 끝(24시간·7일)에 실제로 만료되는지는 보지 않았다.
- Catch 숨김은 본인 화면과 프리셋 고르기 목록에서만 봤다. 받은 사람 화면은 볼 발행본이 없었다.
- 신뢰 프록시 대역은 설정을 대조했고, 요청마다 주소를 어떻게 판정하는지는 보지 않았다.
- 로그의 비밀값 0줄은 걸러지기 전 원본 로그로 셌다. 다만 11-18 분석 건의 api 원본 로그는 Pod가 바뀌어 남지 않아, 그 몫은 걸러진 기록만 봤다.
- 여러 탭·응답 유실·로그아웃 경쟁 같은 로그인 유지의 세부 사례(#250)는 이 확인의 범위 밖이다.

## 손으로 하는 운영

| 할 일 | 안내 |
|---|---|
| 자동 배포 켜기·멈추기. 12/9 00:00 동결부터는 멈춘다 | [cd/README.md 「켜기와 멈추기」](cd/README.md#켜기와-멈추기) |
| 이전 판본으로 되돌리기 | [cd/README.md 「되돌리기」](cd/README.md#되돌리기) |
| 자원 삭제 | [README.md 「삭제 순서」](README.md#삭제-순서) |

비밀값은 누출됐을 때만 바꾼다. 서명 키를 바꾸면 로그인과 열람 증표가 모두 무효가 된다. 바꾸는 순서와 바뀐 값으로 api·worker를 다시 띄우는 절차는 아직 없고, 그 전에는 `make-secrets.sh`를 값만 바꾸는 데 쓰지 않는다([k8s/README.md 「Secret과 ConfigMap」](k8s/README.md#secret과-configmap) 「값을 바꿀 때」).

**main 배포 뒤 확인.** 위 확인에서 쓴 방법 가운데 다음 배포 뒤에 다시 볼 것을 모았다. 각 줄 끝에 그 확인을 마지막으로 한 날과 판본을 적었다. [cutover.md 「셸 준비」](cutover.md#셸-준비)에서 첫 줄(`setopt`), `a()`·`k()`, `edge_check()` 정의만 붙여 넣고 쓴다. 나머지 줄은 전환 때 개발 서버를 찾던 것이라 붙이지 않는다.

1. 세 서비스가 배포한 커밋으로 돌고 있는지. 11-25 `4e0d6b76`에서 봤다.
   ```bash
   k get deploy -o json | jq -r '.items[] | "\(.metadata.name) \(.spec.template.metadata.annotations["catchu.io/source-revision"])"'
   ```
2. 바깥 응답: 첫 화면 200, http 이동 301, 로그인 없는 api 401, 내부 경로 404, HSTS 한 줄. 다섯 가지 모두는 11-18 `5beb8593`에서 봤고, 11-25 `4e0d6b76`에서는 첫 화면·http 이동·api만 봤다.
   ```bash
   edge_check
   ```
3. 개발 로그인이 막혀 있는지: 403. 11-23 `5f400769`에서 봤다.
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: https://catchu.dev' -H 'Content-Type: application/json' -d '{"memberId":"check"}' https://catchu.dev/v1/auth/dev-login
   ```
4. 배포 전에 로그인해 둔 브라우저에서 새로고침해 로그인이 이어지는지. 11-25 `4e0d6b76`에서 봤다.
