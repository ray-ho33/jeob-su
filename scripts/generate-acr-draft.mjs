#!/usr/bin/env node
/**
 * 로컬 권익위 의결서 초안 MVP CLI.
 *
 *   node scripts/generate-acr-draft.mjs --format md --top 5 -- "민원 본문"
 *   echo "민원 본문" | node scripts/generate-acr-draft.mjs --format md
 */

import { generateAcrDraftSession } from "./lib/acr-draft-workflow.mjs";

function parseArgs(argv) {
  const out = {
    format: "md",
    top: 5,
    rest: [],
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format" && argv[i + 1]) out.format = argv[++i];
    else if (arg === "--top" && argv[i + 1])
      out.top = Math.max(1, parseInt(argv[++i], 10) || 5);
    else if (arg === "--") {
      const tail = argv.slice(i + 1).join(" ").trim();
      if (tail) out.rest.push(tail);
      break;
    } else if (!arg.startsWith("-")) out.rest.push(arg);
  }

  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const args = parseArgs(process.argv);
  let complaintText = args.rest.join(" ").trim();
  if (!complaintText) complaintText = await readStdin();

  const result = await generateAcrDraftSession({
    complaintText,
    top: args.top,
    format: args.format,
  });

  process.stdout.write(
    [
      "ACR draft session created",
      `sessionId: ${result.session.sessionId}`,
      `draft: ${result.session.files.draft}`,
      `evidence: ${result.session.files.evidence}`,
      `session: ${result.session.files.session}`,
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(error?.code === "ACR_DRAFT_NOT_READY" ? 2 : 1);
});

