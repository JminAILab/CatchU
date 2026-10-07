/**
 * 회원(토큰)이 바뀔 때마다 새 세대 번호를 주는 범위(#149). 화면은 이 번호를 key로 써서 이전 회원의 상태를 버린다.
 * 내 자산의 `assets-session-scope.ts`와 같은 방식이다. 세 번째로 필요해지면 공통(`src/lib/`)으로 옮긴다
 * (코딩 절차: 모양이 같은 코드는 세 번째에 합친다).
 */
export type TokenSource = {
  get(): { token: string | null };
  subscribe(listener: () => void): () => void;
};

let nextGeneration = 0;

/** 토큰은 closure 밖으로 내보내지 않고 세대 번호만 공개한다. 토큰이 없으면 null. */
export function createMemberSessionScope(tokens: TokenSource) {
  let token = tokens.get().token;
  let generation: number | null = token === null ? null : ++nextGeneration;

  function getSnapshot(): number | null {
    const current = tokens.get().token;
    if (current !== token) {
      token = current;
      generation = current === null ? null : ++nextGeneration;
    }
    return generation;
  }

  return {
    getSnapshot,
    subscribe(listener: () => void) {
      return tokens.subscribe(() => {
        // 렌더 사이에 로그아웃→로그인이 연달아 와도 각 변경을 세대로 남긴다.
        getSnapshot();
        listener();
      });
    },
  };
}
