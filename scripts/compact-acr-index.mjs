#!/usr/bin/env node
/**
 * 기존 index.json의 숫자 배열 임베딩을 base64 Float32로 재인코딩한다.
 * API 호출 없음 — 파일 크기만 약 4배 줄어든다. 이미 변환된 항목은 그대로 둔다.
 *
 *   node scripts/compact-acr-index.mjs
 *   node scripts/compact-acr-index.mjs --index data/acr-decisions/semantic/index.json
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, stat } from "node:fs/promises";
import { encodeEmbeddingBase64 } from "./lib/gemini-embed.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_INDEX = path.join(
  ROOT,
  "data",
  "acr-decisions",
  "semantic",
  "index.json",
);

function parseArgs(argv) {
  let indexPath = DEFAULT_INDEX;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--index" && argv[i + 1]) indexPath = path.resolve(argv[++i]);
  }
  return { indexPath };
}

async function main() {
  const { indexPath } = parseArgs(process.argv);
  const beforeBytes = (await stat(indexPath)).size;
  const { manifest = {}, items } = JSON.parse(await readFile(indexPath, "utf8"));
  if (!Array.isArray(items)) {
    throw new Error("semantic index: items가 배열이 아닙니다.");
  }

  let converted = 0;
  let already = 0;
  let dim = 0;
  for (const it of items) {
    if (Array.isArray(it?.embedding)) {
      if (!dim) dim = it.embedding.length;
      it.embedding_b64 = encodeEmbeddingBase64(it.embedding);
      delete it.embedding;
      converted++;
    } else if (typeof it?.embedding_b64 === "string") {
      already++;
    }
  }

  manifest.embeddingEncoding = "float32-base64-le";
  if (dim && !manifest.dim) manifest.dim = dim;

  await writeFile(
    indexPath,
    JSON.stringify({ manifest, items }, null, 0),
    "utf8",
  );
  await writeFile(
    path.join(path.dirname(indexPath), "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const afterBytes = (await stat(indexPath)).size;
  console.log(
    `compact-acr-index 완료: 변환 ${converted}건, 기존 b64 ${already}건, ` +
      `${(beforeBytes / 1024 / 1024).toFixed(1)}MB → ${(afterBytes / 1024 / 1024).toFixed(1)}MB`,
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
