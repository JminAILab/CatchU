# web 운영 이미지(#275). 빌드 맥락은 저장소 루트다. 사용법·검사는 deploy/README.md.
#   docker build -f web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://<공개 출처> -t <이미지> .
# NEXT_PUBLIC_ 값과 보안 헤더(CSP connect-src·HSTS)는 빌드 때 굳는다. 공개 주소가 바뀌면 다시 빌드하며, 실행 환경변수로 바꿀 수 없다.
# 비밀값은 빌드 입력(ARG)으로 넣지 않는다. ARG 값은 이미지 기록에 남는다.
ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66

FROM ${NODE_IMAGE} AS build
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
# .npmrc(engine-strict)로 Node 판본 고정을 설치에서도 확인한다. SWC·sharp가 선택 의존성이라 --omit=optional을 쓰지 않는다.
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci
COPY web/next.config.ts web/tsconfig.json ./
COPY web/src ./src
COPY web/scripts/check-image-build-env.mjs ./scripts/
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_DEV_LOGIN_ENABLED=false
# 공통 인증 화면 연결 전환(web/src/lib/auth-integration.ts). 기본 켜짐이다(2026-11-11 팀장 승인, #467).
# 빌드 입력에서 이 값을 빠뜨려도 로그인이 꺼진 이미지가 나오지 않게 한다.
ARG NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true
# standalone 출력은 이미지 빌드에서만 켠다(next.config.ts).
RUN node scripts/check-image-build-env.mjs && CATCHU_STANDALONE_BUILD=1 npm run build

FROM ${NODE_IMAGE} AS runtime
ARG NEXT_PUBLIC_API_BASE_URL
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="catchu-web" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.catchu.web.public-api-base-url="${NEXT_PUBLIC_API_BASE_URL}"
# standalone 서버는 HOSTNAME으로 바인딩한다. Docker가 컨테이너 ID를 넣으므로 명시한다.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app/web
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./.next/static
# 파일은 root 소유(읽기 전용)로 두고 숫자 UID로 실행한다(Kubernetes runAsNonRoot 확인용).
USER 1000:1000
EXPOSE 3000
CMD ["node", "server.js"]
