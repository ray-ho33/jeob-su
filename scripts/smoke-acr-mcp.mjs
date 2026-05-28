#!/usr/bin/env node
/**
 * MCP stdio 스모크 (Gemini·법제처 키 없이도 기본 검증)
 * initialize → tools/list → health_check → (선택) get_decision_detail
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { loadProjectEnv } from "./lib/load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MCP_SCRIPT = path.join(ROOT, "scripts", "acr-mcp-stdio-server.mjs");

const REQUIRED_TOOLS = [
  "health_check",
  "search_similar_decisions",
  "get_decision_detail",
  "get_citation_pack",
  "ensure_semantic_corpus",
  "download_acr_decisions",
  "build_semantic_index",
];

function notify(stdin, method, params = {}) {
  stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function pickSampleDecisionId() {
  const textDir = path.join(ROOT, "data", "acr-decisions", "text");
  try {
    const names = await readdir(textDir);
    const json = names.filter((n) => n.endsWith(".json")).sort();
    if (json.length === 0) return null;
    return path.basename(json[0], ".json");
  } catch {
    return null;
  }
}

/**
 * @param {import("node:child_process").ChildProcessWithoutNullStreams} proc
 * @param {Array<{ id: number, method: string, params?: object }>} requests
 */
async function runMcpSession(proc, requests) {
  if (!proc.stdout || !proc.stdin)
    throw new Error("spawn stdio 초기화 실패");

  const rl = readline.createInterface({
    input: proc.stdout,
    crlfDelay: Infinity,
  });

  const send = (payload) => {
    proc.stdin.write(JSON.stringify(payload) + "\n");
  };

  await send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "jeob-su-smoke", version: "0" },
    },
  });
  notify(proc.stdin, "notifications/initialized", {});

  const pending = new Set([1]);
  /** @type {Map<number, unknown>} */
  const byId = new Map();

  for (const req of requests) {
    pending.add(req.id);
    await send({
      jsonrpc: "2.0",
      id: req.id,
      method: req.method,
      params: req.params ?? {},
    });
  }

  await new Promise((resolve, reject) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      rl.close();
      resolve(null);
    };
    const fail = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      rl.close();
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      reject(e);
    };

    rl.on("line", (line) => {
      const tline = String(line ?? "").trim();
      if (!tline) return;
      try {
        const msg = JSON.parse(tline);
        if (
          typeof msg?.id !== "undefined" &&
          pending.has(/** @type {number} */ (msg.id))
        ) {
          pending.delete(msg.id);
          byId.set(msg.id, msg);
          if (pending.size === 0) settle();
        }
      } catch (e) {
        fail(e);
      }
    });
    rl.on("close", () => {
      if (pending.size === 0) settle();
      else
        fail(
          new Error(
            `스트림 종료 했지만 응답 부족: 남음=${Array.from(pending).join(",")}`,
          ),
        );
    });
    proc.on("error", (e) => fail(e));

    const t = setTimeout(() => {
      if (pending.size > 0) fail(new Error("MCP 스모크 응답 타임아웃"));
    }, 45_000);
  });

  return byId;
}

function parseToolResultText(rpc) {
  const content = rpc?.result?.content;
  if (!Array.isArray(content) || !content[0]?.text)
    throw new Error(`도구 응답 형식 이상: ${JSON.stringify(rpc)}`);
  return JSON.parse(String(content[0].text));
}

async function main() {
  loadProjectEnv();

  const proc = spawn(process.execPath, [MCP_SCRIPT], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env },
  });

  const sampleId = await pickSampleDecisionId();
  /** @type {Array<{ id: number, method: string, params?: object }>} */
  const requests = [
    { id: 2, method: "tools/list" },
    {
      id: 3,
      method: "tools/call",
      params: { name: "health_check", arguments: {} },
    },
  ];
  if (sampleId) {
    requests.push({
      id: 4,
      method: "tools/call",
      params: {
        name: "get_decision_detail",
        arguments: { decision_id: sampleId, include_reason: false },
      },
    });
  }

  const byId = await runMcpSession(proc, requests);

  const init = byId.get(1);
  if (init?.error)
    throw new Error(`initialize error: ${JSON.stringify(init.error)}`);
  const pv = init?.result?.protocolVersion;
  if (typeof pv !== "string")
    throw new Error("initialize 결과에 protocolVersion 없음");

  const list = /** @type {any} */ (byId.get(2));
  const tools = list?.result?.tools;
  if (!Array.isArray(tools))
    throw new Error("tools/list: tools 배열 없음");

  const names = new Set(tools.map((tool) => tool?.name));
  for (const w of REQUIRED_TOOLS) {
    if (!names.has(w))
      throw new Error(
        `도구 목록에 '${w}'가 없음: ${JSON.stringify(Array.from(names))}`,
      );
  }

  const hp = parseToolResultText(/** @type {any} */ (byId.get(3)));
  if (typeof hp.geminiConfigured !== "boolean")
    throw new Error("health 객체에 geminiConfigured 없음");

  if (sampleId) {
    const detail = parseToolResultText(/** @type {any} */ (byId.get(4)));
    if (detail.id !== sampleId)
      throw new Error(`get_decision_detail id 불일치: ${detail.id}`);
  }

  proc.stdin.end();
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      reject(new Error("서버 종료 타임아웃"));
    }, 15_000);
    proc.once("exit", () => {
      clearTimeout(t);
      resolve(null);
    });
  });

  const hasGemini = Boolean(
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim(),
  );
  const hasLaw = Boolean(
    (process.env.LAW_OC || process.env.KOREAN_LAW_API_KEY || "").trim(),
  );

  if (hasGemini && hp.indexPresent) {
    const proc2 = spawn(process.execPath, [MCP_SCRIPT], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env },
    });
    const byId2 = await runMcpSession(proc2, [
      {
        id: 2,
        method: "tools/call",
        params: {
          name: "search_similar_decisions",
          arguments: {
            query: "민원 처리 지연",
            top: 3,
          },
        },
      },
    ]);
    const search = parseToolResultText(/** @type {any} */ (byId2.get(2)));
    if (!Array.isArray(search.hits))
      throw new Error("search_similar_decisions hits 없음");
    proc2.stdin.end();
    await new Promise((r) => proc2.once("exit", r));
    console.log(
      `smoke-acr-mcp OK (protocol=${pv}, tools=${tools.length}, searchHits=${search.hits.length})`,
    );
  } else {
    console.log(
      `smoke-acr-mcp OK (protocol=${pv}, tools=${tools.length}, search=SKIP${!hasGemini ? " no-gemini-key" : " no-index"})`,
    );
  }

  if (hasLaw && hasGemini) {
    console.log(
      "참고: live ensure_semantic_corpus(max_pages/build_limit)는 API 비용이 있어 스모크에서 생략합니다.",
    );
  }
}

main().catch((e) => {
  console.error("smoke-acr-mcp FAIL:", e);
  process.exit(1);
});
