# VALIDATION — jeob-su HTTP MCP 전환

## 필수 검증

골 완료로 마크하기 전 다음 명령을 반드시 실행한다.

```bash
node scripts/smoke-acr-mcp.mjs
node scripts/smoke-acr-mcp-http.mjs
node scripts/smoke-acr-semantic.mjs
```

## 마일스톤별 검증

각 마일스톤 종료 시 실행한다.

```bash
node scripts/smoke-acr-mcp.mjs
node scripts/smoke-acr-mcp-http.mjs
```

## 수동 확인 절차

1. `scripts/acr-mcp-stdio-server.mjs`가 기존처럼 stdio MCP로 동작하는지 확인한다.
2. `scripts/acr-mcp-http-server.mjs`를 실행해 `/health`가 JSON 상태를 반환하는지 확인한다.
3. HTTP MCP 스모크에서 `initialize`, `tools/list`, `tools/call health_check`가 성공하는지 확인한다.
4. README에서 stdio 방식과 HTTP 커넥터 방식이 초보자도 구분 가능하게 설명됐는지 읽어 확인한다.
5. API 키, 토큰, 민원 원문 같은 민감정보가 로그·문서·예시에 노출되지 않았는지 확인한다.

## 완료 기준 매핑

| PRD 완료 기준 | 검증 방식 | 상태 |
| --- | --- | --- |
| `GET /health`가 서버 상태와 색인 존재 여부를 반환한다. | `node scripts/smoke-acr-mcp-http.mjs` | 완료 |
| `POST /mcp`로 MCP `initialize` 요청이 성공한다. | `node scripts/smoke-acr-mcp-http.mjs` | 완료 |
| `tools/list`에서 기존 4개 도구가 보인다. | `node scripts/smoke-acr-mcp-http.mjs` | 완료 |
| `health_check`는 Gemini 키 없이도 실행된다. | `node scripts/smoke-acr-mcp-http.mjs` | 완료 |
| `search_similar_decisions`는 Gemini 키가 있을 때 정상 실행된다. | `node scripts/smoke-acr-mcp-http.mjs --live-search` | 완료 |
| Claude.ai 커스텀 커넥터에 배포 URL을 등록할 수 있다. | README의 HTTPS URL 안내와 Dockerfile 배포 시작점 확인 | 완료 |
| README에 stdio 방식과 HTTP 커넥터 방식이 구분되어 설명된다. | README 수동 검토 | 완료 |

## 완료로 보지 않는 조건

- 필수 검증 중 하나라도 실패
- PLAN.md 밖의 scope로 변경됨
- 명시적 승인 없이 public API가 변경됨
- 수동 재현이 여전히 실패함
- 산출물이 생성됐지만 검토되지 않음
- 검증을 통과시키기 위해 테스트가 삭제·skip됨
- 진단 없이 에러가 침묵 처리됨
- 기존 stdio MCP가 깨졌는데 HTTP MCP만 동작함
- API 키가 URL, 로그, README 예시에 실제 값처럼 노출됨
- `data/` 대량 파일이 사용자 동의 없이 변경됨
