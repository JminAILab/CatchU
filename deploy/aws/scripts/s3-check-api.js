// EKS api Pod 안에서 회원 파일 버킷 권한을 확인한다(#276 2단계). 쓰는 법과 순서는 deploy/aws/s3.md 「확인(2단계)」.
// api 이미지에 든 AWS SDK와 Pod가 받은 역할을 그대로 쓴다. 접근 키는 넘기지 않는다. 버킷은 Pod의 FILE_STORAGE_S3_BUCKET이다.
//   node - keep         새 UUID의 members/<UUID>/ 아래에서 올리기·읽기·복사·목록·없는 파일 읽기·members/ 밖 올리기 거부·삭제를 보고,
//                       worker 확인에 쓸 파일 하나를 남긴 뒤 그 키를 "남긴 파일: <키>"로 찍는다.
//   node - clean <키>   남긴 파일을 지우고 그 회원 접두어가 비었는지 본다.
// 화면에는 단계 이름과 결과만 찍는다. 하나라도 기대와 다르면 종료 코드 1이다.
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { randomUUID } = require('node:crypto');

const Bucket = process.env.FILE_STORAGE_S3_BUCKET;
// 연결이 막혔을 때 오래 붙들지 않게 시간 제한과 시도 횟수를 줄인다.
const s3 = new S3Client({ maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 } });
let failed = false;

/** 호출 결과를 '허용' 또는 오류 이름으로 바꾼다. 이름이 없는 연결 오류는 코드(ECONNREFUSED 등)를 쓴다. */
async function outcome(command) {
  try {
    return { result: '허용', response: await s3.send(command) };
  } catch (error) {
    return { result: (error.name === 'Error' && error.code) || error.name || 'Error' };
  }
}

function report(step, got, want) {
  const ok = got === want;
  if (!ok) failed = true;
  console.log(`${ok ? '통과' : '실패'}: ${step} — ${got}${ok ? '' : `(기대: ${want})`}`);
}

async function listed(Prefix) {
  const { result, response } = await outcome(new ListObjectsV2Command({ Bucket, Prefix }));
  return result === '허용' ? `허용 ${response.KeyCount ?? 0}개` : result;
}

async function keep() {
  const prefix = `members/${randomUUID()}/`;
  const first = `${prefix}s3-check`;
  const copy = `${prefix}s3-check-copy`;
  const body = `catchu s3 check ${randomUUID()}`;

  const put = await outcome(new PutObjectCommand({ Bucket, Key: first, Body: body, ContentType: 'text/plain' }));
  report('올리기', put.result, '허용');
  const read = await outcome(new GetObjectCommand({ Bucket, Key: first }));
  const same = read.result === '허용' && (await read.response.Body.transformToString()) === body;
  report('읽기(올린 내용과 같음)', read.result === '허용' ? (same ? '허용' : '내용 다름') : read.result, '허용');
  report('복사', (await outcome(new CopyObjectCommand({ Bucket, Key: copy, CopySource: `${Bucket}/${first}` }))).result, '허용');
  report('목록(올린 것과 복사한 것)', await listed(prefix), '허용 2개');
  // 목록 권한이 있어야 S3가 없는 파일에 '거부'가 아니라 '없음'을 돌려준다. api는 이 둘을 가려서 처리한다.
  report('없는 파일 읽기', (await outcome(new GetObjectCommand({ Bucket, Key: `${prefix}s3-check-missing` }))).result, 'NoSuchKey');
  const outside = `s3-check-outside/${randomUUID()}`;
  const escaped = await outcome(new PutObjectCommand({ Bucket, Key: outside, Body: body }));
  report('members/ 밖 올리기', escaped.result, 'AccessDenied');
  if (escaped.result === '허용') console.log(`주의: 버킷에 ${outside} 파일이 남았다. 관리자 권한으로 지운다.`);
  report('복사한 것 삭제', (await outcome(new DeleteObjectCommand({ Bucket, Key: copy }))).result, '허용');
  report('삭제 뒤 목록', await listed(prefix), '허용 1개');
  // 올리지 못했으면 남긴 파일이 없다. 키를 찍지 않아 다음 확인으로 넘어가지 않게 한다.
  if (put.result === '허용') console.log(`남긴 파일: ${first}`);
}

async function clean(key) {
  if (!/^members\/[0-9a-f-]{36}\/s3-check$/.test(key ?? '')) {
    console.log('사용법: node - clean members/<UUID>/s3-check');
    failed = true;
    return;
  }
  report('남긴 파일 삭제', (await outcome(new DeleteObjectCommand({ Bucket, Key: key }))).result, '허용');
  report('삭제 뒤 목록', await listed(key.slice(0, -'s3-check'.length)), '허용 0개');
}

async function main() {
  const [mode, key] = process.argv.slice(2);
  if (!Bucket) {
    console.log('FILE_STORAGE_S3_BUCKET이 없다. api Pod 안에서 실행한다.');
    failed = true;
  } else if (mode === 'keep') await keep();
  else if (mode === 'clean') await clean(key);
  else {
    console.log('사용법: node - keep | node - clean <키>');
    failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}

void main();
