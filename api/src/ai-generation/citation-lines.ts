// 줄 나누개: 근거 글을 인용 단위(줄)로 나누고 줄마다 원문 위치를 기록한다(U1 기능 설계 BR1.1~BR1.3).
// 위치는 근거 글 안의 UTF-16 코드 단위다. JavaScript 문자열 길이·slice가 같은 단위라 그대로 쓴다.

/** Claude에 넘기는 줄 블록 하나. blockIndex는 그 문서 안에서 넘긴 줄의 순번이다. */
export interface CitationLine {
  blockIndex: number;
  /** 근거 글 안 시작 위치(포함). */
  lineStart: number;
  /** 근거 글 안 끝 위치(제외). 줄 끝 \r·\n은 들어가지 않는다. */
  lineEnd: number;
  text: string;
}

/**
 * 줄바꿈(\n)에서만 나누고, 줄바꿈 바로 앞의 캐리지 리턴(\r)을 줄 글자에서 뺀다(BR1.1).
 * 비었거나 공백 문자만 있는 줄은 블록 번호 없이 건너뛰되 다른 줄의 위치는 원문 기준 그대로 둔다(BR1.2·BR1.3).
 */
export function splitCitationLines(text: string): CitationLine[] {
  const lines: CitationLine[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const isLastLine = newline === -1;
    const segmentEnd = isLastLine ? text.length : newline;
    const lineEnd = !isLastLine && segmentEnd > lineStart && text[segmentEnd - 1] === '\r' ? segmentEnd - 1 : segmentEnd;
    const lineText = text.slice(lineStart, lineEnd);
    if (lineText.trim() !== '') {
      lines.push({ blockIndex: lines.length, lineStart, lineEnd, text: lineText });
    }
    if (isLastLine) break;
    lineStart = newline + 1;
  }
  return lines;
}
