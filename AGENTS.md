# AGENTS.md — jeob-su

이 파일은 코딩 에이전트(Claude Code, Cursor, Codex 등)가 이 저장소에서 일할 때 참고하는 가이드입니다. Claude Code는 [CLAUDE.md](CLAUDE.md)를 통해 이 파일을 그대로 읽습니다. 사용자용 설명은 [README.md](README.md), 에이전트 워크플로 요약은 [`.cursor/skills/jeob-su/SKILL.md`](.cursor/skills/jeob-su/SKILL.md)를 우선합니다.

## 프로젝트 한 줄

국민권익위원회 결정문을 **법제처 Open API**로 내려받고, **Gemini 임베딩**(`gemini-embedding-001`)으로 색인한 뒤, 민원 텍스트와 **의미적으로 유사한** 의결례를 찾는 **MCP 서버** 중심 프로젝트입니다.

## 스택·구조

- **런타임**: Node.js **18+** 권장. **ESM** (`import` / `.mjs`). **외부 npm 의존성 없음** — `fetch`·`node:fs` 등 내장 API만 사용. `package.json`은 `npm test` 등 스크립트 단축용. 새 코드도 의존성 없이 작성할 것.
- 빌드/린트 단계 없음. 스크립트를 `node`로 직접 실행.
- **환경 변수**: [`scripts/lib/load-env.mjs`](scripts/lib/load-env.mjs)가 `process.cwd()`와 저장소 루트의 `.env`를 읽는다. 키는 **로그·채팅·커밋에 넣지 말 것**. [`.env.example`](.env.example) 참고.
  - `LAW_OC` 또는 `KOREAN_LAW_API_KEY` → 다운로드 도구
  - `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` → 색인·검색 도구
  - `MCP_ACCESS_TOKEN` → HTTP 접근 토큰
  - `MCP_ENABLE_MUTATING_TOOLS` → HTTP에 쓰기 도구 노출 (기본 off)
  - `MCP_RATE_LIMIT` → HTTP IP당 분당 상한 (기본 60)
- **데이터**
  - `data/acr-decisions/text/*.json` — 법제처 `AcrService.의결서` 형식 원문
  - `data/acr-decisions/semantic/index.json` — 임베딩 + 메타데이터
  - `data/acr-decisions/semantic/manifest.json` — 색인 메타만

## 자주 쓰는 명령

```bash
# 스모크 테스트 (API 키 불필요; CI smoke.yml에서도 실행)
npm test                                # 아래 3종 일괄 실행
node scripts/smoke-acr-mcp.mjs          # stdio MCP 핸셰이크·tools/list·health_check
node scripts/smoke-acr-mcp-http.mjs     # HTTP MCP + 토큰 인증·mutating 게이트 검증
node scripts/smoke-acr-semantic.mjs     # 구조 검증 (Gemini 키 있으면 임시 디렉터리에 live 빌드·검색)

# 데이터 준비 (없는 것만 생성; --force-download / --force-rebuild 로 강제)
node scripts/setup-acr-semantic.mjs
node scripts/setup-acr-semantic.mjs --max-pages 2 --build-limit 5   # 소량 검증

# 개별 단계
node scripts/download-acr-decisions.mjs --max-pages 2
node scripts/build-acr-semantic-index.mjs --limit 5
node scripts/query-acr-semantic.mjs --format md --top 10 -- "민원 텍스트"
node scripts/compact-acr-index.mjs      # 구버전 색인(숫자 배열) → base64 Float32, API 불필요

# 서버 실행
node scripts/acr-mcp-stdio-server.mjs   # stdio MCP (Cursor 등)
node scripts/acr-mcp-http-server.mjs    # HTTP MCP, 기본 :3000/mcp (Claude.ai 커넥터용)
```

## 아키텍처

두 개의 MCP 서버(stdio·HTTP)가 **동일한 도구 로직을 공유**하는 구조:

```
acr-mcp-stdio-server.mjs ─┐
                          ├→ lib/acr-mcp-tools.mjs   # JSON-RPC 디스패치 + 도구 7종 정의
acr-mcp-http-server.mjs ──┘        │
                                   ├→ lib/acr-setup.mjs            # ensure_semantic_corpus
                                   ├→ lib/acr-download.mjs         # download_acr_decisions (법제처 API)
                                   ├→ lib/acr-index-build.mjs      # build_semantic_index
                                   ├→ lib/acr-semantic-search.mjs  # 인덱스 로드·코사인 검색
                                   └→ lib/gemini-embed.mjs         # embedContent 호출·정규화·내적·b64 인코딩
```

- CLI 스크립트(`setup-*`, `download-*`, `build-*`, `query-*`)는 같은 `lib/` 코어를 감싼 개발·점검용 래퍼. 도구 동작을 바꾸려면 `lib/`를 수정해야 stdio·HTTP·CLI 모두에 반영된다.
- MCP 도구 추가·수정은 `lib/acr-mcp-tools.mjs` 한 곳에서. 서버 파일 두 개는 전송 계층(stdio 라인 처리 / HTTP CORS·인증·레이트 리밋·라우팅)만 담당.
- 데이터 흐름: 법제처 API → `data/acr-decisions/text/*.json` → 임베딩(RETRIEVAL_DOCUMENT) → `data/acr-decisions/semantic/index.json`(+`manifest.json`). 검색 시 질의는 RETRIEVAL_QUERY로 임베딩 후 정규화 벡터 내적으로 Top-K.
- 색인 임베딩은 base64 Float32(`embedding_b64`)로 저장. 로더(`acr-semantic-search.mjs`)는 구버전 숫자 배열도 읽는다.
- HTTP 서버는 기본 읽기 전용 4종만 노출(stdio는 7종 전부). 쓰기 도구는 `MCP_ENABLE_MUTATING_TOOLS=1` + 상한 인수(`max_pages`/`limit`/`build_limit`) 필수. 경로 인수(`index_path`, `out_dir` 등)는 저장소 루트 안으로 제한됨.
- 배포: `main` push → GitHub Actions(`.github/workflows/fly-deploy.yml`) → `flyctl deploy --remote-only` → Fly.io. `Dockerfile`은 HTTP 서버 + `data/` 포함.

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

## 코드 수정 시 주의사항

- **범위**: 요청과 무관한 대규모 리팩터·`data/` 대량 수정은 피한다 (`data/acr-decisions/text/`는 대용량).
- 빌드는 문서 수만큼 **Gemini API를 반복 호출**한다. 사용자 동의 없이 전체 재빌드를 돌리지 말고, `--limit`/`build_limit`·`--max-pages`/`max_pages`로 소량 검증을 먼저 제안한다.
- 인덱스를 `dimensions`로 빌드했다면 **검색에도 동일 `dimensions`**가 필요하다.
- 색인 임베딩은 **base64 Float32(`embedding_b64`)**로 저장된다. 구버전(숫자 배열)도 로더가 읽는다. 변환: `node scripts/compact-acr-index.mjs`.
- **HTTP MCP 서버는 기본 읽기 전용 4종**만 노출한다(`MCP_ENABLE_MUTATING_TOOLS=1`로 전체 노출, 이때도 상한 인수 필수). stdio는 항상 7종.
- 사용자 민원·결정문 발췌가 Google API로 전송되므로, 관련 기능·문서 작성 시 이 사실을 안내하는 문구를 유지할 것. **이 도구는 법률 자문이 아니다.**
