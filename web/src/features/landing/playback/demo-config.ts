/**
 * 합성 시연의 시간표. 장면별 길이(ms), 장면 아래 자막, 포인터 동작(이동 시작·도착·클릭·끝 시각)을 담는다.
 * 값은 확정 디자인(60번 검토본)의 것이다. 시각은 각 장면 안에서 잰다. 화면 속 요소의 표시 시각(data-from 등)은 demos/의 마크업에 있다.
 */
export type DemoKey = "hero" | "records" | "evidence" | "verification" | "publication" | "recipient";

export type DemoAction = {
  /** 장면 안에서 포인터가 향하는 요소의 data-target 값 */
  target: string;
  start: number;
  arrive: number;
  /** 클릭 시각. 읽기만 하는 동작은 null */
  click: number | null;
  end: number;
  kind: "click" | "read" | "move";
};

export type DemoConfig = {
  durations: number[];
  captions: string[];
  actions: DemoAction[][];
};

/** 대표 시연을 몇 번 되풀이한 뒤 요약 화면으로 바꾸는지 */
export const HERO_REPEATS = 3;

export const demoConfig: Record<DemoKey, DemoConfig> = {
  hero: {
    durations: [6000, 8000, 8500, 6000, 7000, 9600, 6500],
    captions: [
      "GitHub에 남긴 작업 기록에서 시작합니다.",
      "저장소 선택 → 분석하기 · 실제로는 동의 뒤에 분석합니다",
      "분석 완료 → 만들어진 Catch 보기",
      "상세 보기로 같은 작업의 내용·근거 확인 · 아직 미공개",
      "한 일의 요약과 연결된 근거 확인 · 원본은 GitHub 새 탭에서 엽니다",
      "Catch 내용이 맞는지 보기 → 공개 켜기 · 언제든 다시 숨기기",
      "링크 발행 → URL 복사 · 실제 발행·복사 없는 시연",
    ],
    actions: [
      [],
      [
        { target: "repository", start: 1200, arrive: 1900, click: 2400, end: 2850, kind: "click" },
        { target: "analyze-repository", start: 5000, arrive: 5700, click: 6400, end: 6850, kind: "click" },
      ],
      [
        { target: "show-catches", start: 5700, arrive: 6400, click: 7100, end: 7550, kind: "click" },
      ],
      [
        { target: "detail-open", start: 3500, arrive: 4200, click: 5000, end: 5450, kind: "click" },
      ],
      [],
      [
        { target: "publish-switch", start: 4400, arrive: 5100, click: 5900, end: 6350, kind: "click" },
      ],
      [
        { target: "issue", start: 300, arrive: 900, click: 1250, end: 1600, kind: "click" },
        { target: "copy", start: 2600, arrive: 3250, click: 3750, end: 4200, kind: "click" },
      ],
    ],
  },
  records: {
    durations: [17500, 9500, 5000],
    captions: [
      "저장소 선택 확인 → 분석 안내 읽기 → 동의하고 분석 요청",
      "분석 중 → 상태 새로고침 → 이 저장소 Catch 보기 · 시간은 편집값",
      "분석된 Catch 목록 미리보기 · 상세 확인은 다음 기능에서",
    ],
    actions: [
      [
        { target: "repository", start: 900, arrive: 1550, click: 2000, end: 2450, kind: "click" },
        { target: "consent-request", start: 11000, arrive: 11650, click: 12200, end: 12650, kind: "click" },
      ],
      [
        { target: "refresh-status", start: 2800, arrive: 3450, click: 3900, end: 4350, kind: "click" },
        { target: "show-catches", start: 7500, arrive: 8150, click: 8600, end: 9050, kind: "click" },
      ],
      [],
    ],
  },
  evidence: {
    durations: [6500, 9500],
    captions: [
      "Catch 설명 → 같은 근거 항목의 원본 근거 열기",
      "원본을 새 탭으로 확인 → 파일·코드 패널만 확대 · 시연 편집",
    ],
    actions: [
      [
        { target: "source", start: 2800, arrive: 3450, click: 4000, end: 4450, kind: "click" },
      ],
      [],
    ],
  },
  verification: {
    durations: [9000],
    captions: [
      "Catch 내용이 맞는지 보기 → 공개 켜기",
    ],
    actions: [
      [
        { target: "catch-read", start: 500, arrive: 1150, click: null, end: 4200, kind: "read" },
        { target: "publish-switch", start: 5600, arrive: 6250, click: 6700, end: 7150, kind: "click" },
      ],
    ],
  },
  publication: {
    durations: [16800, 7500, 7000, 3000],
    captions: [
      "자료 선택·순서 확인 → 같은 편집 화면 내부 이동 → 제목 입력 → 다음: 발행 내용 확인",
      "내용 확인 → 발행 · 실제 요청 없는 합성 시연",
      "URL 복사 후 전달 · 링크 열기는 표시만 함 · 실제 클립보드 사용 없음",
      "받은 사람이 링크를 열면 · 관점 전환, 임시 3초",
    ],
    actions: [
      [
        { target: "material", start: 800, arrive: 1450, click: 1750, end: 2200, kind: "click" },
        { target: "catch", start: 2700, arrive: 3350, click: 3750, end: 4200, kind: "click" },
        { target: "title", start: 7850, arrive: 8500, click: 8800, end: 9200, kind: "click" },
        { target: "next", start: 14400, arrive: 15050, click: 15700, end: 16150, kind: "click" },
      ],
      [
        { target: "issue", start: 3100, arrive: 3750, click: 4450, end: 4900, kind: "click" },
      ],
      [
        { target: "copy", start: 1500, arrive: 2150, click: 2650, end: 3100, kind: "click" },
      ],
      [],
    ],
  },
  recipient: {
    durations: [6500, 9000, 11000, 8500, 8500],
    captions: [
      "작성자가 선택한 소개 자료를 읽습니다.",
      "Catch 내용을 읽고 근거를 펼쳐 봅니다.",
      "궁금한 점을 적고 질문합니다 · 가상 예시",
      "답변을 읽고, 인용된 근거를 눌러 봅니다.",
      "근거가 발행본의 어느 내용인지 확인합니다.",
    ],
    actions: [
      [
        { target: "intro-read", start: 700, arrive: 1350, click: null, end: 6200, kind: "read" },
      ],
      [
        { target: "evidence-disclosure", start: 2500, arrive: 3150, click: 3600, end: 4050, kind: "click" },
      ],
      [
        { target: "question", start: 250, arrive: 900, click: 1200, end: 1600, kind: "click" },
        { target: "ask", start: 6500, arrive: 7150, click: 8000, end: 8450, kind: "click" },
      ],
      [
        { target: "citation", start: 5100, arrive: 5750, click: 6500, end: 6950, kind: "click" },
      ],
      [],
    ],
  },
};
