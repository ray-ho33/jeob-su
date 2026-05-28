#!/usr/bin/env node
/**
 * MCP HTTP 스모크 (Gemini 키 불필요)
 * GET /health → initialize → tools/list → tools/call(health_check)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MCP_SCRIPT = path.join(ROOT, "scripts", "acr-mcp-http-server.mjs");
const LIVE_SEARCH = process.argv.includes("--live-search");

async function waitForServer(proc) {
  if (!proc.stderr) throw new Error("서버 stderr 초기화 실패");

  const rl = readline.createInterface({
    input: proc.stderr,
    crlfDelay: Infinity,
  });

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error("HTTP MCP 서버 시작 타임아웃"));
    }, 30_000);

    rl.on("line", (line) => {
      const match = String(line).match(/listening http:\/\/(.+):(\d+)\/mcp/);
      if (!match) return;
      clearTimeout(timeout);
      rl.close();
      resolve({ host: match[1], port: Number(match[2]) });
    });

    proc.on("error", (e) => {
      clearTimeout(timeout);
      rl.close();
      reject(e);
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      rl.close();
      reject(new Error(`HTTP MCP 서버가 일찍 종료됨: code=${code}`));
    });
  });
}

async function postMcp(base, payload) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "accept": "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2024-11-05",
      "origin": "http://localhost:3000",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST /mcp ${res.status}: ${text}`);
  if (res.status === 202 || !text.trim()) return null;
  return JSON.parse(text);
}

async function main() {
  const proc = spawn(process.execPath, [MCP_SCRIPT], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
  });

  const { host, port } = await waitForServer(proc);
  const base = `http://${host}:${port}`;

  try {
    const healthRes = await fetch(`${base}/health`);
    if (!healthRes.ok)
      throw new Error(`GET /health ${healthRes.status}: ${await healthRes.text()}`);
    const health = await healthRes.json();
    if (typeof health.geminiConfigured !== "boolean")
      throw new Error("health 객체에 geminiConfigured 없음");

    const mcpGet = await fetch(`${base}/mcp`, {
      headers: { accept: "text/event-stream" },
    });
    if (mcpGet.status !== 405)
      throw new Error(`GET /mcp는 405여야 함: ${mcpGet.status}`);

    const forbiddenOrigin = await fetch(`${base}/health`, {
      headers: { origin: "https://example.invalid" },
    });
    if (forbiddenOrigin.status !== 403)
      throw new Error(
        `허용되지 않은 Origin은 403이어야 함: ${forbiddenOrigin.status}`,
      );

    const init = await postMcp(base, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "jeob-su-http-smoke", version: "0" },
      },
    });
    if (init?.error)
      throw new Error(`initialize error: ${JSON.stringify(init.error)}`);
    const pv = init?.result?.protocolVersion;
    if (typeof pv !== "string")
      throw new Error("initialize 결과에 protocolVersion 없음");

    await postMcp(base, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    const list = await postMcp(base, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
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

    const healthRpc = await postMcp(base, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "health_check", arguments: {} },
    });
    const content = healthRpc?.result?.content;
    if (!Array.isArray(content) || !content[0]?.text)
      throw new Error(`health_check 응답 형식 이상: ${JSON.stringify(healthRpc)}`);

    if (LIVE_SEARCH) {
      const searchRpc = await postMcp(base, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "search_similar_decisions",
          arguments: {
            query: "소상공인 지원금 부지급 불복 민원",
            top: 1,
          },
        },
      });
      const searchContent = searchRpc?.result?.content;
      if (!Array.isArray(searchContent) || !searchContent[0]?.text)
        throw new Error(
          `search_similar_decisions 응답 형식 이상: ${JSON.stringify(searchRpc)}`,
        );
      const search = JSON.parse(String(searchContent[0].text));
      if (!Array.isArray(search?.hits))
        throw new Error("search_similar_decisions 결과에 hits 배열 없음");
    }

    console.log(
      `smoke-acr-mcp-http OK (protocol=${pv}, tools=${tools.length}, liveSearch=${LIVE_SEARCH})`,
    );
  } finally {
    proc.kill();
  }
}

main().catch((e) => {
  console.error("smoke-acr-mcp-http FAIL:", e);
  process.exit(1);
});
