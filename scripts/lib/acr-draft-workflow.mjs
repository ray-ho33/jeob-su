import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import { handleToolsCall, ROOT } from "./acr-mcp-tools.mjs";

const DEFAULT_DRAFT_ROOT = path.join(ROOT, "drafts", "sessions");

function parseToolPayload(result) {
  if (result?.isError) {
    const text = result?.content?.[0]?.text || "MCP 도구 호출 실패";
    throw new Error(String(text).trim());
  }
  const text = result?.content?.[0]?.text;
  if (!text) throw new Error("MCP 도구 응답 본문이 비었습니다.");
  return JSON.parse(text);
}

async function callMcpTool(name, args = {}) {
  return parseToolPayload(
    await handleToolsCall({
      name,
      arguments: args,
    }),
  );
}

function makeSessionId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `draft-${stamp}-${randomUUID().slice(0, 8)}`;
}

function normalizeTop(top) {
  return Math.min(50, Math.max(1, parseInt(String(top ?? "5"), 10) || 5));
}

function setupGuide(health) {
  const lines = [
    "초안 생성을 시작할 수 없습니다.",
    "",
    "확인할 것:",
    `- Gemini 키 설정: ${health?.geminiConfigured ? "OK" : "없음"}`,
    `- 시맨틱 인덱스: ${health?.indexPresent ? "OK" : "없음"}`,
    "",
    "준비 방법:",
    "- .env에 GEMINI_API_KEY 또는 GOOGLE_API_KEY를 넣으세요.",
    "- 데이터와 색인이 없다면 `node scripts/setup-acr-semantic.mjs --max-pages 2 --build-limit 5`처럼 소량으로 먼저 확인하세요.",
    "- 이미 JSON이 있고 색인만 없으면 `node scripts/build-acr-semantic-index.mjs --limit 5`로 구조를 확인한 뒤 전체 빌드를 검토하세요.",
    "",
    "주의: 색인/검색 과정에서 민원 본문이 Gemini API로 전송될 수 있습니다.",
  ];
  return lines.join("\n");
}

async function assertReadyForLiveSearch() {
  const health = await callMcpTool("health_check");
  if (!health.geminiConfigured || !health.indexPresent) {
    const error = new Error(setupGuide(health));
    error.code = "ACR_DRAFT_NOT_READY";
    error.health = health;
    throw error;
  }
  return health;
}

function decisionIdFromHit(hit) {
  if (hit?.id) return String(hit.id);
  if (hit?.file) return path.basename(String(hit.file), ".json");
  throw new Error("검색 결과에서 decision id를 찾을 수 없습니다.");
}

function localOfficialLookupBoundary({ hit, detail, citation }) {
  const hasDetailHeader = detail?.header && Object.keys(detail.header).length > 0;
  const hasCitation = Boolean(citation?.id && citation?.file);
  return {
    adapter: "local-acr-json",
    officialLookupStatus:
      hasDetailHeader && hasCitation ? "verified/local_source" : "needs_review/local_source",
    decisionId: citation?.id ?? detail?.id ?? decisionIdFromHit(hit),
    sourceFile: citation?.file ?? detail?.file ?? hit?.file ?? null,
    checkedFields: {
      detailHeader: hasDetailHeader,
      citationPack: hasCitation,
      decisionKey: Boolean(citation?.decision_key),
      decisionDate: Boolean(citation?.decision_date_display),
    },
    nextAdapterBoundary: "connectOfficialLookupAdapter({ complaintText, decisions })",
  };
}

export async function connectOfficialLookupAdapter({ complaintText: _complaintText, decisions }) {
  return decisions.map((decision) =>
    localOfficialLookupBoundary({
      hit: decision.hit,
      detail: decision.detail,
      citation: decision.citation,
    }),
  );
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function markdownEscapeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function renderDraftMarkdown({ session, evidence }) {
  const lines = [];
  lines.push(`# 권익위 의결서 초안 초벌`);
  lines.push("");
  lines.push(`- 세션: \`${session.sessionId}\``);
  lines.push(`- 생성시각: ${session.createdAt}`);
  lines.push(`- 상태: 사람 검토 필요`);
  lines.push("");
  lines.push("> 이 문서는 의결서 초안 작성을 돕기 위한 참고용 초벌입니다. 법률 자문이나 최종 법적 판단이 아닙니다. 제출·결재 전 담당자가 원문, 공식 자료, 개인정보 포함 여부를 반드시 확인해야 합니다.");
  lines.push("");
  lines.push("## 개인정보 주의");
  lines.push("");
  lines.push("- 민원 본문과 결정문 발췌는 검색 과정에서 Google Gemini API로 전송될 수 있습니다.");
  lines.push("- 주민등록번호, 전화번호, 주소, 계좌번호 등 개인정보가 있으면 제출 전 마스킹하거나 삭제하세요.");
  lines.push("");
  lines.push("## 민원 요지");
  lines.push("");
  lines.push(markdownEscapeText(evidence.complaintText));
  lines.push("");
  lines.push("## 주문 초안");
  lines.push("");
  lines.push("1. 아래 유사 의결례와 원문 확인 결과를 참고하여 신청 취지, 피신청인, 처분 또는 부작위의 내용, 구제 필요성을 담당자가 확정한다.");
  lines.push("2. 확인되지 않은 법령·사실·사건번호는 본 초벌에 확정 표현으로 사용하지 않는다.");
  lines.push("");
  lines.push("## 이유 초안");
  lines.push("");
  lines.push("### 1. 사안의 개요");
  lines.push("");
  lines.push("민원인은 위 민원 요지와 같은 사정에 관하여 권익위 의결례와 유사한 판단 기준의 검토를 요청한 것으로 보인다. 다만 현재 초벌은 입력 본문만 기준으로 하므로, 신청인·피신청인·처분일·불복 경위 등 기본 사실은 추가 확인이 필요하다.");
  lines.push("");
  lines.push("### 2. 유사 의결례 검토");
  lines.push("");
  for (const [index, decision] of evidence.decisions.entries()) {
    const citation = decision.citation;
    const detail = decision.detail;
    const verification = decision.officialLookup;
    const title = firstNonEmpty(citation?.title, detail?.header?.제목, `로컬 결정문 ${decision.id}`);
    lines.push(`#### ${index + 1}. ${title}`);
    lines.push("");
    lines.push(`- 결정문 ID: \`${decision.id}\``);
    lines.push(`- 유사도 점수: ${typeof decision.hit?.score === "number" ? decision.hit.score.toFixed(4) : "확인 필요"}`);
    lines.push(`- 검증 상태: ${verification.officialLookupStatus}`);
    if (citation?.suggestedBrief) lines.push(`- 인용 후보: ${citation.suggestedBrief}`);
    if (citation?.registry_line) lines.push(`- 민원표시: ${citation.registry_line}`);
    if (citation?.disposition_excerpt) lines.push(`- 주문 발췌: ${citation.disposition_excerpt}`);
    if (citation?.gist_excerpt) lines.push(`- 결정요지 발췌: ${citation.gist_excerpt}`);
    lines.push("");
  }
  lines.push("### 3. 판단 구조 후보");
  lines.push("");
  lines.push("- 위 의결례와 현재 민원의 공통점: 민원 요지, 행정기관의 조치, 권리구제 필요성 측면에서 사람이 대조한다.");
  lines.push("- 차이점: 사실관계, 법령 적용 시점, 기관의 재량 범위, 이미 취해진 조치 여부를 별도로 확인한다.");
  lines.push("- 결론 후보: 유사 의결례의 주문을 그대로 복사하지 않고, 현재 사건의 확인된 사실에 맞춰 시정 권고·의견 표명·기각·각하 가능성을 검토한다.");
  lines.push("");
  lines.push("## 검증 리포트");
  lines.push("");
  lines.push("- 공식조회 어댑터: 현재는 외부 `korean-law-mcp`를 설치하지 않고 로컬 권익위 JSON 원문 확인을 검증 단계로 사용한다.");
  lines.push("- 향후 연결 경계: `connectOfficialLookupAdapter({ complaintText, decisions })`에서 공식 법령/결정문 조회 어댑터로 교체한다.");
  lines.push("- 모든 인용은 `evidence.json`의 `officialLookupStatus`와 원문 파일을 대조한 뒤 확정한다.");
  lines.push("- 본 초벌은 `needs_human_review` 상태이다.");
  lines.push("");
  return lines.join("\n");
}

async function collectEvidence({ complaintText, top, searchResult }) {
  const search =
    searchResult ??
    (await callMcpTool("search_similar_decisions", {
      query: complaintText,
      top,
    }));

  const hits = Array.isArray(search?.hits) ? search.hits.slice(0, top) : [];
  const decisions = [];
  for (const hit of hits) {
    const id = decisionIdFromHit(hit);
    const [detail, citation] = await Promise.all([
      callMcpTool("get_decision_detail", {
        decision_id: id,
        include_reason: false,
      }),
      callMcpTool("get_citation_pack", {
        decision_id: id,
        max_quote_chars: 1200,
      }),
    ]);
    decisions.push({ id, hit, detail, citation });
  }

  const officialLookups = await connectOfficialLookupAdapter({ decisions });
  for (const decision of decisions) {
    decision.officialLookup =
      officialLookups.find((item) => item.decisionId === decision.id) ??
      localOfficialLookupBoundary({
        hit: decision.hit,
        detail: decision.detail,
        citation: decision.citation,
      });
  }

  return {
    schemaVersion: 1,
    complaintText,
    search,
    decisions,
    warnings: [
      "이 결과는 법률 자문이 아니며, 최종 판단 전 원문과 공식 자료 대조가 필요합니다.",
      "민원 본문에 개인정보가 있다면 외부 API 전송 전 마스킹해야 합니다.",
    ],
  };
}

export async function generateAcrDraftSession({
  complaintText,
  top = 5,
  format = "md",
  draftRoot = DEFAULT_DRAFT_ROOT,
  searchResult = null,
  skipReadinessCheck = false,
} = {}) {
  const text = String(complaintText ?? "").trim();
  if (!text) throw new Error("민원 본문이 비었습니다. 인자 또는 stdin으로 입력하세요.");
  if (format !== "md") throw new Error("현재 MVP는 --format md만 지원합니다.");

  const topN = normalizeTop(top);
  const health = skipReadinessCheck ? await callMcpTool("health_check") : await assertReadyForLiveSearch();
  const session = {
    sessionId: makeSessionId(),
    createdAt: new Date().toISOString(),
    status: "needs_human_review",
    format,
    top: topN,
    files: {},
    health,
  };

  const evidence = await collectEvidence({
    complaintText: text,
    top: topN,
    searchResult,
  });

  const sessionDir = path.join(draftRoot, session.sessionId);
  await mkdir(sessionDir, { recursive: true });

  const evidencePath = path.join(sessionDir, "evidence.json");
  const draftPath = path.join(sessionDir, "draft.md");
  const sessionPath = path.join(sessionDir, "session.json");

  session.files = {
    evidence: path.relative(ROOT, evidencePath).split(path.sep).join("/"),
    draft: path.relative(ROOT, draftPath).split(path.sep).join("/"),
    session: path.relative(ROOT, sessionPath).split(path.sep).join("/"),
  };

  const draftMarkdown = renderDraftMarkdown({ session, evidence });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  await writeFile(draftPath, draftMarkdown, "utf8");
  await writeFile(sessionPath, JSON.stringify(session, null, 2) + "\n", "utf8");

  return {
    session,
    evidence,
    draftMarkdown,
    sessionDir,
  };
}
