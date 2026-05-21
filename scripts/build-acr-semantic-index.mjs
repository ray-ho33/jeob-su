#!/usr/bin/env node
/**
 * @deprecated MCP 도구 `build_semantic_index` 사용을 권장합니다.
 * 개발·점검용 CLI 래퍼.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSemanticIndex } from "./lib/acr-index-build.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_TEXT_DIR = path.join(ROOT, "data", "acr-decisions", "text");
const DEFAULT_OUT_DIR = path.join(ROOT, "data", "acr-decisions", "semantic");

function parseArgs(argv) {
  let textDir = DEFAULT_TEXT_DIR;
  let outDir = DEFAULT_OUT_DIR;
  let limit = Infinity;
  let delayMs = 200;
  let dimensions = 0;
  let model = process.env.GEMINI_EMBED_MODEL || "";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--text-dir" && argv[i + 1]) textDir = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) outDir = path.resolve(argv[++i]);
    else if (a === "--limit" && argv[i + 1])
      limit = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--delay-ms" && argv[i + 1])
      delayMs = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--dimensions" && argv[i + 1])
      dimensions = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--model" && argv[i + 1]) model = argv[++i];
  }
  return { textDir, outDir, limit, delayMs, dimensions, model };
}

async function main() {
  const { textDir, outDir, limit, delayMs, dimensions, model } = parseArgs(
    process.argv,
  );
  const { manifest } = await buildSemanticIndex({
    rootDir: ROOT,
    textDir,
    outDir,
    limit,
    delayMs,
    dimensions,
    model,
    log: (msg) => console.log(msg),
  });
  console.log("완료:", manifest);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
