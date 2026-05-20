# AGENTS.md — jeob-su

이 파일은 **코딩 에이전트**(Cursor 등)가 이 저장소에서 일할 때 참고하는 짧은 가이드입니다. 사용자용 설명은 [README.md](README.md), 에이전트 워크플로 요약은 [`.cursor/skills/jeob-su/SKILL.md`](.cursor/skills/jeob-su/SKILL.md)를 우선합니다.

## 프로젝트 한 줄

국민권익위원회 결정문을 **법제처 Open API**로 내려받고, **Gemini 임베딩**으로 색인한 뒤, 민원 텍스트와 **의미적으로 유사한** 의결례를 찾는 Node 스크립트 모음이다.

## 스택·구조

- **런타임**: Node.js **18+** 권장. **ESM** (`import` / `.mjs`). **`package.json` 없음** — 외부 npm 의존성 없이 `fetch`·`node:fs` 등만 사용.
- **환경 변수**: [`scripts/lib/load-env.mjs`](scripts/lib/load-env.mjs)가 `process.cwd()`와 저장소 루트의 `.env`를 읽는다. 키는 **로그·채팅·커밋에 넣지 말 것**. [`.env.example`](.env.example) 참고.
  - `LAW_OC` 또는 `KOREAN_LAW_API_KEY` → 다운로드
  - `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` → 임베딩 빌드·쿼리
- **데이터**
  - `data/acr-decisions/text/*.json` — 법제처 `AcrService.의결서` 형식 원문 (대량·민감할 수 있음).
  - `data/acr-decisions/semantic/index.json` — 임베딩 + 메타데이터 (빌드 산출물).
  - `data/acr-decisions/semantic/manifest.json` — 색인 메타만.

## 자주 쓰는 명령 (저장소 루트에서)

```bash
node scripts/setup-acr-semantic.mjs
node scripts/download-acr-decisions.mjs
node scripts/build-acr-semantic-index.mjs
node scripts/build-acr-semantic-index.mjs --limit 5
node scripts/query-acr-semantic.mjs --format md --top 10 -- "민원 또는 사실관계"
node scripts/smoke-acr-semantic.mjs
node scripts/smoke-acr-mcp.mjs
# MCP 연동 실행(클라이언트에서 stdio로 구동 시 직접 호출 거의 안 함)
# node scripts/acr-mcp-stdio-server.mjs
```

- `@jeob-su` 스킬 사용 시: [`.cursor/skills/jeob-su/SKILL.md`](.cursor/skills/jeob-su/SKILL.md)에 따라 **먼저** `setup-acr-semantic.mjs`로 자료·색인을 맞춘 뒤 쿼리한다.
- 빌드는 문서 수만큼 **Gemini API를 반복 호출**한다. 사용자 동의 없이 전체 재빌드를 돌리지 말고, 필요 시 `--limit`·`--delay-ms`를 제안한다.
- 인덱스를 `--dimensions`로 빌드했다면 **쿼리에도 동일 `--dimensions`**가 필요하다.

## 에이전트 동작 가이드 (유사 사례 질문)

1. `@jeob-su` / `@korean-acr-semantic` 맥락이면 **먼저** `node scripts/setup-acr-semantic.mjs` (키 없으면 `.env` 안내만 하고 중단).
2. `query-acr-semantic.mjs`로 Top-K를 얻는다.
3. 결과의 **파일 경로**로 `data/acr-decisions/text/*.json`을 읽고, **민원표시·주문·결정요지** 등을 인용해 유사성을 설명한다.
4. **민원 본문·결정문 발췌는 Google로 전송**될 수 있음을 사용자에게 상기할 것.

## 코드 수정 시

- 스크립트 공통: [`scripts/lib/gemini-embed.mjs`](scripts/lib/gemini-embed.mjs), [`scripts/lib/load-env.mjs`](scripts/lib/load-env.mjs), [`scripts/lib/acr-semantic-search.mjs`](scripts/lib/acr-semantic-search.mjs)(검색 코어/MCP 재사용).
- **범위**: 요청과 무관한 대규모 리팩터·`data/` 대량 수정은 피한다.
- **법적 표현**: 이 도구는 법률 자문이 아니다. 출력 문구에서 과도한 단정을 피한다.

## 관련 파일

| 경로 | 용도 |
|------|------|
| `scripts/setup-acr-semantic.mjs` | 다운로드+색인 자동 보정 |
| `scripts/download-acr-decisions.mjs` | 코퍼스 다운로드 |
| `scripts/build-acr-semantic-index.mjs` | 시맨틱 인덱스 생성 |
| `scripts/query-acr-semantic.mjs` | 유사도 검색 |
| `scripts/acr-mcp-stdio-server.mjs` | MCP stdio 도구(health/search/detail/citation_pack) |
| `scripts/smoke-acr-mcp.mjs` | MCP initialize/tools/health 무키 스모크 |
| `scripts/smoke-acr-semantic.mjs` | 구조 검증 + 선택적 API 스모크 |
| `scripts/lib/acr-semantic-search.mjs` | 시맨틱 검색 로직 분리(shared) |
| `.cursor/skills/jeob-su/SKILL.md` | `@jeob-su` 스킬 본문 |
| `.cursor/skills/korean-acr-semantic/SKILL.md` | 별칭 스킬 → jeob-su 참조 |
