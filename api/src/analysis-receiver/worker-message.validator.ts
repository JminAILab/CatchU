import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { fullFormats } from 'ajv-formats/dist/formats';
import { parse } from 'yaml';
import { ProcessingEvent, ReceiptIds, Result } from './receiver.types';

const BASE_URI = 'https://contract.catchu.invalid/contract-design/';

export class WorkerMessageValidator {
  private readonly resultValidator: ValidateFunction<Result>;
  private readonly progressValidator: ValidateFunction<ProcessingEvent>;
  private readonly requestValidator: ValidateFunction;

  constructor(contractDirectory: string) {
    const ajv = new Ajv({ allErrors: false });
    addFormats(ajv, ['uri']);
    const dateTime = fullFormats['date-time'] as { validate: (value: string) => boolean };
    // #103 검사와 같은 RFC3339 경계: 날짜/시간 사이 공백은 허용하지 않는다.
    ajv.addFormat('date-time', {
      type: 'string',
      validate: (value: string) => /^\d{4}-\d{2}-\d{2}T/i.test(value) && dateTime.validate(value),
    });
    ajv.addVocabulary(['openapi', 'info', 'paths', 'components']);
    for (const file of ['common.yaml', 'worker-messages.yaml']) {
      // 로컬 승인 스키마만 읽고 외부 $ref를 다운로드하지 않는다.
      const document: object = parse(readFileSync(join(contractDirectory, file), 'utf8'));
      ajv.addSchema(document, BASE_URI + file);
    }
    this.resultValidator = ajv.compile<Result>({ $ref: `${BASE_URI}worker-messages.yaml#/components/schemas/Result` });
    this.progressValidator = ajv.compile<ProcessingEvent>({ $ref: `${BASE_URI}worker-messages.yaml#/components/schemas/ProcessingEvent` });
    this.requestValidator = ajv.compile({ $ref: `${BASE_URI}worker-messages.yaml#/components/schemas/Request` });
  }

  result(value: unknown): value is Result {
    return this.resultValidator(value);
  }

  progress(value: unknown): value is ProcessingEvent {
    return this.progressValidator(value);
  }

  /** api가 큐로 보내는 요청 메시지(#233)를 같은 계약·같은 Ajv 설정으로 검사한다. */
  request(value: unknown): boolean {
    return this.requestValidator(value);
  }
}

export function receiptIds(value: unknown): ReceiptIds | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const { resultId, requestId, attemptId } = fields;
  if (typeof resultId !== 'string' || resultId.length === 0 ||
      typeof requestId !== 'string' || requestId.length === 0 ||
      typeof attemptId !== 'string' || attemptId.length === 0) return null;
  return { resultId, requestId, attemptId };
}
