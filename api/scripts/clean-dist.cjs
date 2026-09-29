// npm run build의 첫 단계: 이전 빌드 결과(dist)를 지운다.
// tsc는 소스에서 지운 파일의 JS를 남기므로, 지운 엔티티·마이그레이션이 dist에서 계속 탐색되지 않게 한다.
const { rmSync } = require('node:fs');
const { resolve } = require('node:path');

rmSync(resolve(__dirname, '..', 'dist'), { recursive: true, force: true });
