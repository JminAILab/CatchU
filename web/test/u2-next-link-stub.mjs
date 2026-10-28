// 시험 대역: next/link를 Next 앱 밖에서 그릴 수 있게 <a href>로 바꾼다. 운영 코드에서 쓰지 않는다.
import { createElement } from "react";

export default function Link({ href, children, ...rest }) {
  return createElement("a", { href, ...rest }, children);
}
