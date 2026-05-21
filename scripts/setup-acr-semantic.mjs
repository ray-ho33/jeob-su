#!/usr/bin/env node
/**
 * @deprecated MCP 도구 `ensure_semantic_corpus` 사용을 권장합니다.
 * 개발·점검용 CLI 래퍼.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSemanticCorpus } from "./lib/acr-setup.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  let forceDownload = false;
  let forceRebuild = false;
  let skipDownload = false;
  let skipBuild = false;
  let maxPages;
  let buildLimit;
  let downloadDelayMs;
  let buildDelayMs;
  let dimensions;
  let model = "";

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force-download") forceDownload = true;
    else if (a === "--force-rebuild") forceRebuild = true;
    else if (a === "--skip-download") skipDownload = true;
    else if (a === "--skip-build") skipBuild = true;
    else if (a === "--max-pages" && argv[i + 1])
      maxPages = parseInt(argv[++i], 10);
    else if (a === "--build-limit" && argv[i + 1])
      buildLimit = parseInt(argv[++i], 10);
    else if (a === "--download-delay-ms" && argv[i + 1])
      downloadDelayMs = parseInt(argv[++i], 10);
    else if (a === "--build-delay-ms" && argv[i + 1])
      buildDelayMs = parseInt(argv[++i], 10);
    else if (a === "--dimensions" && argv[i + 1])
      dimensions = parseInt(argv[++i], 10);
    else if (a === "--model" && argv[i + 1]) model = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log(`사용법: node scripts/setup-acr-semantic.mjs [옵션]
  권장: Cursor MCP 도구 ensure_semantic_corpus

  --force-download / --force-rebuild / --skip-download / --skip-build
  --max-pages N / --build-limit N / --download-delay-ms N / --build-delay-ms N
  --dimensions N / --model M`);
      process.exit(0);
    }
  }

  return {
    forceDownload,
    forceRebuild,
    skipDownload,
    skipBuild,
    maxPages,
    buildLimit,
    downloadDelayMs,
    buildDelayMs,
    dimensions,
    model,
  };
}

async function main() {
  const o = parseArgs(process.argv);
  const result = await ensureSemanticCorpus({
    rootDir: ROOT,
    forceDownload: o.forceDownload,
    forceRebuild: o.forceRebuild,
    skipDownload: o.skipDownload,
    skipBuild: o.skipBuild,
    maxPages: o.maxPages,
    buildLimit: o.buildLimit,
    downloadDelayMs: o.downloadDelayMs,
    buildDelayMs: o.buildDelayMs,
    dimensions: o.dimensions,
    model: o.model || undefined,
    log: (msg) => console.log(msg),
  });
  console.log("[setup-acr-semantic] 완료:", result);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
