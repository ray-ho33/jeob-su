# PLAN — jeob-su HTTP MCP 전환

## 목표

기존 stdio MCP를 보존하면서 Claude.ai 웹 커스텀 커넥터에서 사용할 수 있는 HTTP MCP 서버와 검증·문서 흐름을 추가한다.

## 참조 문서

- PRD 문서: PRD/01_PRD.md
- 데이터 구조: PRD/02_DATA_MODEL.md
- Phase 계획: PRD/03_PHASES.md
- 구현 규칙: PRD/04_PROJECT_SPEC.md
- VALIDATION.md
- RECOVERY.md

## 마일스톤 1: MCP 도구 로직 공통화

- 범위(Scope): 기존 `scripts/acr-mcp-stdio-server.mjs`의 도구 정의와 실행 로직을 `scripts/lib/acr-mcp-tools.mjs`로 분리하고, stdio 서버가 그 모듈을 사용하게 한다.
- 완료 조건: 기존 stdio MCP 스모크가 통과하고 기존 4개 도구 이름이 유지된다.
- 검증: `node scripts/smoke-acr-mcp.mjs`

## 마일스톤 2: 로컬 HTTP MCP 서버 추가

- 범위(Scope): `scripts/acr-mcp-http-server.mjs`를 추가하고 `GET /health`, `POST /mcp`의 `initialize`, `tools/list`, `tools/call`을 처리한다.
- 완료 조건: 로컬에서 HTTP 서버가 실행되고 HTTP 스모크가 `health_check`까지 성공한다.
- 검증: `node scripts/smoke-acr-mcp-http.mjs`

## 마일스톤 3: HTTP 스모크 테스트와 회귀 검증 정리

- 범위(Scope): `scripts/smoke-acr-mcp-http.mjs`를 추가하고 기존 stdio 스모크와 함께 실행 가능한 검증 흐름을 만든다.
- 완료 조건: stdio 스모크와 HTTP 스모크가 모두 통과한다.
- 검증: `node scripts/smoke-acr-mcp.mjs`, `node scripts/smoke-acr-mcp-http.mjs`

## 마일스톤 4: README에 Claude.ai 커넥터 방식 추가

- 범위(Scope): README에 stdio MCP와 HTTP MCP 차이, Claude.ai 커넥터 URL 예시, 환경변수, 보안 주의, 확인 명령을 추가한다.
- 완료 조건: 초보자가 로컬 실행 방식과 Claude.ai 커넥터 방식을 구분할 수 있고, 민감정보 주의가 명확히 적혀 있다.
- 검증: README 수동 검토, `node scripts/smoke-acr-mcp.mjs`, `node scripts/smoke-acr-mcp-http.mjs`

## 최종 완료 기준

- [ ] 모든 마일스톤 완료
- [ ] VALIDATION.md의 모든 검증 통과
- [ ] scope 위반 없음
- [ ] PROGRESS.md 업데이트

