/** 가상 예시 카드. 실제 사용자·저장소·커밋을 가리키지 않는다. */
const EXAMPLES = [
  {
    title: "요청 처리 로직과 테스트 수정",
    description: "요청 처리 파일과 중복 요청 상황을 확인하는 테스트를 함께 수정한 작업입니다.",
    evidence: ["request-handler.ts · a1b2c3", "request-handler.test.ts · d4e5f6"],
  },
  {
    title: "입력값 검증과 빈 입력 테스트",
    description: "입력값을 확인하는 코드와 빈 입력 상황에 대한 테스트를 추가한 작업입니다.",
    evidence: ["request-validator.ts · b2c3d4", "request-validator.test.ts · c5d6e7"],
  },
  {
    title: "오류 응답 처리 보완",
    description: "오류 상황의 응답 처리 코드와 관련 테스트를 함께 보완한 작업입니다.",
    evidence: ["error-handler.ts · e7f8a9", "error-handler.test.ts · a2b3c4"],
  },
  {
    title: "캐시 키 구성과 테스트 수정",
    description: "요청별 캐시 키를 구성하는 코드와 관련 테스트를 수정한 작업입니다.",
    evidence: ["cache-key.ts · d2e3f4", "cache-key.test.ts · e5f6a7"],
  },
];

function ExampleGroup({ duplicate = false }: { duplicate?: boolean }) {
  return (
    // 둘째 묶음은 이음매 없이 흐르게 하려고 한 번 더 붙인 그림이다. 보조기기와 포커스에서 뺀다.
    <div className="catch-gallery-group34" aria-hidden={duplicate ? "true" : undefined} inert={duplicate ? true : undefined}>
      {EXAMPLES.map((example) => (
        <article className="catch-example34" key={example.title}>
          <p className="example-type34">가상 예시 · sample-project</p>
          <h4>{example.title}</h4>
          <p className="example-description34">{example.description}</p>
          <div className="example-evidence34">
            <strong>연결된 근거 · {example.evidence.length}개</strong>
            {example.evidence[0]}
            <br />
            {example.evidence[1]}
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Catch 예시 카드 줄. 흐름·일시정지·재개는 playback/gallery-marquee.ts가 맡는다.
 * 스크립트가 꺼져 있거나 동작 줄이기이면 흐르지 않는 카드 목록으로 읽힌다.
 */
export function CatchGallery() {
  return (
    <section className="examples36" id="catch-examples">
      <div className="catch-gallery34" role="region" aria-label="가상의 Catch 작업 예시">
        <div className="catch-gallery-heading34">
          <div>
            <h3>Catch에는 이런 내용이 담깁니다.</h3>
            <p>
              작업 내용과 연결된 근거를 함께 보여줍니다.
              <br />
              아래는 이해를 돕기 위해 내용을 간추린 가상 예시입니다.
            </p>
          </div>
          <button type="button" className="catch-gallery-pause34" aria-pressed="false" aria-controls="catch-gallery-track34">
            일시정지
          </button>
          <span className="catch-gallery-static34">정적 예시</span>
        </div>
        <div className="catch-gallery-viewport34">
          <div className="catch-gallery-track34" id="catch-gallery-track34">
            <ExampleGroup />
            <ExampleGroup duplicate />
          </div>
        </div>
      </div>
    </section>
  );
}
