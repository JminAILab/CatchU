import Link from "next/link";
import { routes } from "@/lib/routes";

/**
 * [Google로 시작하기]. 소개 화면에서 실제로 다른 화면으로 가는 유일한 버튼이며 로그인 화면(/login)으로만 간다.
 * 시연 속 버튼(span)과 달리 진짜 링크다. 로그인 자체는 로그인 화면이 맡는다.
 */
export function StartLink() {
  return (
    <Link className="cta" href={routes.login}>
      <span aria-hidden="true" className="google">
        G
      </span>
      Google로 시작하기
    </Link>
  );
}
