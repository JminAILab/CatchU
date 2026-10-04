// 시험 실행기(scripts/test-with-db.cjs)가 NODE_OPTIONS로 미리 불러온다.
// unlock 링크 전체 실패 상한이 정해지기 전(운영 정책값 null)에도 시험이 앱을 띄울 수 있게, 제한 없는 링크 정책을 시험에서만 허용한다.
// 운영 실행(dist/main.js)은 이 파일을 불러오지 않으므로 상한이 null이면 기동을 거부한다(src/share-links/unlock-policy.ts).
globalThis[Symbol.for('catchu.test.allowUnlimitedUnlockLink')] = true;
