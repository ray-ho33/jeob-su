/**
 * 프로젝트 루트·cwd 기준 `.env` 로드 (의존성 없음).
 * 이미 설정된 process.env 키는 덮어쓰지 않는다.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function repoRootFromThisFile() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, "..", "..");
}

function applyDotEnv(content) {
  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** cwd와 저장소 루트의 `.env`를 한 번만 읽는다. */
export function loadProjectEnv() {
  if (loaded) return;
  loaded = true;
  const roots = new Set([
    path.resolve(process.cwd(), ".env"),
    path.resolve(repoRootFromThisFile(), ".env"),
  ]);
  for (const p of roots) {
    if (!existsSync(p)) continue;
    try {
      applyDotEnv(readFileSync(p, "utf8"));
    } catch {
      /* ignore unreadable .env */
    }
  }
}
