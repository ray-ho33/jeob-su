#!/usr/bin/env node
/**
 * MCP stdio 스모크 (Gemini 키 불필요)
 * initialize → notifications/initialized → tools/list → tools/call(health_check)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MCP_SCRIPT = path.join(ROOT, "scripts", "acr-mcp-stdio-server.mjs");

function notify(stdin, method, params = {}) {
  stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function main() {
  const proc = spawn(process.execPath, [MCP_SCRIPT], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env },
  });

  if (!proc.stdout || !proc.stdin)
    throw new Error("spawn stdio 초기화 실패");

  const rl = readline.createInterface({
    input: proc.stdout,
    crlfDelay: Infinity,
  });

  const send = async (payload) => {
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

  await send({ jsonrpc: "2.0", id: 2, method: "tools/list" });

  await send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "health_check", arguments: {} },
  });

  /** @type {Map<number, unknown>} */
  const byId = new Map();
  /** @type {Set<number>} */
  const pending = new Set([1, 2, 3]);

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
    }, 30_000);
  });

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

  const want = [
    "health_check",
    "search_similar_decisions",
    "get_decision_detail",
    "get_citation_pack",
  ];
  const names = new Set(tools.map((tool) => tool?.name));
  for (const w of want) {
    if (!names.has(w))
      throw new Error(
        `도구 목록에 '${w}'가 없음: ${JSON.stringify(Array.from(names))}`,
      );
  }

  const healthRpc = /** @type {any} */ (byId.get(3));
  const content = healthRpc?.result?.content;
  if (!Array.isArray(content) || !content[0]?.text)
    throw new Error(`health_check 응답 형식 이상: ${JSON.stringify(healthRpc)}`);

  /** @type {unknown} */
  let healthParsed;
  try {
    healthParsed = JSON.parse(String(content[0].text));
  } catch {
    throw new Error("health_check 본문이 JSON 파싱 불가");
  }
  /** @type {any} */
  const hp = healthParsed;
  if (typeof hp.geminiConfigured !== "boolean")
    throw new Error("health 객체에 geminiConfigured 없음");

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

  console.log(`smoke-acr-mcp OK (protocol=${pv}, tools=${tools.length})`);
}

main().catch((e) => {
  console.error("smoke-acr-mcp FAIL:", e);
  process.exit(1);
});
