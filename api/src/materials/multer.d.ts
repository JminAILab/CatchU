// multer 2.5.0의 최소 타입 선언. `@types/multer`는 설치돼 있지 않고 새 의존성을 들이지 않으므로(U8 코드 생성 지침),
// PDF 업로드(pdf-material-input.ts)가 쓰는 메모리 저장·single·limits·fileFilter·MulterError만 적는다.
// 모양은 node_modules/multer/lib/make-middleware.js·multer-error.js에서 확인했다. multer는 `@nestjs/platform-express`의
// override(api/package.json `overrides.multer`)로 설치되는 패키지다.
declare module 'multer' {
  import type { IncomingMessage, ServerResponse } from 'node:http';

  namespace multer {
    /** 메모리 저장이 채운 파일. size는 buffer.length다. */
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }

    /** busboy limits. multer는 fileSize·fieldSize·parts에 1을 더해 넘겨 "초과"에서만 알린다. */
    interface Limits {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    }

    type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;

    /** 저장 엔진(memoryStorage()가 돌려준다). 내부 모양은 쓰지 않으므로 불투명하게 둔다. */
    interface StorageEngine {
      readonly _handleFile: unknown;
      readonly _removeFile: unknown;
    }

    interface Options {
      storage?: StorageEngine;
      limits?: Limits;
      /** 파일 스트림을 받기 전에 불린다. error를 주면 요청 전체를 끊는다. */
      fileFilter?(request: IncomingMessage, file: Omit<File, 'size' | 'buffer'>, callback: FileFilterCallback): void;
      /** busboy의 파일 이름·필드 이름 글자 집합. 기본 latin1이라 utf8을 주어야 한글 파일 이름이 깨지지 않는다. */
      defParamCharset?: string;
    }

    type Middleware = (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void;

    interface Multer {
      single(fieldName: string): Middleware;
      none(): Middleware;
    }

    /** `code`로 구분한다(메시지 아님): LIMIT_FILE_SIZE·LIMIT_FILE_COUNT·LIMIT_UNEXPECTED_FILE·LIMIT_FIELD_VALUE·LIMIT_FIELD_COUNT 등. */
    class MulterError extends Error {
      code: string;
      field?: string;
      filename?: string;
    }

    function memoryStorage(): StorageEngine;
  }

  function multer(options?: multer.Options): multer.Multer;

  export = multer;
}
