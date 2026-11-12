# 개발 서버 자동 배포

`main`에 반영된 판본을 GitHub Actions가 개발 서버([README](../README.md))에 자동으로 배포한다([#313](https://github.com/JminAILab/CatchU/issues/313)). 하는 일은 개발 서버 수동 절차 「순서」의 1~3·5단계와 같다. 앞단 Caddy도 매번 새 파일로 다시 띄운다. 환경 폴더(`/opt/catchu/env`)는 만들지 않고, 이미 있는 것을 그대로 쓴다.

## 흐름

워크플로는 [`.github/workflows/deploy-dev-server.yml`](../../../.github/workflows/deploy-dev-server.yml)이고 job 셋으로 돈다.

| job | 하는 일 | AWS 권한 |
|---|---|---|
| `plan` | 배포할 커밋 확인, 이미 올린 판본인지 조회 | 있음(environment `dev-server`) |
| `check` | 배포할 커밋의 이미지 검사. 이미 올린 판본이면 건너뜀 | 없음. OIDC 토큰도 요청할 수 없는 별도 러너 |
| `deploy` | 빌드·ECR 올리기, 서버 교체, 바깥 확인 | 있음(environment `dev-server`) |

이미지 검사는 배포할 커밋의 스크립트를 러너에서 그대로 실행한다. 그래서 AWS 권한을 받는 job과 러너를 나눴다. 권한이 있는 job은 배포할 커밋의 코드를 러너에서 실행하지 않는다. 이미지 빌드는 Docker 안에서만 돌아 러너의 권한에 닿지 않는다.

**판본은 둘로 나뉜다.** 배포 도구(이 폴더 `cd/`)는 언제나 그 실행의 `main` 판본을 쓴다. 이미지·compose·교체 스크립트·Caddy 설정은 배포할 커밋에서 가져온다. 그래서 지난 커밋으로 되돌릴 때도 도구는 지금 판본으로 돈다.

1. **시작:** `main`에 push될 때(dev→main PR 병합)와, `main`에서 수동 실행할 때. 수동 실행에 커밋을 넣으면 그 `main` 커밋을 배포한다(되돌리기). 다른 브랜치에서는 돌지 않는다. 배포할 커밋과 도구 커밋은 모두 `main`의 first-parent 커밋, 곧 `main`에 반영된 판본이어야 한다([`ci-source.sh`](ci-source.sh)).
2. **판본 확인:** 앱 이미지 네 개의 태그는 `main-<배포할 커밋 12자>`, 배포 파일 묶음의 태그는 `main-<배포할 커밋 12자>-tools-<도구 커밋 12자>`다. 앱 이미지가 모두 있으면 이미지 검사·빌드를 건너뛴다. 묶음만 없으면 묶음만 새로 만든다. 되돌리기는 보통 여기서 바로 교체로 간다.
3. **검사·빌드·올리기(arm64 러너):** `check` job에서 [이미지 검사](../../README.md#검사)를 통과한 뒤, `deploy` job에서 네 이미지를 만든다. web은 `https://<도메인>`으로 만든다. 배포할 커밋의 배포 파일(compose 두 개·`local-db/`·`replace-single.sh`·`dev-server/`)에서 `cd/`만 지금 판본으로 덮어 묶음 이미지 `catchu-deploy-files`로 만들어 함께 올린다. 이미지 검사는 배포할 커밋의 검사 스크립트로 그 커밋의 소스를 본다. 출처 증명은 붙이지 않고, 올린 태그가 실행 이미지인지 확인한다([`ci-images.sh`](ci-images.sh)).
4. **서버 교체:** SSM 문서 `catchu-dev-deploy`([`ssm-document.yaml`](ssm-document.yaml))에 커밋과 digest 다섯 개만 넘긴다([`ci-deploy.sh`](ci-deploy.sh)). 문서는 서버에서 잠금을 잡고 묶음을 꺼낸 뒤, 묶음 안의 [`server-deploy.sh`](server-deploy.sh)를 실행한다. 이 스크립트는 다음 순서로 일한다.
   - 이미지를 digest로 받아 arm64인지, web 공개 주소가 서버 도메인인지 확인한다. 여기서 멈추면 실행 중 판본은 바뀌지 않는다.
   - 배포 파일 폴더와 `compose.env`를 바꾼다. 이전 폴더는 `deploy-src.prev-<시각>`에, 이전 파일은 `env-backup/`에 둔다. `compose.env`는 임시 파일에서 먼저 바꿔 네 값이 전달받은 digest와 정확히 같은지 확인한 뒤 한 번에 옮긴다. 쓰기 실패나 같은 이름이 여러 줄인 경우 여기서 멈추며, 이때도 아무것도 바뀌지 않는다.
   - `replace-single.sh --local-db --migrate`로 교체하고 Caddy를 다시 띄운다. Caddy 명령이 실패하거나, 이번 배포 중에 새로 만들어진 Caddy가 돌고 있지 않으면 실패(4)로 끝낸다. 옛 Caddy가 남아 돌면 바깥 확인은 통과할 수 있어서다.
   - 서버 안에서 확인한다: 실행 이미지(전달받은 digest와 대조), health, 앞단 첫 화면, `TRUST_PROXY_CIDRS`, 앱 계정 잠금 대기 상한.
   - 모두 통과했으면 서버의 catchu 이미지(앱 네 개와 배포 파일 묶음) 가운데 지금 판본과 직전 판본만 남기고 지운다. 직전 판본은 교체 전 `compose.env`의 앱 이미지와, 배포 기록의 마지막 성공 줄의 묶음이다. DB·큐·Caddy 이미지는 건드리지 않는다. 지우지 못한 이미지가 있어도 배포 결과는 바뀌지 않고, 다음 배포 때 다시 정리한다.
   - `/opt/catchu/deploy-history.log`에 커밋·digest·결과를 한 줄 남긴다.
5. **바깥 확인:** 첫 화면 200, http→https 308, `/v1/me` 401, `/v1/internal/…` 404, HSTS `max-age=300` 한 줄([`ci-check.sh`](ci-check.sh)).

배포는 한 번에 하나만 돈다(GitHub 동시 실행 막기 + 서버 잠금 `/opt/catchu/deploy.lock`). 진행 중에 `main` push가 여러 번 오면, 기다리는 실행은 가장 나중 것 하나만 남는다. 교체하는 동안 사용자는 약 10초 동안 502를 받는다.

## AWS 권한

- GitHub OIDC로 실행마다 임시 권한을 받는다. 저장소에는 AWS 키를 두지 않는다.
- 역할 `catchu-github-deploy`는 environment `dev-server`에서 돈 실행만 믿는다([`iam-trust.json`](iam-trust.json)). 그 environment의 배포 브랜치는 `main` 하나다.
  - 저장소가 GitHub의 고정 주체 형식을 쓰므로, 믿는 주체는 이름 대신 소유자·저장소 고유 번호가 붙은 `repo:JminAILab@312341191/CatchU@1332558334:environment:dev-server`다. 저장소 이름이 바뀌거나 같은 이름으로 다시 만들어져도 다른 저장소로 넘어가지 않는다. 형식은 `gh api repos/JminAILab/CatchU/actions/oidc/customization/sub`의 `sub_claim_prefix`로 확인한다.
- 권한([`iam-deploy.json`](iam-deploy.json))은 두 가지뿐이다.
  - ECR 다섯 저장소에 올리고 조회하기.
  - 이 서버 한 대에 `catchu-dev-deploy` 문서를 보내고 결과를 읽기.
  - 비밀값 파라미터는 읽지 못한다.
- 이 역할은 이미지를 올리고 그 이미지로 서버를 바꿀 수 있으므로, 사실상 서버를 바꿀 수 있는 권한이다. 그래서 막는 선은 「`main`에서만」과 `main` 반영 PR의 승인 1건이다. SSM 문서를 하나로 정해 둔 것은 보낼 수 있는 입력을 커밋·digest로 좁힐 뿐이다.

## 처음 준비

한 번만 한다. AWS 명령은 `--profile catchu`로 실행한다. 아래 `<계정>`·`<서버>`에는 계정 번호와 서버 인스턴스 ID를 넣는다.

1. ECR 저장소 `catchu-deploy-files`: 다른 네 저장소와 같게 만든다. 태그 덮어쓰기 금지, 올릴 때 검사, AES256, 수명 규칙(태그 없는 것 1일, 최근 10개).
2. OIDC 공급자: `aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com`
3. 역할:
   - `iam-trust.json`의 `ACCOUNT_ID`를 바꿔 `aws iam create-role --role-name catchu-github-deploy --assume-role-policy-document file://…`로 만든다. 역할 설명은 영문만 받는다.
   - `iam-deploy.json`의 `ACCOUNT_ID`·`INSTANCE_ID`를 바꿔 `aws iam put-role-policy --role-name catchu-github-deploy --policy-name catchu-github-deploy --policy-document file://…`로 붙인다.
4. SSM 문서: `aws ssm create-document --name catchu-dev-deploy --document-type Command --document-format YAML --content file://deploy/dev-server/cd/ssm-document.yaml`
5. GitHub environment `dev-server`: 배포 브랜치를 `main`으로 제한하고 값 세 개를 넣는다. 역할 주소와 서버 ID는 키가 아니지만 secrets에 둔다. variables에 두면 계정 번호와 서버 ID가 실행 로그에 그대로 찍히기 때문이다. 도메인은 공개 주소라 variables에 둔다.
   - secrets: `AWS_DEPLOY_ROLE_ARN`, `DEV_SERVER_INSTANCE_ID`
   - variables: `DEV_SERVER_DOMAIN`

`ssm-document.yaml`을 바꾸면 AWS 문서도 갱신한다. `aws ssm update-document --name catchu-dev-deploy --document-version '$LATEST' --document-format YAML --content file://…`로 올린 뒤, `aws ssm update-document-default-version --name catchu-dev-deploy --document-version <새 판>`으로 기본 판을 바꾼다. `server-deploy.sh`·`redact.py`는 묶음에 들어가므로 따로 올리지 않는다.

## 되돌리기

Actions 화면에서 `deploy-dev-server`를 `main`으로 Run workflow하고, 되돌릴 `main` 커밋(40자리)을 넣는다. 배포 기록은 서버의 `deploy-history.log`나 지난 실행의 요약에 있다.

- 넣을 수 있는 커밋은 `main`에 반영된 판본(`git log --first-parent origin/main`에 나오는 커밋)뿐이다. merge commit으로 반영된 PR 안의 중간 커밋은 `main`의 조상이어도 승인된 최종 판본이 아니므로 받지 않는다. 그 안에 뒤 커밋에서 되돌린 코드가 들어 있을 수 있어서다.
- 수동 되돌리기와 같은 조건이 붙는다. **이전 이미지가 지금 DB 스키마와 호환될 때만** 한다. migration은 되돌리지 않으며, `--migrate`를 붙여도 이미 적용된 것은 다시 실행하지 않는다. 호환이 불분명하면 실행하지 않고 담당자 판단을 받는다([배포 안내 「실패 시 정지와 되돌리기」](../../README.md#실패-시-정지와-되돌리기)).
- 서버에는 지금·직전 판본 이미지만 남는다. 그보다 오래된 판본으로 되돌리면 ECR에서 다시 받는다. ECR은 저장소마다 최근 10개만 남긴다. 그보다 오래된 판본은 태그가 지워졌으므로 다시 빌드·검사한다.
- 이미지 검사(`check-images.mjs`)나 교체 스크립트(`replace-single.sh`)가 없는 커밋(#275 이전)은 배포하지 않고 멈춘다.

## 실패했을 때

| 어디서 | 서버 상태 | 다음 행동 |
|---|---|---|
| 판본 확인·검사·빌드·올리기 | 바뀌지 않음 | 실행 기록을 보고 고친 뒤 다시 실행한다 |
| 서버 2(입력·준비) | 바뀌지 않음 | 출력의 「멈춤」 줄을 본다. 다른 배포가 잡은 잠금(10)·묶음 꺼내기 실패(11)도 바뀌지 않은 상태다 |
| 서버 3(교체) | 출력의 `replace-single 종료 코드`에 따름. 대개 앱이 멈춘 상태 | [배포 안내의 종료 코드 표](../../README.md#계획-교체)대로 한다. 같은 커밋으로 다시 실행하거나 이전 커밋으로 되돌린다 |
| 서버 4(교체 뒤 확인) | 새 판본이 떠 있음. Caddy 실패면 옛 Caddy가 돌거나 앞단이 멈춤 | 출력의 「실패」 줄을 본다. 프록시 주소·잠금 대기 상한은 개발 서버 README 「순서」 3단계대로 고친다. Caddy는 설정을 고친 뒤 다시 실행하거나 개발 서버 README 「순서」 4단계로 띄운다 |
| 바깥 확인 | 새 판본이 떠 있음 | 앞단·DNS·인증서를 본다 |
| 기다리는 시간 초과 | 서버에서 계속 돌 수 있음 | 서버의 `deploy-history.log`와 컨테이너 상태를 본 뒤 다시 실행한다 |

## 검사

`ci-images.sh`(이미지 단계)를 바꾸면 회귀 시험을 돌린다.

```bash
bash deploy/dev-server/cd/ci-images.test.sh
```

- aws·docker를 합성 응답으로 바꾸고, 합성 git 저장소에서 plan·push를 실제로 실행한다. 확인하는 것은 판본 조회, 이미 올린 태그 다시 쓰기와 새로 빌드해 올리기, manifest 판정, 묶음의 판본 나누기다.
  - manifest 판정: 실행 이미지는 받고, in-toto 증명 문서·층이 모자란 것·이미지 설정이 아닌 문서는 거부한다. 최소 층 수는 앱 2, 묶음 1이다.
- 실제 ECR·SSM·서버·Docker에는 닿지 않는다. 그래서 OIDC 권한 받기, arm64 빌드, 실제 manifest 응답, 서버 교체는 확인하지 못한다. 이것들은 첫 실제 배포에서 확인한다.
- GitHub Actions `images` 워크플로의 `cd-scripts` job이 같은 명령을 쓴다. `main`으로 가는 배포 PR과 수동 실행에서 돈다. `deploy/`를 바꾼 dev PR은 병합 전에 그 브랜치로 수동 실행한다([배포 안내 「검사」](../../README.md#검사)).
- 셸 정적 검사(`bash -n`·shellcheck)는 셸 안의 Python 코드를 검사하지 못한다. 그래서 이 시험이 판정 코드를 실제로 실행한다.

## 끄는 법과 수동 절차와의 관계

- 끄기: Actions 화면에서 `deploy-dev-server` 워크플로를 Disable한다(`gh workflow disable deploy-dev-server`). 다시 켜면 그다음 `main` push부터 돈다.
- 수동 절차(개발 서버 README 「순서」)는 그대로 쓸 수 있다. 다만 수동 교체는 서버 잠금을 잡지 않으므로, 손으로 교체하는 동안은 워크플로를 꺼 둔다. 손으로 다른 판본을 올렸다면 서버는 `main`과 다른 상태이니, 다음 자동 배포가 그 위를 덮는다.
- 11월 EKS로 옮길 때 배포 대상을 바꾸는 일은 [#276](https://github.com/JminAILab/CatchU/issues/276)에서 한다.
