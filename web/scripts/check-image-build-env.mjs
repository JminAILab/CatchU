// 운영 이미지 빌드(web/Dockerfile)의 공개 빌드 입력을 확인한다. NEXT_PUBLIC_ 값과 보안 헤더는 빌드 결과에 굳으므로,
// 틀린 값으로 만든 이미지가 화면만 뜨고 API 호출은 조용히 막히는 일을 빌드 단계에서 멈춘다(#275).
// 주소 판정은 화면의 호출 함수와 같은 normalizeApiBaseUrl을 운영 빌드 기준(production)으로 쓴다.
import { readdirSync } from "node:fs";
import process from "node:process";
import { normalizeApiBaseUrl } from "../src/lib/api-client.ts";

const errors = [];
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
const normalized = normalizeApiBaseUrl(apiBase, "production");
if (!normalized) {
  errors.push(
    "NEXT_PUBLIC_API_BASE_URL이 없거나 운영 빌드에서 쓸 수 없는 값입니다. 공개 https 출처를 `/v1` 없이 주세요" +
      "(로컬 검증 이미지는 http://127.0.0.1·localhost만 허용).",
  );
} else if (normalized !== new URL(normalized).origin) {
  // 호출 함수는 경로 접두사를 받지만, 운영은 web·api가 같은 출처이고 앞단이 /v1을 그대로 api로 넘긴다(deploy/README.md).
  errors.push("NEXT_PUBLIC_API_BASE_URL에는 경로 없이 출처만 줍니다(예: https://catchu.example). 경로가 붙으면 /v1 앞에 끼어 API 호출이 어긋납니다.");
}
if (process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === "true") {
  errors.push("운영 이미지에서는 NEXT_PUBLIC_DEV_LOGIN_ENABLED를 켤 수 없습니다.");
}
// 빌드 맥락에서 .env*를 뺐는지 한 번 더 확인한다(.dockerignore). Next가 자동으로 읽어 값이 섞이는 것을 막는다.
const envFiles = readdirSync(".").filter((name) => name.startsWith(".env"));
if (envFiles.length > 0) errors.push(`빌드 폴더에 환경 파일이 있습니다: ${envFiles.join(", ")}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[image-build-env] ${error}`);
  process.exit(1);
}
const scope = normalized.startsWith("https://") ? "운영 주소" : "로컬 검증용 주소(운영 배포에 쓰지 않음)";
console.log(`[image-build-env] API 기준 주소 ${normalized} (${scope})`);
