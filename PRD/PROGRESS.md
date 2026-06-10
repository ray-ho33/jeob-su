## 골 검토 요약 (Step 8 자동 생성)

- 목표: 기존 stdio MCP를 보존하면서 Claude.ai 웹 커스텀 커넥터용 HTTP MCP 서버와 검증·문서를 추가한다.
- 마일스톤: MCP 도구 로직 공통화 / 로컬 HTTP MCP 서버 추가 / HTTP 스모크 테스트와 회귀 검증 정리 / README에 Claude.ai 커넥터 방식 추가
- 필수 검증: node scripts/smoke-acr-mcp.mjs; node scripts/smoke-acr-mcp-http.mjs; node scripts/smoke-acr-semantic.mjs
- scope 잠금: 기존 stdio MCP 삭제 금지, data 대량 수정 금지, API 키 노출 금지, 전체 색인 재빌드 금지

---

# PROGRESS

## 현재 골

기존 stdio MCP를 보존하면서 Claude.ai 웹 커스텀 커넥터에서 사용할 수 있는 HTTP MCP 서버와 검증·문서 흐름을 추가한다.

## 현재 마일스톤

모든 마일스톤 완료

## 완료

- 마일스톤 1: MCP 도구 로직 공통화
  - `scripts/lib/acr-mcp-tools.mjs` 추가
  - `scripts/acr-mcp-stdio-server.mjs`가 공통 JSON-RPC 처리 로직을 사용하도록 변경
- 마일스톤 2: 로컬 HTTP MCP 서버 추가
  - `scripts/acr-mcp-http-server.mjs` 추가
  - `GET /health`, `POST /mcp` 처리 추가
- 마일스톤 3: HTTP 스모크 테스트와 회귀 검증 정리
  - `scripts/smoke-acr-mcp-http.mjs` 추가
  - 기존 stdio 스모크와 HTTP 스모크 모두 통과
- 마일스톤 4: README에 Claude.ai 커넥터 방식 추가
  - stdio MCP와 HTTP MCP 차이 설명
  - Claude.ai 커넥터 URL 예시와 보안 주의 추가

## 마지막 검증 결과

```text
node scripts/smoke-acr-mcp.mjs
smoke-acr-mcp OK (protocol=2024-11-05, tools=4)

node scripts/smoke-acr-mcp-http.mjs
smoke-acr-mcp-http OK (protocol=2024-11-05, tools=4, liveSearch=false)

node scripts/smoke-acr-mcp-http.mjs --live-search
smoke-acr-mcp-http OK (protocol=2024-11-05, tools=4, liveSearch=true)

node scripts/smoke-acr-semantic.mjs
structural OK: 638 json files, sample 1019.json fields=제목,민원표시,결정요지,주문
live API smoke SKIP (set GEMINI_API_KEY or GOOGLE_API_KEY to run build+query)
```

## 실패 시도

| 시도 | 변경 | 결과 | 배운 점 |
| --- | --- | --- | --- |

## 현재 가장 안정적인 상태

stdio MCP, HTTP MCP, HTTP MCP live search, semantic 구조 스모크 통과 상태

## 다음 단계

배포 플랫폼을 정한 뒤 공개 HTTPS URL로 배포하고 Claude.ai 커넥터에 URL 등록

## 2026-06-11 로컬 초안 워크플로우 MVP

- `scripts/lib/acr-draft-workflow.mjs`: 기존 MCP 공통 도구 호출을 재사용해 민원 본문 -> 유사 의결례 -> detail/citation pack -> evidence JSON -> Markdown 초안 흐름을 만든다.
- `scripts/generate-acr-draft.mjs`: `--format md --top N -- "민원 본문"` 또는 stdin 입력을 받아 `drafts/sessions/<sessionId>/`에 `evidence.json`, `draft.md`, `session.json`을 저장한다.
- `scripts/smoke-acr-draft-workflow.mjs`: Gemini 키 없이 mock 검색 결과와 로컬 JSON으로 파일 구조, 면책 문구, `officialLookupStatus=verified/local_source`를 검증한다.
- `drafts/sessions/`는 로컬 산출물이므로 `.gitignore`에 추가했다.

## 리스크 / 블로커

- 배포 플랫폼을 Fly.io, Render, Railway 중 어디로 할지 미정
- 공개 서버 접근을 완전 공개로 둘지, 간단한 토큰 보호를 둘지 미정
- 배포 서버에 `data/` 전체를 포함할지, 필요한 색인과 JSON만 포함할지 미정
- 요청량 제한을 둘지 미정

## 인수인계 메모

이 PROGRESS.md는 골잡이가 생성했다. 골 실행 중 매 체크포인트마다 갱신된다.

## 골 시작 기록

- 시작 시각: 2026-05-27T14:12:44Z
- 사용 CLI: codex
- 컴팩트 후 본문 길이: 679자
