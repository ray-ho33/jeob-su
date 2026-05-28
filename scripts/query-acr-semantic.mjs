#!/usr/bin/env node
/**
 * @deprecated MCP 도구 `search_similar_decisions` 사용을 권장합니다.
 * 개발·점검용 CLI 래퍼.
 *
 *   node scripts/query-acr-semantic.mjs --top 10 -- "민원 본문"
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGeminiApiKey } from "./lib/gemini-embed.mjs";
import {
  loadSemanticIndex,
  searchSimilarFromIndex,
} from "./lib/acr-semantic-search.mjs";

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
  let top = 10;
  let format = "json";
  let model = process.env.GEMINI_EMBED_MODEL || "";
  let dimensions = 0;
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--index" && argv[i + 1]) indexPath = path.resolve(argv[++i]);
    else if (a === "--top" && argv[i + 1])
      top = Math.max(1, parseInt(argv[++i], 10) || 10);
    else if (a === "--format" && argv[i + 1]) format = argv[++i];
    else if (a === "--model" && argv[i + 1]) model = argv[++i];
    else if (a === "--dimensions" && argv[i + 1])
      dimensions = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--") {
      const tail = argv.slice(i + 1).join(" ").trim();
      if (tail) rest.push(tail);
      break;
    } else if (!a.startsWith("-")) rest.push(a);
  }
  return { indexPath, top, format, model, dimensions, rest };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const { indexPath, top, format, model, dimensions, rest } = parseArgs(
    process.argv,
  );
  const apiKey = getGeminiApiKey();

  let queryText = rest.join(" ").trim();
  if (!queryText) queryText = await readStdin();
  if (!queryText) {
    console.error("민원/질의 텍스트가 없습니다. 인자 또는 stdin으로 입력하세요.");
    process.exit(1);
  }

  const index = await loadSemanticIndex(indexPath);
  if (!index.items.length) {
    console.error(
      "인덱스에 항목이 없습니다. MCP 도구 ensure_semantic_corpus 또는 build_semantic_index를 먼저 실행하세요.",
    );
    process.exit(2);
  }

  const embedModel =
    model || process.env.GEMINI_EMBED_MODEL || index.manifest?.model || "";
  const dimUse =
    dimensions > 0 ? dimensions : index.manifest?.outputDimensionality || 0;

  let out;
  try {
    out = await searchSimilarFromIndex({
      index,
      queryText,
      top,
      embedModel,
      dimensions: dimUse,
      apiKey,
      onDimensionMismatch: ({ id, indexLen, queryLen }) => {
        console.warn(
          `차원 불일치 건너뜀 id=${id}: index=${indexLen} query=${queryLen}`,
        );
      },
    });
  } catch (e) {
    console.error(e.message || e);
    process.exit(2);
  }

  if (index.items.length > 0 && out.hits.length === 0) {
    console.warn(
      "일치 가능한 결과가 없습니다. 빌드/검색에 동일한 --dimensions가 필요한지 또는 인덱스 구조를 확인하세요.",
    );
  }

  if (format === "md") {
    const hits = out.hits;
    let md = `## 유사 권익위 결정문 (Top ${top})\n\n`;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      md += `### ${i + 1}. [${h.id}] 점수 ${h.score.toFixed(4)}\n`;
      md += `- 파일: \`${h.file}\`\n`;
      md += `- 요약: ${(h.preview || "").replace(/\n/g, " ")}\n\n`;
    }
    process.stdout.write(md);
  } else {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
