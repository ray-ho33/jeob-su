#!/usr/bin/env node
/**
 * MCP HTTP 서버 (의존성 없음 — JSON-RPC 2.0 over HTTP)
 *
 *   node scripts/acr-mcp-http-server.mjs
 *   PORT=3000 HOST=0.0.0.0 node scripts/acr-mcp-http-server.mjs
 */

import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

import { loadProjectEnv } from "./lib/load-env.mjs";
import {
  handleJsonRpcMessage,
  healthCheckTool,
  jsonRpcError,
} from "./lib/acr-mcp-tools.mjs";

const MAX_BODY_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_BUCKET_SWEEP_SIZE = 1024;
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

function tokenMatches(provided, expected) {
  if (!provided) return false;
  // 해시 후 비교: 길이가 달라도 timingSafeEqual을 쓸 수 있고 길이 정보도 새지 않는다.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function isAuthorized(req, url) {
  const expected = (process.env.MCP_ACCESS_TOKEN || "").trim();
  if (!expected) return true;
  const queryToken = url.searchParams.get("token") || "";
  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";
  return tokenMatches(queryToken, expected) || tokenMatches(bearer, expected);
}

function isTruthyEnv(name) {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function getToolOptions() {
  return {
    allowMutatingTools: isTruthyEnv("MCP_ENABLE_MUTATING_TOOLS"),
    requireBoundedMutations: true,
  };
}

/** @type {Map<string, number[]>} */
const rateBuckets = new Map();

function getClientIp(req) {
  const fly = String(req.headers["fly-client-ip"] || "").trim();
  if (fly) return fly;
  const fwd = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (fwd) return fwd;
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const limit = Number.parseInt(process.env.MCP_RATE_LIMIT || "60", 10);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const now = Date.now();
  if (rateBuckets.size > RATE_BUCKET_SWEEP_SIZE) {
    for (const [key, times] of rateBuckets) {
      if (times.length === 0 || now - times[times.length - 1] >= RATE_WINDOW_MS) {
        rateBuckets.delete(key);
      }
    }
  }
  const recent = (rateBuckets.get(ip) || []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (recent.length >= limit) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return false;
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

  const toolOptions = getToolOptions();
  if (Array.isArray(payload)) {
    const responses = [];
    for (const item of payload) {
      const response = await handleJsonRpcMessage(item, toolOptions);
      if (response) responses.push(response);
    }
    if (responses.length === 0) {
      sendText(res, 202, "", corsHeaders);
      return;
    }
    sendJson(res, 200, responses, corsHeaders);
    return;
  }

  const response = await handleJsonRpcMessage(payload, toolOptions);
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

  if (url.pathname === "/mcp" && isRateLimited(getClientIp(req))) {
    sendJson(
      res,
      429,
      { error: "rate_limited", retry_after_seconds: 60 },
      { ...corsHeaders, "retry-after": "60" },
    );
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
    if (!(process.env.MCP_ACCESS_TOKEN || "").trim()) {
      console.error(
        "[acr-mcp-http] 경고: MCP_ACCESS_TOKEN이 설정되지 않아 누구나 접근할 수 있습니다. 공개 배포 시 반드시 설정하세요.",
      );
    }
    if (isTruthyEnv("MCP_ENABLE_MUTATING_TOOLS")) {
      console.error(
        "[acr-mcp-http] 주의: MCP_ENABLE_MUTATING_TOOLS=1 — 다운로드·색인 도구가 HTTP로 노출됩니다.",
      );
    }
  });
}

main().catch((e) => {
  console.error("[acr-mcp-http]", e);
  process.exit(1);
});
