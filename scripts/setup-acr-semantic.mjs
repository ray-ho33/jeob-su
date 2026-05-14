#!/usr/bin/env node
/**
 * 결정문 다운로드 → 시맨틱 색인 생성을 한 번에 수행한다.
 * - text/*.json 이 없으면 download 실행
 * - semantic/index.json 이 없으면 build 실행
 * - --force-download / --force-rebuild 로 각 단계 강제
 *
 *   node scripts/setup-acr-semantic.mjs
 *   node scripts/setup-acr-semantic.mjs --force-rebuild
 *   node scripts/setup-acr-semantic.mjs --max-pages 2 --build-limit 5
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TEXT_DIR = path.join(ROOT, "data", "acr-decisions", "text");
const INDEX_PATH = path.join(ROOT, "data", "acr-decisions", "semantic", "index.json");

function parseArgs(argv) {
  let forceDownload = false;
  let forceRebuild = false;
  let skipDownload = false;
  let skipBuild = false;
  let maxPages = "";
  let buildLimit = "";
  let downloadDelayMs = "";
  let buildDelayMs = "";
  let dimensions = "";
  let model = "";

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force-download") forceDownload = true;
    else if (a === "--force-rebuild") forceRebuild = true;
    else if (a === "--skip-download") skipDownload = true;
    else if (a === "--skip-build") skipBuild = true;
    else if (a === "--max-pages" && argv[i + 1]) maxPages = argv[++i];
    else if (a === "--build-limit" && argv[i + 1]) buildLimit = argv[++i];
    else if (a === "--download-delay-ms" && argv[i + 1])
      downloadDelayMs = argv[++i];
    else if (a === "--build-delay-ms" && argv[i + 1]) buildDelayMs = argv[++i];
    else if (a === "--dimensions" && argv[i + 1]) dimensions = argv[++i];
    else if (a === "--model" && argv[i + 1]) model = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log(`사용법: node scripts/setup-acr-semantic.mjs [옵션]

  (기본) 결정문 JSON이 없으면 다운로드, index.json이 없으면 색인 생성

  --force-download      항상 다운로드 단계 실행 (--force 전달)
  --force-rebuild       항상 색인 단계 실행
  --skip-download       다운로드 생략
  --skip-build          색인 생략
  --max-pages N         다운로드에 전달
  --build-limit N       색인에 --limit N 전달
  --download-delay-ms N 다운로드 --delay-ms
  --build-delay-ms N    색인 --delay-ms
  --dimensions N        색인 --dimensions (쿼리 시에도 동일 값 필요)
  --model M             색인/공통 모델 (해당 스크립트에 전달)
`);
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

async function countTextJson() {
  if (!existsSync(TEXT_DIR)) return 0;
  const names = await readdir(TEXT_DIR);
  return names.filter((n) => n.endsWith(".json")).length;
}

function runNode(scriptRel, args) {
  const script = path.join(ROOT, scriptRel);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptRel} 종료 코드 ${code}`));
    });
  });
}

async function main() {
  const o = parseArgs(process.argv);
  const nText = await countTextJson();
  const hasIndex = existsSync(INDEX_PATH);

  const needDownload =
    !o.skipDownload &&
    (o.forceDownload || nText === 0);
  const needBuild =
    !o.skipBuild && (o.forceRebuild || !hasIndex);

  const downloadArgs = [];
  if (o.forceDownload) downloadArgs.push("--force");
  if (o.maxPages) {
    downloadArgs.push("--max-pages", o.maxPages);
  }
  if (o.downloadDelayMs) {
    downloadArgs.push("--delay-ms", o.downloadDelayMs);
  }

  const buildArgs = [];
  if (o.buildLimit) buildArgs.push("--limit", o.buildLimit);
  if (o.buildDelayMs) buildArgs.push("--delay-ms", o.buildDelayMs);
  if (o.dimensions) buildArgs.push("--dimensions", o.dimensions);
  if (o.model) buildArgs.push("--model", o.model);

  console.log(
    `[setup-acr-semantic] 결정문 JSON: ${nText}건, index.json: ${hasIndex ? "있음" : "없음"}`,
  );

  if (needDownload) {
    console.log("[setup-acr-semantic] 다운로드 실행…");
    await runNode("scripts/download-acr-decisions.mjs", downloadArgs);
  } else {
    console.log("[setup-acr-semantic] 다운로드 생략 (이미 JSON 있음 또는 --skip-download)");
  }

  if (needBuild) {
    console.log("[setup-acr-semantic] 시맨틱 색인 생성…");
    await runNode("scripts/build-acr-semantic-index.mjs", buildArgs);
  } else {
    console.log("[setup-acr-semantic] 색인 생략 (index.json 있음 또는 --skip-build)");
  }

  console.log("[setup-acr-semantic] 완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
