import Image from "next/image";
import Link from "next/link";
import { AI_CONTACT } from "@/components/ai-consent/ai-consent-notice";
import { routes } from "@/lib/routes";

/**
 * 남색 푸터. 폭 700px 이하에서는 네 묶음이 2열이다.
 * 아직 페이지가 없는 메뉴(팀 소개·이용 가이드·자주 묻는 질문·이용약관)는 누를 수 없는 글자로 둔다. 페이지가 생기면 링크로 바꾼다.
 */
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div>
            <Image alt="CatchU" className="brand-image" height={354} src="/landing/catchu-logo-light.png" unoptimized width={1600} />
            <p className="brand-copy">
              GitHub의 작업 기록을,
              <br />
              내 경험을 설명하는 근거로.
            </p>
            <p className="copyright">© 2026 CatchU</p>
          </div>
          <div>
            <h3>CatchU</h3>
            <ul>
              <li>
                <a href="#top">서비스 소개</a>
              </li>
              <li>
                <a href="#evidence">Catch란?</a>
              </li>
              <li>
                <span className="planned">팀 소개</span>
              </li>
            </ul>
          </div>
          <div>
            <h3>이용 도움</h3>
            <ul>
              <li>
                <span className="planned">이용 가이드</span>
              </li>
              <li>
                <span className="planned">자주 묻는 질문</span>
              </li>
              <li>
                <a href={`mailto:${AI_CONTACT}`}>문의·피드백</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>정책</h3>
            <ul>
              <li>
                <span className="planned">이용약관</span>
              </li>
              <li>
                <Link href={routes.privacy}>개인정보 처리방침</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>화면의 작업·계정은 설명을 위한 가상 예시이며 실제 분석 결과가 아닙니다.</span>
        </div>
      </div>
    </footer>
  );
}
