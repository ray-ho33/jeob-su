/**
 * 국민권익위원회 결정문 다운로드 (법제처 Open API) — MCP·CLI 공용
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { loadProjectEnv } from "./load-env.mjs";

const BASE = "https://www.law.go.kr/DRF";
const UA =
  process.env.LAW_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * @returns {string}
 */
export function getLawApiKey() {
  loadProjectEnv();
  const k = process.env.LAW_OC || process.env.KOREAN_LAW_API_KEY;
  if (!k || !String(k).trim()) {
    throw new Error(
      "법제처 Open API 인증키가 없습니다. LAW_OC 또는 KOREAN_LAW_API_KEY를 프로젝트 루트 `.env`에 설정하세요. 발급: https://open.law.go.kr/LSO/openApi/guideResult.do",
    );
  }
  return String(k).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractTag(content, tag) {
  const cdataRegex = new RegExp(
    `<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
  );
  const cdataMatch = content.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1];
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const match = content.match(regex);
  if (match) return match[1].trim();
  return "";
}

function parseAcrSearchXml(xml) {
  const rootTag = "Acr";
  const itemTag = "acr";
  const rootStart = `<${rootTag}>`;
  const rootEnd = `</${rootTag}>`;
  const startIdx = xml.indexOf(rootStart);
  const endIdx = xml.lastIndexOf(rootEnd);
  if (startIdx === -1 || endIdx === -1) {
    return { totalCnt: 0, page: 1, items: [] };
  }
  const content = xml.substring(startIdx + rootStart.length, endIdx);
  const totalCnt = parseInt(extractTag(content, "totalCnt") || "0", 10);
  const page = parseInt(extractTag(content, "page") || "1", 10);
  const itemRegex = new RegExp(
    `<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`,
    "g",
  );
  const items = [];
  let m;
  while ((m = itemRegex.exec(content)) !== null) {
    const block = m[1];
    const id =
      extractTag(block, "결정문일련번호") ||
      extractTag(block, "결정일련번호") ||
      extractTag(block, "판례일련번호") ||
      extractTag(block, "일련번호");
    if (id) {
      items.push({
        id,
        사건명:
          extractTag(block, "사건명") ||
          extractTag(block, "안건명") ||
          extractTag(block, "제목"),
        사건번호: extractTag(block, "사건번호") || extractTag(block, "의안번호"),
        결정일자:
          extractTag(block, "결정일자") ||
          extractTag(block, "의결일") ||
          extractTag(block, "선고일자") ||
          extractTag(block, "등록일"),
      });
    }
  }
  return { totalCnt, page, items };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${url.split("?")[0]}`);
  }
  if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
    throw new Error("HTML 응답(파라미터 오류·차단 가능). OC·target 확인.");
  }
  return text;
}

function buildSearchUrl(oc, page, display) {
  const p = new URLSearchParams({
    OC: oc,
    target: "acr",
    display: String(display),
    page: String(page),
  });
  return `${BASE}/lawSearch.do?${p.toString()}`;
}

function buildDetailUrl(oc, id) {
  const p = new URLSearchParams({
    OC: oc,
    target: "acr",
    type: "JSON",
    ID: id,
  });
  return `${BASE}/lawService.do?${p.toString()}`;
}

async function fileExists(fp) {
  try {
    await access(fp, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   outDir: string,
 *   maxPages?: number,
 *   display?: number,
 *   delayMs?: number,
 *   force?: boolean,
 *   log?: (msg: string) => void,
 * }} opts
 */
export async function downloadAcrDecisions(opts) {
  const out = path.resolve(opts.outDir);
  const maxPages =
    opts.maxPages != null && opts.maxPages > 0 ? opts.maxPages : Infinity;
  const display = Math.min(100, Math.max(1, opts.display ?? 100));
  const delayMs = Math.max(0, opts.delayMs ?? 250);
  const force = Boolean(opts.force);
  const log = opts.log ?? (() => {});

  const oc = getLawApiKey();
  const textDir = path.join(out, "text");
  await mkdir(textDir, { recursive: true });

  log(`출력: ${out}`);
  log(
    `목록 페이지 크기: ${display}, 최대 페이지: ${maxPages === Infinity ? "제한 없음" : maxPages}`,
  );

  let page = 1;
  let totalCnt = 0;
  let downloaded = 0;
  let skipped = 0;
  const seen = new Set();

  for (;;) {
    if (page > maxPages) break;
    const listUrl = buildSearchUrl(oc, page, display);
    const xml = await fetchText(listUrl);
    const parsed = parseAcrSearchXml(xml);
    if (page === 1) {
      totalCnt = parsed.totalCnt;
      log(`총 건수(totalCnt): ${totalCnt}`);
      if (totalCnt === 0) {
        const head = xml.slice(0, 500).replace(/\s+/g, " ");
        throw new Error(
          `검색 결과 0건입니다. API 키 권한·응답 형식을 확인하세요. 응답 앞부분: ${head}`,
        );
      }
    }

    if (parsed.items.length === 0) {
      log(`페이지 ${page}: 항목 없음 — 종료`);
      break;
    }

    for (const row of parsed.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const fp = path.join(textDir, `${row.id}.json`);
      if (!force && (await fileExists(fp))) {
        skipped++;
        continue;
      }
      const detailUrl = buildDetailUrl(oc, row.id);
      const body = await fetchText(detailUrl);
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error(`JSON 파싱 실패 id=${row.id}`);
      }
      if (!data.AcrService) {
        log(`경고: AcrService 없음 id=${row.id}, 건너뜀`);
        continue;
      }
      await writeFile(fp, JSON.stringify(data, null, 2), "utf8");
      downloaded++;
      if (downloaded % 50 === 0) {
        log(`… 본문 ${downloaded}건 저장 (누적 고유 ID ${seen.size})`);
      }
      if (delayMs) await sleep(delayMs);
    }

    log(
      `페이지 ${page}/${Math.ceil(totalCnt / display) || "?"} 처리 (${parsed.items.length}건)`,
    );

    if (parsed.items.length < display) break;
    page++;
    if (delayMs) await sleep(delayMs);
  }

  const manifest = {
    source: "law.go.kr DRF target=acr (국민권익위원회 결정문)",
    totalCntReported: totalCnt,
    uniqueIds: seen.size,
    downloaded,
    skippedExisting: skipped,
    outputDir: out,
    textDir,
  };
  await writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return manifest;
}
