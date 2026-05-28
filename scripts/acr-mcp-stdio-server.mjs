#!/usr/bin/env node
/**
 * MCP stdio server (dependency-free JSON-RPC 2.0, one message per line).
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

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      send(jsonRpcError(null, -32700, "Parse error: expected one JSON-RPC payload per line."));
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
