#!/usr/bin/env node
/**
 * 권익위 시맨틱 파이프라인 스모크
 * - 코퍼스 JSON 개수·파싱 검증 (항상)
 * - GEMINI_API_KEY 또는 GOOGLE_API_KEY가 있으면: build --limit 3 → query 1회
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TEXT_DIR = path.join(ROOT, "data", "acr-decisions", "text");

async function structural() {
  const files = (await readdir(TEXT_DIR)).filter((f) => f.endsWith(".json"));
  if (files.length < 1) throw new Error(`No JSON under ${TEXT_DIR}`);
  const sample = path.join(TEXT_DIR, files[0]);
  const data = JSON.parse(await readFile(sample, "utf8"));
  const d = data?.AcrService?.의결서;
  if (!d || typeof d !== "object") throw new Error("Missing AcrService.의결서");
  const keys = ["제목", "민원표시", "결정요지", "주문"].filter((k) => d[k]);
  if (keys.length === 0) throw new Error("No header fields in sample");
  console.log(
    `structural OK: ${files.length} json files, sample ${path.basename(sample)} fields=${keys.join(",")}`,
  );
  return files.length;
}

function runLive() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || !String(key).trim()) {
    console.log(
      "live API smoke SKIP (set GEMINI_API_KEY or GOOGLE_API_KEY to run build+query)",
    );
    return;
  }
  console.log("live API smoke: build --limit 3 …");
  const b = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "build-acr-semantic-index.mjs"), "--limit", "3"],
    { cwd: ROOT, stdio: "inherit", env: process.env },
  );
  if (b.status !== 0) throw new Error(`build exited ${b.status}`);
  console.log("live API smoke: query …");
  const q = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts", "query-acr-semantic.mjs"),
      "--top",
      "3",
      "--",
      "소상공인 지원금 부지급 불복 민원",
    ],
    { cwd: ROOT, stdio: "inherit", env: process.env },
  );
  if (q.status !== 0) throw new Error(`query exited ${q.status}`);
  console.log("live API smoke OK");
}

async function main() {
  await structural();
  runLive();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
