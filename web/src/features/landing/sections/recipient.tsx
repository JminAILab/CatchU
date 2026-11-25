import { RecipientDemo } from "../demos/recipient-demo";

/** 면접관(링크를 받은 사람)이 보는 화면. 스크롤로 여섯 단계를 고른다(playback/recipient-controller.ts). */
export function Recipient() {
  return (
    <section className="recipient-area" id="recipient">
      <div className="shell">
        <div className="recipient-head">
          <p className="review-note">링크를 받은 사람의 화면</p>
          <h2>
            {"공유한 결과는 "}
            <br />
            면접관에게 이렇게 보입니다.
          </h2>
          <p className="keep54">자료를 읽고 질문하면 AI가 공유된 자료로 답합니다.</p>
        </div>
        <div className="recipient-demo" data-reveal16="right">
          <RecipientDemo />
        </div>
      </div>
    </section>
  );
}
