// U6 Claude MCP의 고정 값(기능 설계 BR2.3·BR4.1·BR6.1·BR6.4·BR6.5, 비기능 설계 performance-design NFR4.2·NFR4.3, scalability-design NFR4.8).
// 값은 이 파일 한곳에 둔다. 응답 크기·빈도는 첫 실제 연결(S22)을 보고 이 값을 코드 PR로 바꾼다.

/** 도구 호출 한 번이 읽는 최대 행 수(NFR4.2). 다음 쪽 확인용 한 행을 더 읽지 않는다. */
export const MCP_PAGE_ROWS = 50;
/** 한 쪽 응답 글 길이 상한(String.length, BR6.5). 웹·Desktop 도구 결과 한도 약 150,000자보다 충분히 작은 시작 값이다. */
export const MCP_PAGE_CHARS = 40_000;
/** 봉투와 nextCursor 몫으로 미리 빼 두는 글자 수(performance-design 「쪽 만들기」). */
export const MCP_PAGE_RESERVE = 200;
/** cursor 길이 상한(performance-design 「cursor」). */
export const MCP_CURSOR_MAX_LENGTH = 1_024;

/** 회원당 1분 고정 창의 도구 호출 수(BR6.1). 61번째부터 거부한다. */
export const MCP_RATE_LIMIT_PER_WINDOW = 60;
/** 빈도 창 길이(밀리초, BR6.1). */
export const MCP_RATE_WINDOW_MS = 60_000;
/** 빈도 키 만료(초, NFR4.8). 창보다 길면 되고, 키에 분 창이 들어 있어 앞 창의 횟수와 합쳐지지 않는다. */
export const MCP_RATE_KEY_TTL_SECONDS = 120;
/** 빈도 명령 하나를 기다리는 상한(밀리초, BR6.3). 넘으면 세지 않고 통과한다. */
export const MCP_RATE_COMMAND_TIMEOUT_MS = 1_000;

/** 승인 코드 수명(밀리초, BR4.1). */
export const MCP_CODE_TTL_MS = 5 * 60 * 1000;
/** 클라이언트 이름 길이 상한(BR2.3). */
export const MCP_CLIENT_NAME_MAX_LENGTH = 200;
