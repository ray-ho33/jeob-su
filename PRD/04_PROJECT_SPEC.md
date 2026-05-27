# jeob-su HTTP MCP 전환 -- 프로젝트 스펙

> 이 문서는 AI 또는 개발자가 실제 구현할 때 지켜야 할 규칙입니다.

---

## 1. 구현 원칙

### 기존 구조를 우선 존중

- 기존 `scripts/acr-mcp-stdio-server.mjs`를 바로 갈아엎지 않습니다.
- 먼저 도구 정의와 도구 실행 함수를 공통 모듈로 분리합니다.
- stdio 서버와 HTTP 서버가 같은 도구 로직을 공유하게 만듭니다.

추천 구조:

```txt
scripts/
  acr-mcp-stdio-server.mjs
  acr-mcp-http-server.mjs
  smoke-acr-mcp-http.mjs
  lib/
    acr-mcp-tools.mjs
    acr-semantic-search.mjs
    gemini-embed.mjs
    load-env.mjs
```

### 초보자에게 설명 가능한 단순함 유지

- 처음부터 OAuth, DB, 관리자 화면을 붙이지 않습니다.
- HTTP 서버는 최소 기능부터 시작합니다.
- 복잡한 기능은 Phase 4로 미룹니다.

---

## 2. 기술 선택

### 1순위 추천: Node.js + 공식 MCP SDK

이 프로젝트는 이미 Node.js ESM 방식입니다.
HTTP MCP의 세부 규격을 직접 구현하면 실수할 부분이 많으므로, 가능하면 공식 MCP SDK 사용을 검토합니다.

장점:

- MCP Streamable HTTP 처리 실수를 줄일 수 있습니다.
- 앞으로 스펙 변경에 대응하기 쉽습니다.

단점:

- 현재 프로젝트에는 `package.json`이 없으므로 외부 의존성이 새로 생깁니다.

### 2순위 대안: Node.js 내장 `node:http`로 최소 구현

장점:

- 외부 의존성 없이 현재 프로젝트 철학을 유지합니다.

단점:

- Streamable HTTP의 세션, 헤더, SSE 처리 같은 부분을 직접 맞춰야 해서 실수 가능성이 큽니다.

### 추천 결정

Phase 1에서는 두 가지 중 하나를 결정해야 합니다.

- Claude.ai 연결 성공률을 우선하면 공식 MCP SDK 사용
- 의존성 없는 프로젝트 철학을 우선하면 내장 HTTP로 최소 구현

현재 목표가 Claude.ai 커넥터 연결이므로, 실무적으로는 공식 MCP SDK를 추천합니다.

---

## 3. 보안 규칙

- Gemini API 키를 URL에 넣지 않습니다.
- API 키, 토큰, 비밀번호를 로그에 출력하지 않습니다.
- `.env` 또는 배포 플랫폼 Secret을 사용합니다.
- 공개 서버라면 최소한 접근 토큰을 둡니다.
- 요청 본문 크기를 제한합니다.
- 민원 본문이 Gemini API로 전송될 수 있음을 README에 명시합니다.
- 법률 자문이 아니라 원문 확인용 도구라는 문구를 유지합니다.

---

## 4. 절대 하지 마

- 기존 stdio MCP를 삭제하지 마세요.
- `data/` 대량 파일을 이유 없이 수정하지 마세요.
- API 키를 README 예시에 실제 값처럼 쓰지 마세요.
- Gemini API 키를 `?geminiKey=` 같은 URL 파라미터로 받지 마세요.
- 전체 인덱스 재빌드를 사용자 동의 없이 실행하지 마세요.
- 법률 판단을 단정하는 문구를 추가하지 마세요.
- 배포 설정을 추가하면서 로컬 실행 흐름을 깨지 마세요.

---

## 5. 테스트 기준

### 로컬 테스트

```bash
node scripts/smoke-acr-mcp.mjs
```

기존 stdio MCP가 깨지지 않았는지 확인합니다.

```bash
node scripts/smoke-acr-mcp-http.mjs
```

새 HTTP MCP 서버가 initialize, tools/list, health_check를 처리하는지 확인합니다.

### 선택 테스트

```bash
node scripts/smoke-acr-semantic.mjs
```

색인 구조와 Gemini 키가 있는 경우 검색 흐름을 확인합니다.

---

## 6. README 업데이트 기준

README에는 MCP 설정을 두 섹션으로 나눕니다.

```txt
### MCP 서버(stdio) -- Cursor/Claude Desktop 로컬 실행용
### MCP 서버(HTTP) -- Claude.ai 커스텀 커넥터용
```

HTTP 섹션에는 아래 내용을 포함합니다.

- Claude.ai 커스텀 커넥터는 공개 HTTPS URL이 필요함
- 로컬 파일 경로 설정과 다름
- 커넥터 URL 예시
- 배포 플랫폼 예시
- 환경변수 목록
- 민감정보 주의
- 도구 활성화 방법

---

## 7. 구현 시작 프롬프트

```txt
PRD 문서를 읽고 Phase 1만 구현해주세요.

참고 문서:
- PRD/01_PRD.md
- PRD/02_DATA_MODEL.md
- PRD/03_PHASES.md
- PRD/04_PROJECT_SPEC.md

목표:
- 기존 stdio MCP는 유지
- 공통 도구 로직을 scripts/lib/acr-mcp-tools.mjs로 분리
- scripts/acr-mcp-http-server.mjs 추가
- scripts/smoke-acr-mcp-http.mjs 추가
- README는 아직 최소 변경만

주의:
- API 키를 출력하지 말 것
- data/ 대량 수정 금지
- 전체 색인 재빌드 금지
```

