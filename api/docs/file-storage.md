# 파일 저장 FileStorage — 12월 intent U2·U8

회원 파일(PDF 자료·발행본 PDF 사본)을 저장하는 공용 인터페이스와 두 구현(`src/file-storage/`)이다. 로컬 드라이버(`local-file-storage.ts`)는 U2가, S3 드라이버(`s3-file-storage.ts`)는 U8이 더했다. U2 탈퇴 2단계(회원 파일 삭제)·U4 발행·U8 PDF 자료가 쓴다.

기준 문서: [계약 C-05](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U2 업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR6, [U2 보안 설계 「설정 검사 시점」](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/nfr-design/security-design.md)(BR6.1의 "없을 때" 부분을 바꾼 기준), [U8 업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/functional-design/rules.md) BR7.3(S3 드라이버 동작 대응표), [U8 기술 선택](../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-requirements/tech-stack-decisions.md) 「파일 저장(api)」.

## 설정

세 값 `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`·`FILE_STORAGE_S3_BUCKET`을 읽는다. 혼합 설정 거부: 세 값이 모두 비면 없음, 드라이버마다 자기 값만 받고 다른 드라이버의 값이 함께 있으면 기동 실패(`local`+버킷, `s3`+뿌리), 드라이버 없이 뿌리·버킷만 있어도 기동 실패, 버킷 이름은 S3 모양 검사.

| 경우 | 동작 |
|---|---|
| 셋 다 없음 | api는 기동한다. 모든 호출이 `StorageUnavailable`(`NOT_CONFIGURED`)이다. 탈퇴는 2단계에서 500 `WITHDRAWAL_FAILED` |
| 셋 다 빈 문자열 | 없음과 같다(10월 GitHub 설정과 같은 규칙) |
| 드라이버가 없는데 뿌리나 버킷만 있음 | 기동 실패 |
| 드라이버가 `local`·`s3`가 아님(대문자 포함) | 기동 실패 |
| `local` + 뿌리 없음 / `local` + 버킷이 함께 있음 | 기동 실패 |
| `local` + 뿌리가 상대 경로이거나 없는 폴더(파일 포함) | 기동 실패 |
| `local` + 이미 있는 폴더의 절대 경로 | 로컬 드라이버. 심볼릭 링크를 푼 실제 경로를 뿌리로 쓴다 |
| `s3` + 버킷 없음 / `s3` + 뿌리가 함께 있음 | 기동 실패 |
| `s3` + 버킷 이름이 S3 모양(3~63자, 소문자·숫자·`.`·`-`, 영숫자로 시작·끝)이 아님 | 기동 실패 |
| `s3` + 모양이 맞는 버킷 이름 | S3 드라이버. 버킷이 실제로 있는지·권한이 있는지는 첫 호출 때 드러난다(`StorageUnavailable`) |

- 오류 문구에는 설정 이름만 있고 경로·버킷 값은 없다.
- `dev-ci`는 고치지 않았다(팀장 공용 기반 작업). 시험은 시험 안에서 임시 폴더·시험용 버킷 이름을 넣는다. 환경변수 예시 파일(`api/.env.example`)에는 세 설정 이름과 S3 지역 `AWS_REGION`이 값 없이 있다(U8 Step 11).
- **개발 서버에는 U2 코드를 올리기 전에 로컬 드라이버의 두 값을 넣는다**([통합 확인 표](../../docs/CatchU_통합확인.md) 「탈퇴 뒤 차단」의 선행 조건). 넣지 않으면 api는 뜨지만 탈퇴가 2단계에서 실패한다.
- 로컬 드라이버는 api 한 대(개발 서버 EC2) 기준이다. 여러 api가 뜨는 EKS에서는 `s3` 드라이버를 쓴다(NFR4.10·NFR4.11). 버킷·역할은 #389(팀장 공용 인프라)가 준비한다.

## 쓰는 법

```typescript
import { Inject } from '@nestjs/common';
import { FILE_STORAGE, type FileStorage, materialKey } from '../file-storage/file-storage';
// 모듈 imports에 FileStorageModule을 넣는다.
constructor(@Inject(FILE_STORAGE) private readonly files: FileStorage) {}
await this.files.put(materialKey(memberId, pdfMaterialId), body, 'application/pdf');
```

| 메서드 | 없는 대상 | 그 밖의 실패 |
|---|---|---|
| `put(key, body, contentType)` | — | `StorageUnavailable`(`IO_FAILED`). 로컬은 같은 폴더의 임시 이름(`.tmp-<uuid>`)에 끝까지 쓴 뒤 이름을 바꾸며, 중간 실패면 임시 파일을 지운다(BR6.4) |
| `get(key)` | `FileNotFound` | `StorageUnavailable` |
| `copy(from, to)` | `FileNotFound` | `StorageUnavailable`(로컬 쓰기는 put과 같은 방식) |
| `delete(key)` | 성공 | `StorageUnavailable` |
| `deletePrefix(prefix)` | 성공 | `StorageUnavailable` |

키는 계약의 도우미로만 만든다: `memberPrefix(memberId)`, `materialKey(memberId, pdfMaterialId)`, `publicationPrefix(memberId, publicationId)`, `publishedPdfKey(memberId, publicationId, publishedItemId)`(모든 ID는 UUID).

## 키 검사 (BR6.2, NFR1.3)

두 드라이버 모두 모든 메서드의 첫 단계에서 검사하고, 어기면 파일·S3를 건드리지 않고 `InvalidStorageKey`(호출자 버그)를 던진다.

- `members/<UUID>/`로 시작해야 한다. 키는 끝이 `/`가 아니고, 접두어는 끝이 `/`다.
- `..`·`.`·빈 마디·역슬래시·절대 경로·영문·숫자·`. _ -` 밖의 글자는 거부한다.
- 로컬 드라이버: 뿌리와 합친 경로가 뿌리 밖이거나, 이미 있는 중간 경로가 심볼릭 링크면 따라가지 않고 `StorageUnavailable`(`OUTSIDE_ROOT`)이다.

## S3 드라이버 (U8 BR7.3, NFR1.7·NFR4.8·NFR4.11·NFR4.15)

`S3FileStorage(bucket, client?)`는 `@aws-sdk/client-s3`를 쓴다. 검사를 통과한 키 마디를 `/`로 이은 값이 그대로 S3 Key다(접두어는 끝 `/` 포함). presigned URL은 만들지 않는다.

| 메서드 | S3 호출 | 없는 대상 |
|---|---|---|
| `put` | `PutObject`(Body=받은 Buffer, ContentType) | — |
| `get` | `GetObject`, 응답 `Body`(Readable)를 그대로 돌려준다 | `NoSuchKey` → `FileNotFound`. `Body`가 없으면 `IO_FAILED` |
| `copy` | `CopyObject`(`CopySource` = `<bucket>/<fromKey>`) | 원본 `NoSuchKey` → `FileNotFound` |
| `delete` | `DeleteObject` | 성공(S3는 없는 키에 오류를 내지 않으며, `NoSuchKey`를 내더라도 성공으로 본다) |
| `deletePrefix` | `ListObjectsV2`를 `IsTruncated`가 거짓일 때까지 `ContinuationToken`으로 반복하고, 키를 1,000개 단위로 `DeleteObjects`(`Quiet`) | 목록이 비면 삭제 호출 없이 성공 |

- 없는 대상 판정은 `NoSuchKey`만이다: get·copy의 `NoSuchKey` → `FileNotFound`, delete의 `NoSuchKey` → 성공이고, `NoSuchBucket`을 포함한 그 밖의 404·오류(네트워크·권한·`DeleteObjects` 응답의 `Errors`)는 모두 `StorageUnavailable`(`IO_FAILED`) 한 번이며 원인은 `cause`에 둔다(저장소 오류를 성공·없음으로 보지 않음).
- deletePrefix 방어 3건: 요청 접두어 밖 키가 목록에 오면 삭제 없이 `IO_FAILED`(다른 회원 파일 보호), `DeleteObjects` 응답 `Errors`는 `IO_FAILED`, `IsTruncated`인데 다음 토큰이 없으면 `IO_FAILED`(조용한 부분 성공 없음).
- 재시도는 SDK 기본 재시도 모드(한 호출 안 최대 3회)에 맡기고 드라이버는 더하지 않는다. 최종 실패는 호출자가 실패로 처리한다(작업 단위 재시도는 사람이 한다).
- 자격·지역은 AWS SDK 기본 체인(api 역할·환경)에서 온다. 코드에 자격·지역·버킷 이름 상수가 없고, 오류 메시지·예외에 버킷·키 값을 넣지 않으며 드라이버가 직접 로그를 남기지 않는다.
- 실제 버킷 확인(복사·삭제)은 버킷·역할(#389) 준비 뒤 1회 수동으로 하고 통합 확인 표에 적는다(OQ-U8-2). 그 전까지는 가짜 클라이언트 시험만 있다.

## 시험

- `test/u2/file-storage.test.cjs`(8개): 로컬 드라이버 put·get·copy, 없는 키, 없는 접두어 삭제(S23), `..` 키·심볼릭 링크 거부(S22), 설정 없음·빈 문자열·한쪽만·상대 경로·없는 폴더·모르는 드라이버(`local`·`s3` 밖의 값).
- `test/file-storage/s3-file-storage.test.cjs`(9개 + 계약 12개): 요청을 기록하는 가짜 S3 클라이언트로 다섯 메서드의 명령·키(S-1), `NoSuchKey` → `FileNotFound`·delete 성공(S-2), 회귀 `NoSuchBucket`·이름 없는 404 → `IO_FAILED`(delete 성공 아님, get·copy `FileNotFound` 아님), 네트워크 오류 → `IO_FAILED` 한 번(S-3), 1,001개 접두어 삭제의 2회 `DeleteObjects`·빈 접두어(S-4), deletePrefix 방어 3건, 키 모양 거부·S3 미호출(S-5), 설정·혼합 설정 거부·모듈 조립 거부(S-6), 드라이버 선택. 실제 AWS에 접속하지 않는다.
- `test/file-storage/storage-contract.cjs`: 로컬·S3 드라이버가 함께 통과해야 하는 계약 시험 6개(`registerStorageContractTests(name, makeStorage)`). S3 쪽은 메모리 맵으로 객체를 흉내 내는 가짜 클라이언트로 돈다(S-7).
