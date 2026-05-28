#!/usr/bin/env node
/**
 * MCP HTTP 서버 (의존성 없음 — JSON-RPC 2.0 over HTTP)
 *
 *   node scripts/acr-mcp-http-server.mjs
 *   PORT=3000 HOST=0.0.0.0 node scripts/acr-mcp-http-server.mjs
 */

import http from "node:http";

import { loadProjectEnv } from "./lib/load-env.mjs";
import {
  handleJsonRpcMessage,
  healthCheckTool,
  jsonRpcError,
} from "./lib/acr-mcp-tools.mjs";

const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://claude.ai",
  "https://www.claude.ai",
  "http://localhost",
  "http://127.0.0.1",
];

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    ...extraHeaders,
  });
  res.end(text);
}

function getAllowedOrigins() {
  const extra = (process.env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

function isLocalhostOrigin(origin) {
  try {
    const u = new URL(origin);
    return (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      (u.protocol === "http:" || u.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (isLocalhostOrigin(origin)) return true;
  return getAllowedOrigins().includes(origin);
}

function getCorsHeaders(origin = "") {
  const allowOrigin = isAllowedOrigin(origin) && origin ? origin : "null";
  return {
    "access-control-allow-origin": allowOrigin,
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "content-type,authorization,mcp-session-id,mcp-protocol-version",
  };
}

function isAuthorized(req, url) {
  const expected = (process.env.MCP_ACCESS_TOKEN || "").trim();
  if (!expected) return true;
  const queryToken = url.searchParams.get("token") || "";
  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";
  return queryToken === expected || bearer === expected;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("요청 본문이 너무 큽니다."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleMcpPost(req, res, corsHeaders) {
  const raw = await readBody(req);
  /** @type {unknown} */
  let payload;
  try {
    payload = JSON.parse(raw || "null");
  } catch {
    sendJson(res, 400, jsonRpcError(null, -32700, "Parse error"), corsHeaders);
    return;
  }

  if (Array.isArray(payload)) {
    const responses = [];
    for (const item of payload) {
      const response = await handleJsonRpcMessage(item);
      if (response) responses.push(response);
    }
    if (responses.length === 0) {
      sendText(res, 202, "", corsHeaders);
      return;
    }
    sendJson(res, 200, responses, corsHeaders);
    return;
  }

  const response = await handleJsonRpcMessage(payload);
  if (!response) {
    sendText(res, 202, "", corsHeaders);
    return;
  }
  sendJson(res, 200, response, corsHeaders);
}

async function route(req, res) {
  const origin = String(req.headers.origin || "");
  const corsHeaders = getCorsHeaders(origin);

  if (!isAllowedOrigin(origin)) {
    sendJson(res, 403, { error: "forbidden_origin" }, corsHeaders);
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  if (!isAuthorized(req, url)) {
    sendJson(res, 401, { error: "unauthorized" }, corsHeaders);
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, await healthCheckTool(), corsHeaders);
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp") {
      await handleMcpPost(req, res, corsHeaders);
      return;
    }

    if (url.pathname === "/mcp") {
      sendJson(
        res,
        405,
        { error: "method_not_allowed", allowed: ["POST", "GET", "OPTIONS"] },
        { ...corsHeaders, allow: "POST, GET, OPTIONS" },
      );
      return;
    }

    sendJson(res, 404, { error: "not_found" }, corsHeaders);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    sendJson(res, 500, { error: "internal_error", message }, corsHeaders);
  }
}

async function main() {
  loadProjectEnv();

  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: "internal_error", message });
    });
  });

  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort =
      addr && typeof addr === "object" ? addr.port : port;
    console.error(
      `[acr-mcp-http] listening http://${host}:${actualPort}/mcp`,
    );
  });
}

main().catch((e) => {
  console.error("[acr-mcp-http]", e);
  process.exit(1);
});
