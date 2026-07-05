/**
 * Google Gemini Embeddings API (embedContent) — 공통 호출
 * @see https://ai.google.dev/api/embeddings
 */

import { loadProjectEnv } from "./load-env.mjs";

const DEFAULT_MODEL = "gemini-embedding-001";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export function getGeminiApiKey() {
  loadProjectEnv();
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!k || !String(k).trim()) {
    throw new Error(
      "GEMINI_API_KEY 또는 GOOGLE_API_KEY가 필요합니다. 터미널에 export 하거나 프로젝트 루트 `.env`에 넣으세요. https://aistudio.google.com/app/apikey",
    );
  }
  return String(k).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} text
 * @param {{ taskType: string, title?: string, outputDimensionality?: number }} opts
 * @param {{ apiKey?: string, model?: string }} config
 * @returns {Promise<number[]>}
 */
export async function geminiEmbed(text, opts, config = {}) {
  const apiKey = config.apiKey || getGeminiApiKey();
  const model = config.model || process.env.GEMINI_EMBED_MODEL || DEFAULT_MODEL;
  const url = `${BASE}/models/${model}:embedContent`;

  const body = {
    content: { parts: [{ text }] },
    taskType: opts.taskType,
  };
  if (opts.title) body.title = opts.title;
  if (opts.outputDimensionality && opts.outputDimensionality > 0) {
    body.outputDimensionality = opts.outputDimensionality;
  }

  const maxRetries = 5;
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Gemini embedContent: JSON 파싱 실패 HTTP ${res.status} — ${raw.slice(0, 200)}`,
      );
    }
    if (!res.ok) {
      const msg = data?.error?.message || raw.slice(0, 300);
      if (res.status === 429 || res.status === 503) {
        const wait = Math.min(30_000, 1000 * 2 ** attempt + Math.random() * 500);
        await sleep(wait);
        lastErr = new Error(`HTTP ${res.status}: ${msg}`);
        continue;
      }
      throw new Error(`Gemini embedContent HTTP ${res.status}: ${msg}`);
    }
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(
        `Gemini embedContent: embedding.values 없음 — ${JSON.stringify(data).slice(0, 400)}`,
      );
    }
    return values.map(Number);
  }
  throw lastErr || new Error("Gemini embedContent: 재시도 초과");
}

/**
 * Float32 리틀엔디언 base64 인코딩 — 텍스트 JSON 숫자 배열 대비 약 4배 작다.
 * @param {ArrayLike<number>} vec
 */
export function encodeEmbeddingBase64(vec) {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf.toString("base64");
}

/**
 * @param {string} b64
 * @returns {Float32Array}
 */
export function decodeEmbeddingBase64(b64) {
  const buf = Buffer.from(b64, "base64");
  const out = new Float32Array(Math.floor(buf.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export function l2Normalize(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  const n = Math.sqrt(s);
  if (n === 0) return vec.slice();
  return vec.map((x) => x / n);
}

export function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
