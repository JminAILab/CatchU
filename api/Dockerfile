# api 운영 이미지와 별도 migration 단계(#275). 빌드 맥락은 저장소 루트다. 사용법·검사는 deploy/README.md.
#   docker build -f api/Dockerfile -t <api 이미지> .                      # runtime(기본 단계)
#   docker build -f api/Dockerfile --target migration -t <migration 이미지> .
# 비밀값·DB 접속값은 실행할 때 주입한다. 빌드 입력(ARG)·이미지에 넣지 않는다.
ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
ARG CONTRACT_DIR=aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design

# 전체 의존성과 TypeScript 소스. 빌드와 migration 단계가 같은 잠금 파일·소스에서 출발한다.
FROM ${NODE_IMAGE} AS source
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json api/tsconfig.build.json ./
COPY api/src ./src

FROM source AS build
COPY api/scripts/clean-dist.cjs ./scripts/
RUN npm run build

# 운영 의존성만. ts-node·typescript는 잠금 파일에서 devOptional(TypeORM의 선택 peer)이라 --omit=dev만으로는 남는다.
# 이 조합은 api 전용이다. web은 SWC·sharp가 선택 의존성이므로 쓰지 않는다.
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --omit=optional

# 별도 migration 단계: 같은 소스의 TypeORM CLI(ts-node)로 한 번 실행하고 끝난다. 상시 서비스·앱 기동에 넣지 않는다.
# 실패하거나 결과가 불분명하면 다시 돌리거나 되돌리지(revert) 말고 deploy/README.md 「migration」 절차를 따른다.
FROM source AS migration
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="catchu-api-migration" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
# DB는 기본으로 TLS(인증서·호스트 이름 검증)로만 접속한다. 값이 빠지면 pg가 평문으로 붙으므로 이미지에 기본값을 둔다.
# 신뢰 CA는 실행할 때 읽기 전용 파일과 NODE_EXTRA_CA_CERTS로 넣는다(pg는 PGSSLROOTCERT를 읽지 않는다).
ENV NODE_ENV=production \
    PGSSLMODE=verify-full
USER 1000:1000
CMD ["node", "node_modules/typeorm/cli-ts-node-commonjs.js", "migration:run", "-d", "src/database/data-source.ts"]

FROM ${NODE_IMAGE} AS runtime
ARG CONTRACT_DIR
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="catchu-api" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
# PGSSLMODE는 migration 단계와 같은 이유로 둔다.
ENV NODE_ENV=production \
    BIND_HOST=0.0.0.0 \
    PORT=3001 \
    PGSSLMODE=verify-full
WORKDIR /app/api
COPY api/package.json ./
COPY --from=prod-deps /app/api/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
# 결과 수신 검증기(analysis-receiver)가 읽을 계약 YAML. 저장소와 같은 상대 위치(/app/aidlc/...)에 둔다.
COPY ${CONTRACT_DIR}/common.yaml ${CONTRACT_DIR}/worker-messages.yaml /app/${CONTRACT_DIR}/
USER 1000:1000
EXPOSE 3001
# npm을 거치지 않고 node를 직접 실행해 SIGTERM이 앱의 종료 처리(enableShutdownHooks)에 닿게 한다. .env 파일은 읽지 않는다.
CMD ["node", "dist/main.js"]
