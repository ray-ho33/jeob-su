/**
 * 시맨틱 인덱스 로드 → 질의 임베딩 → 코사인(정규화 내적) Top-K
 * query-acr-semantic.mjs / MCP 서버에서 공통 사용.
 */

import { readFile } from "node:fs/promises";
import { geminiEmbed, l2Normalize, dot } from "./gemini-embed.mjs";

/**
 * @typedef {{ manifest: object, items: Array<Record<string, unknown>> }} AcrSemanticIndex
 */

/**
 * @param {string} indexPath
 * @returns {Promise<AcrSemanticIndex>}
 */
export async function loadSemanticIndex(indexPath) {
  const raw = await readFile(indexPath, "utf8");
  const { manifest, items } = JSON.parse(raw);
  if (!Array.isArray(items)) {
    throw new Error("semantic index: items가 배열이 아닙니다.");
  }
  return { manifest: manifest ?? {}, items };
}

/**
 * @param {{
 *   index: AcrSemanticIndex,
 *   queryText: string,
 *   top: number,
 *   embedModel?: string,
 *   dimensions?: number,
 *   apiKey: string,
 *   onDimensionMismatch?: (info: {
 *     id?: string;
 *     indexLen: number;
 *     queryLen: number;
 *   }) => void,
 * }} opts
 */
export async function searchSimilarFromIndex(opts) {
  const {
    index,
    queryText,
    top,
    embedModel,
    dimensions = 0,
    apiKey,
    onDimensionMismatch,
  } = opts;
  const { manifest, items } = index;
  if (items.length === 0) {
    throw new Error("인덱스에 항목이 없습니다. 먼저 build-acr-semantic-index.mjs를 실행하세요.");
  }

  const resolvedModel =
    embedModel ||
    process.env.GEMINI_EMBED_MODEL ||
    manifest?.model ||
    "gemini-embedding-001";
  const embedOpts = { taskType: "RETRIEVAL_QUERY" };
  const dimUse =
    dimensions > 0 ? dimensions : manifest?.outputDimensionality || 0;
  if (dimUse > 0) embedOpts.outputDimensionality = dimUse;

  const qVec = l2Normalize(
    await geminiEmbed(queryText, embedOpts, {
      apiKey,
      model: resolvedModel,
    }),
  );

  const scored = [];
  for (const it of items) {
    const v = it.embedding;
    if (!Array.isArray(v) || v.length !== qVec.length) {
      if (typeof onDimensionMismatch === "function") {
        onDimensionMismatch({
          id: String(it?.id ?? ""),
          indexLen: Array.isArray(v) ? v.length : -1,
          queryLen: qVec.length,
        });
      }
      continue;
    }
    scored.push({ ...it, score: dot(qVec, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, top).map(({ embedding: _emb, ...x }) => x);

  return {
    queryPreview:
      queryText.slice(0, 200) + (queryText.length > 200 ? "…" : ""),
    indexModel: manifest?.model,
    queryModel: resolvedModel,
    top,
    hits,
  };
}
