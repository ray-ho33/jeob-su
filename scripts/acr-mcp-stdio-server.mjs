#!/usr/bin/env node
/**
 * MCP stdio 서버 (의존성 없음 — JSON-RPC 2.0 한 줄씩 stdin/stdout)
 * 도구: health_check, search_similar_decisions, get_decision_detail, get_citation_pack
 *
 *   node scripts/acr-mcp-stdio-server.mjs
 */

import readline from "node:readline";

import { loadProjectEnv } from "./lib/load-env.mjs";
import {
  handleJsonRpcMessage,
  jsonRpcError,
} from "./lib/acr-mcp-tools.mjs";

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
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

    const response = await handleJsonRpcMessage(msg);
    if (response) send(response);
  }
}

main().catch((e) => {
  console.error("[acr-mcp-stdio]", e);
  process.exit(1);
});
