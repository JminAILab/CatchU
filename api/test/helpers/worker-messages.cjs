// api–worker 메시지 스키마 v1 검사(테스트 전용). worker `app/contract/worker_messages.py`와
// 같은 규칙으로 같은 판정을 내야 한다. 계약 YAML과 합성 세트는 복사하지 않고 원본 경로에서 읽는다.
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { fullFormats } = require('ajv-formats/dist/formats');
const YAML = require('yaml');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CONTRACT_DIR = path.join(
  REPO_ROOT,
  'aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design',
);
const FIXTURE_DIR = path.join(REPO_ROOT, 'worker/fixtures/m1-synthetic');
const CONTRACT_FILES = ['worker-messages.yaml', 'common.yaml'];
// 파일 경로와 무관하게 `./common.yaml` 상대 참조를 풀기 위한 가상 기준 주소.
const BASE_URI = 'https://contract.catchu.invalid/contract-design/';
const MESSAGE_SCHEMAS = ['Request', 'ProcessingEvent', 'Result', 'ResultReceipt'];
// ResultReceipt를 보낼 수 있는지 가르는 세 식별자(worker-messages.yaml ResultReceipt 설명).
const IDENTIFYING_FIELDS = ['resultId', 'requestId', 'attemptId'];
// 계약 코드가 아니라 양쪽 테스트가 비교하는 기대값 이름.
const Verdict = Object.freeze({
  VALID: 'VALID',
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  UNIDENTIFIABLE: 'UNIDENTIFIABLE',
});
const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

// OpenAPI 3.0 `nullable: true`를 JSON Schema의 null 허용으로 바꾼다.
function openapiNullableToJsonSchema(node) {
  if (Array.isArray(node)) return node.map(openapiNullableToJsonSchema);
  if (node === null || typeof node !== 'object') return node;
  const converted = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, openapiNullableToJsonSchema(value)]),
  );
  const nullable = converted.nullable;
  delete converted.nullable;
  if (nullable === true) {
    if (typeof converted.type === 'string') converted.type = [converted.type, 'null'];
    if (Array.isArray(converted.enum) && !converted.enum.includes(null)) {
      converted.enum = [...converted.enum, null];
    }
  }
  return converted;
}

let validators;

function compileValidators() {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  addFormats(ajv, ['uri']);
  // ajv-formats는 날짜와 시각 사이 공백도 받지만 worker(rfc3339-validator)는 T만 받는다.
  const dateTime = fullFormats['date-time'];
  ajv.addFormat('date-time', {
    type: 'string',
    validate: (value) => /^\d{4}-\d{2}-\d{2}T/i.test(value) && dateTime.validate(value),
    compare: dateTime.compare,
  });
  // OpenAPI 문서의 최상위 키는 스키마 키워드가 아니다.
  ajv.addVocabulary(['openapi', 'info', 'paths', 'components']);
  for (const name of CONTRACT_FILES) {
    const document = YAML.parse(fs.readFileSync(path.join(CONTRACT_DIR, name), 'utf8'));
    ajv.addSchema(openapiNullableToJsonSchema(document), BASE_URI + name);
  }
  return Object.fromEntries(
    MESSAGE_SCHEMAS.map((name) => [
      name,
      ajv.compile({ $ref: `${BASE_URI}worker-messages.yaml#/components/schemas/${name}` }),
    ]),
  );
}

// 원문 값을 담지 않는 오류 위치. path는 JSON Pointer, keyword는 어긴 스키마 키워드.
function schemaErrors(schemaName, message) {
  if (!MESSAGE_SCHEMAS.includes(schemaName)) {
    throw new Error(`알 수 없는 메시지 스키마: ${schemaName}`);
  }
  validators ??= compileValidators();
  const validate = validators[schemaName];
  if (validate(message)) return [];
  const unique = new Map(
    validate.errors.map((error) => [
      `${error.instancePath}\u0000${error.keyword}`,
      { path: error.instancePath, keyword: error.keyword },
    ]),
  );
  return [...unique.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.keyword.localeCompare(b.keyword),
  );
}

// 세 식별자 중 비어 있지 않은 문자열로 읽히지 않는 필드를 돌려준다.
function unidentifiedFields(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return [...IDENTIFYING_FIELDS];
  }
  return IDENTIFYING_FIELDS.filter(
    (field) => !(typeof message[field] === 'string' && message[field] !== ''),
  );
}

// 식별 가능성(Result만)을 먼저 보고, 그다음 스키마 v1을 검사한다.
function checkMessage(schemaName, message) {
  const missing = schemaName === 'Result' ? unidentifiedFields(message) : [];
  const errors = schemaErrors(schemaName, message);
  let verdict = Verdict.VALID;
  if (missing.length > 0) verdict = Verdict.UNIDENTIFIABLE;
  else if (errors.length > 0) verdict = Verdict.SCHEMA_INVALID;
  return { verdict, unidentifiedFields: missing, errors };
}

// 문자열 값 안의 `{{이름}}`을 채운다. 값이 없는 자리표시자는 오류로 막는다.
function fillTemplate(template, values) {
  if (Array.isArray(template)) return template.map((item) => fillTemplate(item, values));
  if (template !== null && typeof template === 'object') {
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [key, fillTemplate(value, values)]),
    );
  }
  if (typeof template !== 'string') return template;
  return template.replace(PLACEHOLDER, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`채울 값이 없는 자리표시자: ${name}`);
    return values[name];
  });
}

// cases.json 음성 대조에 쓰는 JSON Patch의 remove·replace만 적용한다.
function applyPatch(document, operations) {
  const patched = structuredClone(document);
  for (const operation of operations) {
    const parts = operation.path
      .split('/')
      .slice(1)
      .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    const last = parts.pop();
    const target = parts.reduce((node, part) => node[part], patched);
    if (operation.op === 'remove') {
      if (Array.isArray(target)) target.splice(Number(last), 1);
      else delete target[last];
    } else if (operation.op === 'replace') {
      target[last] = operation.value;
    } else {
      throw new Error(`지원하지 않는 patch op: ${operation.op}`);
    }
  }
  return patched;
}

function readFixture(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, relativePath), 'utf8'));
}

module.exports = {
  CONTRACT_DIR,
  FIXTURE_DIR,
  IDENTIFYING_FIELDS,
  MESSAGE_SCHEMAS,
  Verdict,
  applyPatch,
  checkMessage,
  fillTemplate,
  readFixture,
  schemaErrors,
  unidentifiedFields,
};
