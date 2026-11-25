import Image from "next/image";
import { StartLink } from "./start-link";

/**
 * 마지막 시작 안내. 덩어리가 화면 높이에 다 들어갈 때만 잠깐 고정된다(playback/ending-pin.ts가 data-pin45로 정한다).
 * 원형 U 심벌은 탭 아이콘과 같은 그림(src/app/icon.png)이다.
 */
export function Ending() {
  return (
    <section className="ending" id="ending">
      <div className="ending-pin45">
        <Image alt="CatchU U 심벌" className="start-symbol" height={1024} src="/icon.png" unoptimized width={1024} />
        <p className="eyebrow">START WITH YOUR WORK</p>
        <h2>
          이제,
          <br />
          <em>나를 설명할 차례.</em>
        </h2>
        <p>
          작업 기록에서 찾은 Catch를 확인하고,
          <br />
          공개할 것을 선택해 링크로 공유하세요.
        </p>
        <StartLink />
        <p className="start-note52">Google 계정으로 시작한 뒤, 분석할 GitHub 계정을 연결합니다.</p>
      </div>
    </section>
  );
}
