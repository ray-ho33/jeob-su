#!/usr/bin/env node
/**
 * MCP stdio 서버 (의존성 없음 — JSON-RPC 2.0 한 줄씩 stdin/stdout)
 * jeob-su MCP 전용 진입점 — Cursor 등 클라이언트가 stdio로 구동
 *
 *   node scripts/acr-mcp-stdio-server.mjs
 */

import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";

import { loadProjectEnv } from "./lib/load-env.mjs";
import { getGeminiApiKey } from "./lib/gemini-embed.mjs";
import {
  loadSemanticIndex,
  searchSimilarFromIndex,
} from "./lib/acr-semantic-search.mjs";
import { downloadAcrDecisions } from "./lib/acr-download.mjs";
import { buildSemanticIndex } from "./lib/acr-index-build.mjs";
import { ensureSemanticCorpus } from "./lib/acr-setup.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_INDEX = path.join(
  ROOT,
  "data",
  "acr-decisions",
  "semantic",
  "index.json",
);
const MANIFEST_PATH = path.join(
  ROOT,
  "data",
  "acr-decisions",
  "semantic",
  "manifest.json",
);
const DEFAULT_DATA_OUT = path.join(ROOT, "data", "acr-decisions");
const DEFAULT_TEXT_DIR = path.join(DEFAULT_DATA_OUT, "text");
const DEFAULT_SEMANTIC_DIR = path.join(DEFAULT_DATA_OUT, "semantic");

function invalidateIndexCache() {
  cachedIndexPath = null;
  cachedIndex = null;
}

/** @type {string | null} */
let cachedIndexPath = null;
/** @type {{ manifest: object, items: unknown[] } | null} */
let cachedIndex = null;

async function getCachedSemanticIndex(absIndexPath) {
  if (cachedIndexPath !== absIndexPath || !cachedIndex) {
    cachedIndexPath = absIndexPath;
    cachedIndex = await loadSemanticIndex(absIndexPath);
  }
  return cachedIndex;
}

const TOOLS = [
  {
    name: "health_check",
    description:
      "색인 파일·manifest 존재, 항목 수 요약. Gemini 키 설정 여부(값은 노출 안 함). API 호출 없음.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_similar_decisions",
    description:
      "민원/사실관계 텍스트로 시맨틱 검색(Gemini 임베딩 필요). 결과는 embedding 제외 메타·점수 위주.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "민원 또는 질문 본문" },
        top: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        index_path: {
          type: "string",
          description: "index.json 경로(선택, 기본 data/acr-decisions/semantic/index.json 상대 또는 절대)",
        },
        model: { type: "string", description: "GEMINI 임베딩 모델(선택)" },
        dimensions: {
          type: "integer",
          minimum: 0,
          description: "임베딩 차원(빌드 시 --dimensions 썼다면 동일 필요)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_decision_detail",
    description:
      "다운로드된 권익위 의결 JSON에서 주요 헤더·이유 발췌를 반환(법률 자문 아님).",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: {
          type: "string",
          description:
            "data/acr-decisions/text 안의 파일 베이스명(예: 35 또는 35.json)",
        },
        include_reason: { type: "boolean", default: true },
        max_reason_chars: {
          type: "integer",
          minimum: 0,
          maximum: 200_000,
          default: 12_000,
        },
      },
      required: ["decision_id"],
    },
  },
  {
    name: "get_citation_pack",
    description:
      "인용용 메타 묶음(제목·의안번호·의결일·주문 발췌 등). 사용자 자료 작성 보조 목적.",
    inputSchema: {
      type: "object",
      properties: {
        decision_id: {
          type: "string",
          description: "text 디렉터리 JSON 베이스명",
        },
        max_quote_chars: {
          type: "integer",
          minimum: 0,
          maximum: 8000,
          default: 2000,
        },
      },
      required: ["decision_id"],
    },
  },
  {
    name: "ensure_semantic_corpus",
    description:
      "결정문 JSON·시맨틱 색인이 없으면 생성. text/*.json 없으면 다운로드, index.json 없으면 색인 빌드. 전체 재실행은 force 옵션.",
    inputSchema: {
      type: "object",
      properties: {
        force_download: { type: "boolean", default: false },
        force_rebuild: { type: "boolean", default: false },
        skip_download: { type: "boolean", default: false },
        skip_build: { type: "boolean", default: false },
        max_pages: {
          type: "integer",
          minimum: 1,
          description: "다운로드 페이지 상한(테스트·소량용)",
        },
        build_limit: {
          type: "integer",
          minimum: 1,
          description: "색인 생성 문서 수 상한",
        },
        download_delay_ms: { type: "integer", minimum: 0 },
        build_delay_ms: { type: "integer", minimum: 0 },
        dimensions: {
          type: "integer",
          minimum: 0,
          description: "색인·검색 시 동일 차원 필요",
        },
        model: { type: "string", description: "Gemini 임베딩 모델(선택)" },
        data_out_dir: {
          type: "string",
          description: "data/acr-decisions 상대·절대 경로(선택)",
        },
      },
    },
  },
  {
    name: "download_acr_decisions",
    description:
      "법제처 Open API로 권익위 결정문 JSON을 data/acr-decisions/text/에 저장. LAW_OC 또는 KOREAN_LAW_API_KEY 필요.",
    inputSchema: {
      type: "object",
      properties: {
        force: { type: "boolean", default: false },
        max_pages: { type: "integer", minimum: 1 },
        display: { type: "integer", minimum: 1, maximum: 100, default: 100 },
        delay_ms: { type: "integer", minimum: 0, default: 250 },
        data_out_dir: { type: "string" },
      },
    },
  },
  {
    name: "build_semantic_index",
    description:
      "로컬 결정문 JSON → Gemini 임베딩 → semantic/index.json. GEMINI_API_KEY 또는 GOOGLE_API_KEY 필요.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        delay_ms: { type: "integer", minimum: 0, default: 200 },
        dimensions: { type: "integer", minimum: 0 },
        model: { type: "string" },
        text_dir: { type: "string" },
        out_dir: { type: "string" },
      },
    },
  },
];

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function textResult(payload, isError = false) {
  const text =
    typeof payload === "string"
      ? payload
      : JSON.stringify(payload, null, 2) + "\n";
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: data ? { code, message, data } : { code, message },
  };
}

/** @param {string} raw */
function normalizeDecisionId(raw) {
  let s = String(raw ?? "").trim();
  if (s.toLowerCase().endsWith(".json")) {
    s = s.slice(0, -".json".length);
  }
  const base = path.basename(s);
  if (!/^[\w.-]+$/.test(base) || base === "." || base === "..") {
    throw new Error("decision_id는 안전한 파일 베이스명이어야 합니다.");
  }
  return base;
}

async function resolveIndexPath(relOrAbs) {
  if (!relOrAbs || !String(relOrAbs).trim()) return DEFAULT_INDEX;
  const p = path.isAbsolute(relOrAbs)
    ? relOrAbs
    : path.resolve(ROOT, relOrAbs);
  return p;
}

function resolveDataOutDir(relOrAbs) {
  if (!relOrAbs || !String(relOrAbs).trim()) return DEFAULT_DATA_OUT;
  return path.isAbsolute(relOrAbs)
    ? relOrAbs
    : path.resolve(ROOT, relOrAbs);
}

function parseOptionalInt(v) {
  if (v == null || v === "") return undefined;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

async function ensureSemanticCorpusTool(args) {
  const dataOut = resolveDataOutDir(args?.data_out_dir);
  const result = await ensureSemanticCorpus({
    rootDir: ROOT,
    dataOutDir: dataOut,
    forceDownload: Boolean(args?.force_download),
    forceRebuild: Boolean(args?.force_rebuild),
    skipDownload: Boolean(args?.skip_download),
    skipBuild: Boolean(args?.skip_build),
    maxPages: parseOptionalInt(args?.max_pages),
    buildLimit: parseOptionalInt(args?.build_limit),
    downloadDelayMs: parseOptionalInt(args?.download_delay_ms),
    buildDelayMs: parseOptionalInt(args?.build_delay_ms),
    dimensions: parseOptionalInt(args?.dimensions),
    model: args?.model ? String(args.model) : undefined,
  });
  if (result.ranBuild) invalidateIndexCache();
  return result;
}

async function downloadAcrDecisionsTool(args) {
  const dataOut = resolveDataOutDir(args?.data_out_dir);
  return await downloadAcrDecisions({
    outDir: dataOut,
    maxPages: parseOptionalInt(args?.max_pages),
    display: parseOptionalInt(args?.display) ?? 100,
    delayMs: parseOptionalInt(args?.delay_ms) ?? 250,
    force: Boolean(args?.force),
  });
}

async function buildSemanticIndexTool(args) {
  const textDir = args?.text_dir
    ? path.isAbsolute(args.text_dir)
      ? args.text_dir
      : path.resolve(ROOT, args.text_dir)
    : DEFAULT_TEXT_DIR;
  const outDir = args?.out_dir
    ? path.isAbsolute(args.out_dir)
      ? args.out_dir
      : path.resolve(ROOT, args.out_dir)
    : DEFAULT_SEMANTIC_DIR;

  const result = await buildSemanticIndex({
    rootDir: ROOT,
    textDir,
    outDir,
    limit: parseOptionalInt(args?.limit),
    delayMs: parseOptionalInt(args?.delay_ms) ?? 200,
    dimensions: parseOptionalInt(args?.dimensions) ?? 0,
    model: args?.model ? String(args.model) : undefined,
  });
  invalidateIndexCache();
  return {
    manifest: result.manifest,
    indexPath: path.relative(ROOT, result.indexPath).split(path.sep).join("/"),
    itemCount: result.itemCount,
  };
}

async function healthCheckTool() {
  loadProjectEnv();
  const geminiConfigured = Boolean(
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim(),
  );

  let manifestPresent = false;
  let indexed = null;
  let manifestPreview = null;
  try {
    const m = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    manifestPresent = true;
    indexed = typeof m?.indexed === "number" ? m.indexed : null;
    manifestPreview = {
      model: m?.model,
      dim: m?.dim,
      createdAt: m?.createdAt,
      indexed: m?.indexed,
    };
  } catch {
    manifestPresent = false;
  }

  let indexPresent = false;
  let indexBytes = null;
  try {
    const st = await stat(DEFAULT_INDEX);
    indexPresent = true;
    indexBytes = st.size;
  } catch {
    indexPresent = false;
  }

  return {
    ok: manifestPresent || indexPresent,
    geminiConfigured,
    semanticDir: path.relative(ROOT, path.dirname(DEFAULT_INDEX)) || ".",
    indexPathDefault: path.relative(ROOT, DEFAULT_INDEX) || "index.json",
    indexPresent,
    indexBytes,
    manifestPresent,
    manifestIndexed: indexed,
    manifestPreview,
    disclaimer:
      "참고용 도구입니다. 법률 자문이 아니며 결과는 원문과 대조·검증하세요.",
  };
}

async function searchSimilarTool(args, absIndexPath) {
  const query = String(args?.query ?? "").trim();
  if (!query) throw new Error("query가 비었습니다.");

  loadProjectEnv();
  const apiKey = getGeminiApiKey();

  const top = Math.min(
    50,
    Math.max(1, parseInt(String(args?.top ?? "10"), 10) || 10),
  );
  const model = args?.model ? String(args.model) : "";
  const dimensions =
    args?.dimensions != null
      ? Math.max(0, parseInt(String(args.dimensions), 10) || 0)
      : 0;

  const index = await getCachedSemanticIndex(absIndexPath);
  if (!index.items.length) {
    throw new Error(
      "인덱스에 항목이 없습니다. MCP 도구 ensure_semantic_corpus 또는 build_semantic_index를 먼저 실행하세요.",
    );
  }
  const dimUse =
    dimensions > 0 ? dimensions : index.manifest?.outputDimensionality || 0;

  return await searchSimilarFromIndex({
    index,
    queryText: query,
    top,
    embedModel: model,
    dimensions: dimUse,
    apiKey,
    onDimensionMismatch: () => {},
  });
}

async function loadDecisionNormalized(decisionId) {
  const id = normalizeDecisionId(decisionId);
  const textDir = path.join(ROOT, "data", "acr-decisions", "text");
  const resolved = path.resolve(textDir, `${id}.json`);
  const rel = path.relative(textDir, resolved);
  if (
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    path.basename(resolved) !== `${id}.json`
  ) {
    throw new Error("허용되지 않는 경로입니다.");
  }
  const raw = JSON.parse(await readFile(resolved, "utf8"));
  const 의결서 = raw?.AcrService?.의결서;
  if (!의결서 || typeof 의결서 !== "object") {
    throw new Error("AcrService.의결서를 찾을 수 없습니다.");
  }
  return { id, file: path.relative(ROOT, resolved), 의결서 };
}

function clipReason(reason, include, maxChars) {
  if (!include) return null;
  if (!reason || typeof reason !== "string") return null;
  const t = reason.trim();
  if (maxChars <= 0 || t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n…(이하 발췌 생략, max_reason_chars=${maxChars})`;
}

async function getDecisionDetail(args) {
  const { id, file, 의결서 } = await loadDecisionNormalized(args.decision_id);
  const headerKeys = [
    "결정문일련번호",
    "제목",
    "민원표시",
    "결정요지",
    "주문",
    "의안번호",
    "의결일",
    "의결일자",
    "피신청인",
    "신청인",
    "기관명",
  ];
  const header = {};
  for (const k of headerKeys) {
    const v = 의결서[k];
    if (v != null && String(v).trim()) header[k] = String(v).trim();
  }

  const maxReason = Math.min(
    200_000,
    Math.max(0, parseInt(String(args?.max_reason_chars ?? "12000"), 10) || 12000),
  );
  const includeReason = args?.include_reason !== false;

  const 이유 = clipReason(
    의결서["이유"],
    includeReason,
    maxReason,
  );

  return {
    id,
    file,
    header,
    reason_excerpt: 이유,
  };
}

function clipQuotes(s, n) {
  if (!s || typeof s !== "string") return null;
  const t = String(s).trim().replace(/\s+/g, " ");
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

async function getCitationPack(args) {
  const { id, file, 의결서 } = await loadDecisionNormalized(args.decision_id);
  const mq = Math.min(
    8000,
    Math.max(
      0,
      parseInt(String(args?.max_quote_chars ?? "2000"), 10) || 2000,
    ),
  );

  const title = 의결서["제목"];
  const org = 의결서["기관명"] || "국민권익위원회";
  const 번호 = 의결서["의안번호"] || "";
  const 일자 = 의결서["의결일"] || 의결서["의결일자"] || "";

  const suggestedBrief = [
    `${org}`,
    번호 ? `의안 ${번호}` : null,
    title ? `"${clipQuotes(title, mq)}"` : null,
    일자 ? `의결일 ${일자}` : null,
    `로컬 JSON id=${id}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id,
    file,
    org,
    title: title ?? null,
    registry_line: 의결서["민원표시"] ?? null,
    decision_key: 번호 ? String(번호) : null,
    decision_date_display: 일자 ? String(일자) : null,
    disposition_excerpt:
      mq > 0 ? clipQuotes(의결서["주문"], mq) : 의결서["주문"],
    gist_excerpt: mq > 0 ? clipQuotes(의결서["결정요지"], mq) : 의결서["결정요지"],
    petitioner: 의결서["신청인"] ?? null,
    respondent: 의결서["피신청인"] ?? null,
    suggestedBrief,
    citationNote:
      "공식 표기는 원문 및 권익위 공표 자료 확인이 필요합니다. 이 패키지는 작성 보조용입니다.",
  };
}

async function handleToolsCall(params) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  switch (name) {
    case "health_check":
      return textResult(await healthCheckTool());
    case "search_similar_decisions": {
      const absIdx = await resolveIndexPath(args?.index_path);
      return textResult(await searchSimilarTool(args, absIdx));
    }
    case "get_decision_detail":
      return textResult(await getDecisionDetail(args));
    case "get_citation_pack":
      return textResult(await getCitationPack(args));
    case "ensure_semantic_corpus":
      return textResult(await ensureSemanticCorpusTool(args));
    case "download_acr_decisions":
      return textResult(await downloadAcrDecisionsTool(args));
    case "build_semantic_index":
      return textResult(await buildSemanticIndexTool(args));
    default:
      return textResult(`알 수 없는 도구: ${name}`, true);
  }
}

async function main() {
  loadProjectEnv();

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    /** @type {unknown} */
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      send(jsonRpcError(null, -32700, "Parse error — MCP는 한 줄 JSON-RPC 페이로드만 받습니다."));
      continue;
    }
    if (!msg || typeof msg !== "object") {
      send(jsonRpcError(null, -32600, "Invalid Request"));
      continue;
    }
    /** @type {any} */
    const m = msg;
    const isNotification = typeof m.method === "string" && m.id === undefined;

    if (isNotification) {
      if (m.method === "notifications/cancelled") continue;
      continue;
    }

    const id = m.id ?? null;

    try {
      if (m.method === "initialize") {
        const pv =
          typeof m.params?.protocolVersion === "string"
            ? m.params.protocolVersion
            : "2024-11-05";
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: pv,
            capabilities: { tools: {} },
            serverInfo: {
              name: "jeob-su-acr-mcp",
              version: "0.1.0",
            },
            instructions:
              "국민권익위원회 의결례 MCP 전용 서버입니다. 워크플로: health_check → ensure_semantic_corpus(필요 시) → search_similar_decisions → get_decision_detail/get_citation_pack. 법률 자문이 아니며, 민감 정보는 Gemini API로 전송될 수 있습니다.",
          },
        });
        continue;
      }

      if (m.method === "tools/list") {
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        continue;
      }

      if (m.method === "tools/call") {
        try {
          const inner = await handleToolsCall(m.params);
          send({ jsonrpc: "2.0", id, result: inner });
        } catch (e) {
          const msgText = e instanceof Error ? e.message : String(e);
          send({
            jsonrpc: "2.0",
            id,
            result: textResult(msgText, true),
          });
        }
        continue;
      }

      if (m.method === "ping") {
        send({
          jsonrpc: "2.0",
          id,
          result: {},
        });
        continue;
      }

      send(jsonRpcError(id, -32601, `Method not found: ${m.method}`));
    } catch (e) {
      const msgText =
        e instanceof Error ? e.message : String(e);
      send(jsonRpcError(id, -32603, msgText || "Internal error"));
    }
  }
}

main().catch((e) => {
  console.error("[acr-mcp-stdio]", e);
  process.exit(1);
});
