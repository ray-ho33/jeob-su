#!/usr/bin/env node
/**
 * @deprecated MCP 도구 `download_acr_decisions` 사용을 권장합니다.
 * 개발·점검용 CLI 래퍼.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadAcrDecisions } from "./lib/acr-download.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  let out = path.join(ROOT, "data", "acr-decisions");
  let maxPages = Infinity;
  let display = 100;
  let delayMs = 250;
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) out = path.resolve(argv[++i]);
    else if (a === "--max-pages" && argv[i + 1])
      maxPages = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--display" && argv[i + 1])
      display = Math.min(100, Math.max(1, parseInt(argv[++i], 10) || 100));
    else if (a === "--delay-ms" && argv[i + 1])
      delayMs = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--force") force = true;
  }
  return { out, maxPages, display, delayMs, force };
}

async function main() {
  const { out, maxPages, display, delayMs, force } = parseArgs(process.argv);
  const manifest = await downloadAcrDecisions({
    outDir: out,
    maxPages,
    display,
    delayMs,
    force,
    log: (msg) => console.log(msg),
  });
  console.log("완료:", manifest);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
