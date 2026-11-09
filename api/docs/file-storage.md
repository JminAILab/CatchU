# 파일 저장 FileStorage — 12월 intent U2

회원 파일(PDF 자료·발행본 PDF 사본)을 저장하는 공용 인터페이스와 로컬 구현(`src/file-storage/`)이다. S3 구현은 U8이 더한다. U2에서는 탈퇴 2단계(회원 파일 삭제)가 쓴다.

기준 문서: [계약 C-05](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U2 업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR6, [U2 보안 설계 「설정 검사 시점」](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/nfr-design/security-design.md)(BR6.1의 "없을 때" 부분을 바꾼 기준).

## 설정

| 경우 | 동작 |
|---|---|
| `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT` 둘 다 없음 | api는 기동한다. 모든 호출이 `StorageUnavailable`(`NOT_CONFIGURED`)이다. 탈퇴는 2단계에서 500 `WITHDRAWAL_FAILED` |
| 둘 다 빈 문자열 | 없음과 같다(10월 GitHub 설정과 같은 규칙) |
| 한쪽만 있음 | 기동 실패 |
| 드라이버가 `local`이 아님(`s3`·대문자 포함) | 기동 실패. `s3`는 U8이 더한다 |
| 뿌리가 상대 경로이거나 없는 폴더(파일 포함) | 기동 실패 |
| `local` + 이미 있는 폴더의 절대 경로 | 로컬 드라이버. 심볼릭 링크를 푼 실제 경로를 뿌리로 쓴다 |

- 오류 문구에는 설정 이름만 있고 경로 값은 없다.
- `dev-ci`와 환경변수 예시 파일은 고치지 않았다(팀장 공용 기반 작업). 시험은 시험 안에서 임시 폴더를 만들어 두 값을 넣는다.
- **개발 서버에는 U2 코드를 올리기 전에 두 값을 넣는다**([통합 확인 표](../../docs/CatchU_통합확인.md) 「탈퇴 뒤 차단」의 선행 조건). 넣지 않으면 api는 뜨지만 탈퇴가 2단계에서 실패한다.
- 로컬 드라이버는 api 한 대(개발 서버 EC2) 기준이다. 여러 api가 뜨는 EKS에서 파일이 필요해지면(U8) S3로 바꾼다(NFR4.10).

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
| `put(key, body, contentType)` | — | `StorageUnavailable`(`IO_FAILED`). 같은 폴더의 임시 이름(`.tmp-<uuid>`)에 끝까지 쓴 뒤 이름을 바꾸며, 중간 실패면 임시 파일을 지운다(BR6.4) |
| `get(key)` | `FileNotFound` | `StorageUnavailable` |
| `copy(from, to)` | `FileNotFound` | `StorageUnavailable`(쓰기는 put과 같은 방식) |
| `delete(key)` | 성공 | `StorageUnavailable` |
| `deletePrefix(prefix)` | 성공 | `StorageUnavailable` |

키는 계약의 도우미로만 만든다: `memberPrefix(memberId)`, `materialKey(memberId, pdfMaterialId)`, `publicationPrefix(memberId, publicationId)`, `publishedPdfKey(memberId, publicationId, publishedItemId)`(모든 ID는 UUID).

## 키 검사 (BR6.2, NFR1.3)

모든 메서드의 첫 단계에서 검사하고, 어기면 파일을 건드리지 않고 `InvalidStorageKey`(호출자 버그)를 던진다.

- `members/<UUID>/`로 시작해야 한다. 키는 끝이 `/`가 아니고, 접두어는 끝이 `/`다.
- `..`·`.`·빈 마디·역슬래시·절대 경로·영문·숫자·`. _ -` 밖의 글자는 거부한다.
- 뿌리와 합친 경로가 뿌리 밖이거나, 이미 있는 중간 경로가 심볼릭 링크면 따라가지 않고 `StorageUnavailable`(`OUTSIDE_ROOT`)이다.

## 시험

`test/u2/file-storage.test.cjs`(8개): put·get·copy, 없는 키, 없는 접두어 삭제(S23), `..` 키·심볼릭 링크 거부(S22), 설정 없음·빈 문자열·한쪽만·상대 경로·없는 폴더·모르는 드라이버.
