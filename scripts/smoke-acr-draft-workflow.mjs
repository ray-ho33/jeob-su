#!/usr/bin/env node
/**
 * Gemini 키 없이도 초안 워크플로우의 파일 구조와 로컬 원문 검증 경계를 확인합니다.
 */

import path from "node:path";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { generateAcrDraftSession } from "./lib/acr-draft-workflow.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

async function pickSampleDecisionId() {
  const textDir = path.join(ROOT, "data", "acr-decisions", "text");
  const names = await readdir(textDir);
  const json = names.filter((name) => name.endsWith(".json")).sort();
  if (json.length === 0) throw new Error("샘플 결정문 JSON이 없습니다.");
  return path.basename(json[0], ".json");
}

async function main() {
  const draftRoot = await mkdtemp(path.join(tmpdir(), "jeob-su-draft-smoke-"));
  try {
    const sampleId = await pickSampleDecisionId();
    const result = await generateAcrDraftSession({
      complaintText: "도로 공사 이후 잔여지 진출입로 확보가 어렵다는 민원",
      top: 1,
      format: "md",
      draftRoot,
      skipReadinessCheck: true,
      searchResult: {
        hits: [
          {
            id: sampleId,
            file: `data/acr-decisions/text/${sampleId}.json`,
            score: 0.99,
            preview: "잔여지 진출입로 확보 등",
          },
        ],
      },
    });

    const [evidenceRaw, draftRaw, sessionRaw] = await Promise.all([
      readFile(path.join(result.sessionDir, "evidence.json"), "utf8"),
      readFile(path.join(result.sessionDir, "draft.md"), "utf8"),
      readFile(path.join(result.sessionDir, "session.json"), "utf8"),
    ]);
    const evidence = JSON.parse(evidenceRaw);
    const session = JSON.parse(sessionRaw);

    if (!draftRaw.includes("법률 자문이나 최종 법적 판단이 아닙니다")) {
      throw new Error("draft.md에 면책 문구가 없습니다.");
    }
    if (
      evidence.decisions?.[0]?.officialLookup?.officialLookupStatus !==
      "verified/local_source"
    ) {
      throw new Error("로컬 원문 검증 상태가 verified/local_source가 아닙니다.");
    }
    if (!session.files?.evidence || !session.files?.draft || !session.files?.session) {
      throw new Error("session.json 파일 경로 기록이 부족합니다.");
    }

    console.log(
      `smoke-acr-draft-workflow OK (session=${session.sessionId}, decisions=${evidence.decisions.length})`,
    );
  } finally {
    await rm(draftRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("smoke-acr-draft-workflow FAIL:", error);
  process.exit(1);
});
