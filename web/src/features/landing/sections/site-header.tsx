import Image from "next/image";
import { StartLink } from "./start-link";

/** 소개 화면 전용 헤더. 페이지와 함께 올라간다(고정하지 않는다). 공통 GuestHeader는 `/`에서 그리지 않는다. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a aria-label="CatchU 처음으로" href="#top">
          <Image alt="CatchU" className="brand-image" height={354} priority src="/landing/catchu-logo.png" unoptimized width={1600} />
        </a>
        <StartLink />
      </div>
    </header>
  );
}
