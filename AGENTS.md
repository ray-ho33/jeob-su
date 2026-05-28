# AGENTS.md — jeob-su

이 파일은 **코딩 에이전트**(Cursor 등)가 이 저장소에서 일할 때 참고하는 짧은 가이드입니다. 사용자용 설명은 [README.md](README.md), 에이전트 워크플로 요약은 [`.cursor/skills/jeob-su/SKILL.md`](.cursor/skills/jeob-su/SKILL.md)를 우선합니다.

## 프로젝트 한 줄

국민권익위원회 결정문을 **법제처 Open API**로 내려받고, **Gemini 임베딩**으로 색인한 뒤, 민원 텍스트와 **의미적으로 유사한** 의결례를 찾는 **MCP(stdio) 서버** 중심 프로젝트입니다.

## 스택·구조

- **런타임**: Node.js **18+** 권장. **ESM** (`import` / `.mjs`). **`package.json` 없음** — 외부 npm 의존성 없이 `fetch`·`node:fs` 등만 사용.
- **진입점**: [`scripts/acr-mcp-stdio-server.mjs`](scripts/acr-mcp-stdio-server.mjs) — Cursor 등 MCP 클라이언트가 stdio로 구동.
- **환경 변수**: [`scripts/lib/load-env.mjs`](scripts/lib/load-env.mjs)가 `process.cwd()`와 저장소 루트의 `.env`를 읽는다. 키는 **로그·채팅·커밋에 넣지 말 것**. [`.env.example`](.env.example) 참고.
  - `LAW_OC` 또는 `KOREAN_LAW_API_KEY` → 다운로드 MCP 도구
  - `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` → 색인·검색 MCP 도구
- **데이터**
  - `data/acr-decisions/text/*.json` — 법제처 `AcrService.의결서` 형식 원문
  - `data/acr-decisions/semantic/index.json` — 임베딩 + 메타데이터
  - `data/acr-decisions/semantic/manifest.json` — 색인 메타만

## MCP 도구 (사용자·에이전트 공통)

| 도구 | 용도 |
|------|------|
| `health_check` | 색인·키 설정 상태 (API 호출 없음) |
| `ensure_semantic_corpus` | JSON·색인 없으면 자동 생성 |
| `download_acr_decisions` | 결정문 다운로드 |
| `build_semantic_index` | 시맨틱 색인 생성 |
| `search_similar_decisions` | 유사 의결례 검색 |
| `get_decision_detail` | 결정문 상세 발췌 |
| `get_citation_pack` | 인용용 메타 묶음 |

## 에이전트 워크플로 (유사 사례 질문)

1. `@jeob-su` / `@korean-acr-semantic` 맥락이면 **MCP** `health_check` 후 `ensure_semantic_corpus` (키 없으면 `.env` 안내만 하고 중단).
2. `search_similar_decisions`로 Top-K를 얻는다.
3. `get_decision_detail` 또는 `get_citation_pack`으로 **민원표시·주문·결정요지** 등을 인용해 유사성을 설명한다.
4. **민원 본문·결정문 발췌는 Google로 전송**될 수 있음을 사용자에게 상기할 것.
5. **터미널 CLI**(`query-acr-semantic.mjs` 등)는 개발·점검용이며, 사용자 요청 처리에는 **MCP 도구만** 사용한다.

## 점검 (개발용)

```bash
node scripts/smoke-acr-mcp.mjs
```

## 코드 수정 시

- 공유 로직: [`scripts/lib/acr-download.mjs`](scripts/lib/acr-download.mjs), [`scripts/lib/acr-index-build.mjs`](scripts/lib/acr-index-build.mjs), [`scripts/lib/acr-setup.mjs`](scripts/lib/acr-setup.mjs), [`scripts/lib/acr-semantic-search.mjs`](scripts/lib/acr-semantic-search.mjs), [`scripts/lib/gemini-embed.mjs`](scripts/lib/gemini-embed.mjs).
- **범위**: 요청과 무관한 대규모 리팩터·`data/` 대량 수정은 피한다.
- 빌드는 문서 수만큼 **Gemini API를 반복 호출**한다. 사용자 동의 없이 전체 재빌드를 돌리지 말고, MCP 인수 `build_limit`·`max_pages`를 제안한다.
- 인덱스를 `dimensions`로 빌드했다면 **검색에도 동일 `dimensions`**가 필요하다.
- **법적 표현**: 이 도구는 법률 자문이 아니다.

## 관련 파일

| 경로 | 용도 |
|------|------|
| `scripts/acr-mcp-stdio-server.mjs` | MCP stdio 서버 (7종 도구) |
| `scripts/lib/acr-setup.mjs` | `ensure_semantic_corpus` 코어 |
| `scripts/lib/acr-download.mjs` | `download_acr_decisions` 코어 |
| `scripts/lib/acr-index-build.mjs` | `build_semantic_index` 코어 |
| `scripts/smoke-acr-mcp.mjs` | MCP 스모크 |
| `.cursor/skills/jeob-su/SKILL.md` | `@jeob-su` 스킬 본문 |
