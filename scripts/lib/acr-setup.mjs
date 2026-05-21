/**
 * 결정문 다운로드 + 시맨틱 색인 자동 보정 — MCP·CLI 공용
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { downloadAcrDecisions } from "./acr-download.mjs";
import { buildSemanticIndex } from "./acr-index-build.mjs";

/**
 * @param {string} textDir
 */
export async function countTextJson(textDir) {
  if (!existsSync(textDir)) return 0;
  const names = await readdir(textDir);
  return names.filter((n) => n.endsWith(".json")).length;
}

/**
 * @param {{
 *   rootDir: string,
 *   dataOutDir?: string,
 *   forceDownload?: boolean,
 *   forceRebuild?: boolean,
 *   skipDownload?: boolean,
 *   skipBuild?: boolean,
 *   maxPages?: number,
 *   buildLimit?: number,
 *   downloadDelayMs?: number,
 *   buildDelayMs?: number,
 *   dimensions?: number,
 *   model?: string,
 *   log?: (msg: string) => void,
 * }} opts
 */
export async function ensureSemanticCorpus(opts) {
  const root = path.resolve(opts.rootDir);
  const dataOut = path.resolve(
    opts.dataOutDir ?? path.join(root, "data", "acr-decisions"),
  );
  const textDir = path.join(dataOut, "text");
  const semanticDir = path.join(dataOut, "semantic");
  const indexPath = path.join(semanticDir, "index.json");
  const log = opts.log ?? (() => {});

  const nText = await countTextJson(textDir);
  const hasIndex = existsSync(indexPath);

  const needDownload =
    !opts.skipDownload && (opts.forceDownload || nText === 0);
  const needBuild =
    !opts.skipBuild && (opts.forceRebuild || !hasIndex);

  log(
    `[ensure_semantic_corpus] 결정문 JSON: ${nText}건, index.json: ${hasIndex ? "있음" : "없음"}`,
  );

  /** @type {object | null} */
  let downloadResult = null;
  /** @type {object | null} */
  let buildResult = null;

  if (needDownload) {
    log("[ensure_semantic_corpus] 다운로드 실행…");
    downloadResult = await downloadAcrDecisions({
      outDir: dataOut,
      maxPages: opts.maxPages,
      delayMs: opts.downloadDelayMs,
      force: opts.forceDownload,
      log,
    });
  } else {
    log(
      "[ensure_semantic_corpus] 다운로드 생략 (이미 JSON 있음 또는 skip_download)",
    );
  }

  if (needBuild) {
    log("[ensure_semantic_corpus] 시맨틱 색인 생성…");
    buildResult = await buildSemanticIndex({
      rootDir: root,
      textDir,
      outDir: semanticDir,
      limit: opts.buildLimit,
      delayMs: opts.buildDelayMs,
      dimensions: opts.dimensions,
      model: opts.model,
      log,
    });
  } else {
    log(
      "[ensure_semantic_corpus] 색인 생략 (index.json 있음 또는 skip_build)",
    );
  }

  const nTextAfter = await countTextJson(textDir);
  const hasIndexAfter = existsSync(indexPath);

  return {
    ok: hasIndexAfter || nTextAfter > 0,
    textJsonCount: nTextAfter,
    indexPresent: hasIndexAfter,
    indexPath: path.relative(root, indexPath).split(path.sep).join("/"),
    dataOutDir: path.relative(root, dataOut).split(path.sep).join("/"),
    ranDownload: needDownload,
    ranBuild: needBuild,
    download: downloadResult,
    build: buildResult
      ? {
          manifest: buildResult.manifest,
          indexPath: path
            .relative(root, buildResult.indexPath)
            .split(path.sep)
            .join("/"),
          itemCount: buildResult.itemCount,
        }
      : null,
  };
}
