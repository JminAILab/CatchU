/** #106 토큰 저장소의 구조만 받는다. 인증 판정·토큰 저장은 이 경계에서 구현하지 않는다. */
export type AssetsTokenSource = {
  get(): { token: string | null };
  subscribe(listener: () => void): () => void;
};

// source 인스턴스가 교체되어도 이전 회원 화면의 key를 다시 쓰지 않는다.
let nextGeneration = 0;

/** React 경계가 회원 화면을 새로 마운트할 때 쓸 숫자만 공개한다. 토큰은 closure 밖으로 반환하지 않는다. */
export function createAssetsSessionScope(tokens: AssetsTokenSource) {
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
      // 구독은 React의 생명주기에 맡긴다. scope 생성만으로 영구 구독을 남기지 않는다.
      return tokens.subscribe(() => {
        // 렌더 사이에 logout→login이 연속으로 와도 각 변경을 관측한다.
        getSnapshot();
        listener();
      });
    },
  };
}
