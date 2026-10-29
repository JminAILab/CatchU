// 12월 intent U2 화면 시험 도우미. 시험 파일이 아니다(이름이 .test.mjs로 끝나지 않는다).
// 기존 TypeScript로 src의 .tsx를 변환해 불러오고(test/assets-view.test.mjs와 같은 방식), CSS 모듈은 빈 객체,
// next/link는 시험 대역(<a>)으로 바꾼다. "@/..."와 확장자 없는 상대 경로는 src의 .ts·.tsx로 찾는다.
// 이 검사는 문구·구조를 보며 CSS 배치는 브라우저에서 확인한다.
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";

const srcRoot = new URL("../src/", import.meta.url).href;
const linkStub = new URL("./u2-next-link-stub.mjs", import.meta.url).href;

function withExtension(url) {
  if (/\.(tsx?|mjs|js|css|json)$/.test(new URL(url).pathname)) return url;
  for (const extension of [".ts", ".tsx"]) {
    if (existsSync(new URL(url + extension))) return url + extension;
  }
  return url;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/link") return { url: linkStub, shortCircuit: true, format: "module" };
    if (specifier.startsWith("@/")) return { url: withExtension(new URL(specifier.slice(2), srcRoot).href), shortCircuit: true };
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith(srcRoot)) {
      return { url: withExtension(new URL(specifier, context.parentURL).href), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default new Proxy({}, { get: (_, key) => String(key) });" };
    if (url.startsWith(srcRoot) && url.endsWith(".tsx")) {
      return {
        format: "module", shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

/** src 아래 파일을 불러온다. 예: load("components/ai-consent/ai-consent-dialog.tsx") */
export const load = (path) => import(new URL(path, srcRoot).href);
