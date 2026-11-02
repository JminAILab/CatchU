// SDK 1.32.2의 dist/esm/shared/transport.d.ts가 DOM의 HeadersInit을 쓰는데, api는 lib에 DOM을 두지 않고 @types/node에도 이 이름이 없어 빌드가 실패한다.
// 서버 코드에 DOM 전역을 들이지 않고 라이브러리 타입 검사도 끄지 않으려고 이 이름 하나만 선언한다. @types/node가 같은 이름을 더하면 이 파일을 지운다.
type HeadersInit = [string, string][] | Record<string, string> | Headers;
