#!/usr/bin/env node
/**
 * 권익위 결정문 JSON → Gemini embedContent(RETRIEVAL_DOCUMENT) → semantic/index.json
 *
 * GEMINI_API_KEY 또는 GOOGLE_API_KEY — 환경변수 또는 프로젝트 루트 `.env` (Google AI Studio)
 *
 *   node scripts/build-acr-semantic-index.mjs
 *   node scripts/build-acr-semantic-index.mjs --limit 5
 *   node scripts/build-acr-semantic-index.mjs --delay-ms 150 --dimensions 768
 */

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getGeminiApiKey,
  geminiEmbed,
  l2Normalize,
} from "./lib/gemini-embed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_TEXT_DIR = path.join(ROOT, "data", "acr-decisions", "text");
const DEFAULT_OUT_DIR = path.join(ROOT, "data", "acr-decisions", "semantic");

const MAX_REASON_CHARS = 10_000;
const PREVIEW_CHARS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function buildSearchText(decision) {
  const parts = [];
  const keys = ["제목", "민원표시", "결정요지", "주문"];
  for (const k of keys) {
    const v = decision[k];
    if (v && String(v).trim()) parts.push(`[${k}]\n${String(v).trim()}`);
  }
  const reason = decision["이유"];
  if (reason && String(reason).trim()) {
    let r = String(reason).trim();
    if (r.length > MAX_REASON_CHARS) r = r.slice(0, MAX_REASON_CHARS) + "\n…(이하 생략)";
    parts.push(`[이유]\n${r}`);
  }
  return parts.join("\n\n").trim();
}

function previewFrom(decision) {
  const t = [decision["제목"], decision["민원표시"]].filter(Boolean).join(" — ");
  const s = t || JSON.stringify(decision).slice(0, PREVIEW_CHARS);
  return s.length > PREVIEW_CHARS ? s.slice(0, PREVIEW_CHARS) + "…" : s;
}

async function main() {
  const { textDir, outDir, limit, delayMs, dimensions, model } = parseArgs(
    process.argv,
  );
  const apiKey = getGeminiApiKey();
  const embedModel = model || process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

  const names = (await readdir(textDir))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const todo = names.slice(0, Number.isFinite(limit) ? limit : names.length);

  console.log(`입력: ${textDir} (${names.length}개 JSON, 처리 ${todo.length}개)`);
  console.log(`출력: ${outDir}`);
  console.log(`모델: ${embedModel}`);

  await mkdir(outDir, { recursive: true });

  const items = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < todo.length; i++) {
    const file = todo[i];
    const id = path.basename(file, ".json");
    const fp = path.join(textDir, file);
    let raw;
    try {
      raw = await readFile(fp, "utf8");
    } catch (e) {
      console.warn(`읽기 실패 ${file}:`, e.message);
      errors++;
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`JSON 파싱 실패 ${file}`);
      errors++;
      continue;
    }
    const decision = data?.AcrService?.의결서;
    if (!decision || typeof decision !== "object") {
      console.warn(`의결서 없음 ${file}`);
      skipped++;
      continue;
    }
    const text = buildSearchText(decision);
    if (!text) {
      console.warn(`검색 텍스트 비어 있음 ${file}`);
      skipped++;
      continue;
    }

    const title = (decision["제목"] && String(decision["제목"]).trim()) || id;
    const embedOpts = {
      taskType: "RETRIEVAL_DOCUMENT",
      title: title.slice(0, 500),
    };
    if (dimensions > 0) embedOpts.outputDimensionality = dimensions;

    let vec;
    try {
      vec = await geminiEmbed(text, embedOpts, { apiKey, model: embedModel });
    } catch (e) {
      console.warn(`임베딩 실패 ${id}:`, e.message);
      errors++;
      continue;
    }

    const normalized = l2Normalize(vec);
    items.push({
      id,
      file: path.relative(ROOT, fp).split(path.sep).join("/"),
      preview: previewFrom(decision),
      embedding: normalized,
    });

    if ((i + 1) % 20 === 0) console.log(`… ${i + 1}/${todo.length}건`);
    if (delayMs) await sleep(delayMs);
  }

  const manifest = {
    provider: "google-gemini",
    model: embedModel,
    taskTypeDocument: "RETRIEVAL_DOCUMENT",
    dim: items[0]?.embedding?.length ?? 0,
    createdAt: new Date().toISOString(),
    sourceDir: path.relative(ROOT, textDir).split(path.sep).join("/"),
    totalFiles: names.length,
    indexed: items.length,
    skipped,
    errors,
    outputDimensionality: dimensions > 0 ? dimensions : null,
  };

  const indexPath = path.join(outDir, "index.json");
  await writeFile(
    indexPath,
    JSON.stringify({ manifest, items }, null, 0),
    "utf8",
  );
  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log("완료:", manifest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
