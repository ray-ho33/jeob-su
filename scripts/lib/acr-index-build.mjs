/**
 * 권익위 결정문 시맨틱 색인 생성 — MCP·CLI 공용
 */

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getGeminiApiKey,
  geminiEmbed,
  l2Normalize,
} from "./gemini-embed.mjs";

const MAX_REASON_CHARS = 10_000;
const PREVIEW_CHARS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildSearchText(decision) {
  const parts = [];
  const keys = ["제목", "민원표시", "결정요지", "주문"];
  for (const k of keys) {
    const v = decision[k];
    if (v && String(v).trim()) parts.push(`[${k}]\n${String(v).trim()}`);
  }
  const reason = decision["이유"];
  if (reason && String(reason).trim()) {
    let r = String(reason).trim();
    if (r.length > MAX_REASON_CHARS)
      r = r.slice(0, MAX_REASON_CHARS) + "\n…(이하 생략)";
    parts.push(`[이유]\n${r}`);
  }
  return parts.join("\n\n").trim();
}

function previewFrom(decision) {
  const t = [decision["제목"], decision["민원표시"]].filter(Boolean).join(" — ");
  const s = t || JSON.stringify(decision).slice(0, PREVIEW_CHARS);
  return s.length > PREVIEW_CHARS ? s.slice(0, PREVIEW_CHARS) + "…" : s;
}

/**
 * @param {{
 *   rootDir: string,
 *   textDir: string,
 *   outDir: string,
 *   limit?: number,
 *   delayMs?: number,
 *   dimensions?: number,
 *   model?: string,
 *   log?: (msg: string) => void,
 * }} opts
 */
export async function buildSemanticIndex(opts) {
  const root = path.resolve(opts.rootDir);
  const textDir = path.resolve(opts.textDir);
  const outDir = path.resolve(opts.outDir);
  const limit =
    opts.limit != null && opts.limit > 0 ? opts.limit : Infinity;
  const delayMs = Math.max(0, opts.delayMs ?? 200);
  const dimensions = Math.max(0, opts.dimensions ?? 0);
  const embedModel =
    opts.model ||
    process.env.GEMINI_EMBED_MODEL ||
    "gemini-embedding-001";
  const log = opts.log ?? (() => {});

  const apiKey = getGeminiApiKey();

  const names = (await readdir(textDir))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const todo = names.slice(0, Number.isFinite(limit) ? limit : names.length);

  log(`입력: ${textDir} (${names.length}개 JSON, 처리 ${todo.length}개)`);
  log(`출력: ${outDir}`);
  log(`모델: ${embedModel}`);

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
      log(`읽기 실패 ${file}: ${e.message}`);
      errors++;
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      log(`JSON 파싱 실패 ${file}`);
      errors++;
      continue;
    }
    const decision = data?.AcrService?.의결서;
    if (!decision || typeof decision !== "object") {
      log(`의결서 없음 ${file}`);
      skipped++;
      continue;
    }
    const text = buildSearchText(decision);
    if (!text) {
      log(`검색 텍스트 비어 있음 ${file}`);
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
      log(`임베딩 실패 ${id}: ${e.message}`);
      errors++;
      continue;
    }

    const normalized = l2Normalize(vec);
    items.push({
      id,
      file: path.relative(root, fp).split(path.sep).join("/"),
      preview: previewFrom(decision),
      embedding: normalized,
    });

    if ((i + 1) % 20 === 0) log(`… ${i + 1}/${todo.length}건`);
    if (delayMs) await sleep(delayMs);
  }

  const manifest = {
    provider: "google-gemini",
    model: embedModel,
    taskTypeDocument: "RETRIEVAL_DOCUMENT",
    dim: items[0]?.embedding?.length ?? 0,
    createdAt: new Date().toISOString(),
    sourceDir: path.relative(root, textDir).split(path.sep).join("/"),
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

  return {
    manifest,
    indexPath,
    outDir,
    itemCount: items.length,
  };
}
