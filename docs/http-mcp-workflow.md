# HTTP MCP 전환 작업 과정

이 문서는 `jeob-su` 저장소에서 **stdio MCP를 HTTP MCP로 확장한 과정**을 초보자도 따라갈 수 있게 정리한 기록입니다.

## 1. 처음 문제

README에는 Cursor 같은 로컬 도구에서 쓰는 MCP 설정이 있었습니다.

```json
{
  "mcpServers": {
    "jeob-su-acr": {
      "command": "node",
      "args": ["/절대경로/jeob-su/scripts/acr-mcp-stdio-server.mjs"],
      "cwd": "/절대경로/jeob-su"
    }
  }
}
```

이 방식은 **stdio MCP**입니다.

stdio는 “standard input/output”의 줄임말입니다. 쉽게 말하면, Cursor가 내 컴퓨터에서 Node 스크립트를 직접 실행하고 그 프로그램과 터미널 입출력으로 대화하는 방식입니다.

사용자가 원한 방식은 Claude.ai 웹에서 URL 하나를 등록하는 방식이었습니다.

```txt
https://배포한주소.example/mcp
```

이 방식은 **HTTP MCP**입니다.

HTTP는 웹 브라우저가 서버와 대화할 때 쓰는 통신 방식입니다. Claude.ai 웹은 내 컴퓨터 파일을 직접 실행할 수 없기 때문에, 인터넷에서 접근 가능한 서버 URL이 필요합니다.

## 2. 목표

이번 작업의 목표는 기존 기능을 망가뜨리지 않고 아래를 추가하는 것이었습니다.

- 기존 `stdio MCP` 유지
- Claude.ai 커스텀 커넥터용 `HTTP MCP` 서버 추가
- 기존 MCP 도구 4개 재사용
- HTTP 서버 상태 확인용 `/health` 추가
- HTTP MCP 스모크 테스트 추가
- README에 초보자용 사용법 추가
- Docker 배포 시작점 추가

기존 MCP 도구 4개는 다음과 같습니다.

| 도구 | 역할 |
| --- | --- |
| `health_check` | 색인 파일과 키 설정 상태 확인 |
| `search_similar_decisions` | 민원 텍스트로 유사 의결례 검색 |
| `get_decision_detail` | 특정 의결례 상세 발췌 |
| `get_citation_pack` | 인용용 정보 묶음 생성 |

## 3. 먼저 PRD를 만들었습니다

바로 코드를 고치기 전에 `PRD/` 폴더에 계획 문서를 만들었습니다.

PRD는 “Product Requirements Document”의 줄임말입니다. 쉽게 말하면, 만들 기능의 목적과 완료 기준을 적은 기획서입니다.

생성된 주요 문서는 다음과 같습니다.

| 파일 | 역할 |
| --- | --- |
| `PRD/01_PRD.md` | 무엇을 만들지 정의 |
| `PRD/02_DATA_MODEL.md` | 서버가 다루는 데이터 구조 정리 |
| `PRD/03_PHASES.md` | 작업 단계를 나눔 |
| `PRD/04_PROJECT_SPEC.md` | 구현할 때 지킬 규칙 |
| `PRD/VALIDATION.md` | 완료로 인정할 검증 기준 |
| `PRD/PLAN.md` | 실제 구현 순서 |
| `PRD/PROGRESS.md` | 진행 상황 기록 |

이 단계에서 정한 핵심 원칙은 다음이었습니다.

- 기존 `stdio MCP`를 삭제하지 않는다.
- `data/` 대량 파일은 건드리지 않는다.
- API 키를 코드나 README에 직접 넣지 않는다.
- 전체 색인 재빌드는 사용자 승인 없이 하지 않는다.

## 4. 기존 코드를 먼저 분리했습니다

처음에는 `scripts/acr-mcp-stdio-server.mjs` 안에 MCP 도구 정의와 실행 로직이 모두 들어 있었습니다.

HTTP 서버도 같은 도구를 써야 하므로, 중복을 피하기 위해 공통 파일을 만들었습니다.

새 파일:

```txt
scripts/lib/acr-mcp-tools.mjs
```

이 파일로 옮긴 내용은 다음과 같습니다.

- 도구 목록 `TOOLS`
- `health_check` 실행 로직
- `search_similar_decisions` 실행 로직
- `get_decision_detail` 실행 로직
- `get_citation_pack` 실행 로직
- MCP JSON-RPC 요청 처리 함수

그다음 기존 stdio 서버는 공통 모듈을 불러서 쓰도록 줄였습니다.

```txt
scripts/acr-mcp-stdio-server.mjs
```

이렇게 한 이유는 간단합니다.

같은 기능을 두 곳에 복사해두면 나중에 하나만 고치고 다른 하나를 깜빡할 수 있습니다. 공통 모듈로 빼면 stdio 서버와 HTTP 서버가 같은 로직을 같이 쓰게 됩니다.

## 5. HTTP MCP 서버를 추가했습니다

새 파일:

```txt
scripts/acr-mcp-http-server.mjs
```

이 서버가 제공하는 주소는 두 개입니다.

| 주소 | 역할 |
| --- | --- |
| `GET /health` | 서버 상태 확인 |
| `POST /mcp` | MCP JSON-RPC 요청 처리 |

로컬 실행 명령:

```bash
node scripts/acr-mcp-http-server.mjs
```

이 명령은 기본적으로 아래 주소를 엽니다.

```txt
http://localhost:3000/mcp
http://localhost:3000/health
```

배포 환경에서는 포트를 지정할 수 있습니다.

```bash
PORT=3000 HOST=0.0.0.0 node scripts/acr-mcp-http-server.mjs
```

## 6. 보안 관련 설정도 추가했습니다

HTTP 서버는 인터넷에 공개될 수 있으므로 최소한의 보호 장치를 넣었습니다.

### 접근 토큰

환경변수 `MCP_ACCESS_TOKEN`을 설정하면 요청에 토큰이 있어야 접근할 수 있습니다.

URL 방식:

```txt
https://배포한주소.example/mcp?token=발급한토큰
```

헤더 방식:

```txt
Authorization: Bearer 발급한토큰
```

헤더 방식이 더 좋습니다. URL은 로그에 남을 수 있기 때문입니다.

### Origin 검사

Origin은 “이 요청이 어느 웹사이트에서 왔는지”를 알려주는 정보입니다.

기본으로 허용하는 Origin은 다음입니다.

```txt
https://claude.ai
https://www.claude.ai
localhost 계열
```

추가 허용 Origin은 환경변수로 넣을 수 있습니다.

```txt
MCP_ALLOWED_ORIGINS=https://your-domain.example
```

## 7. 테스트를 추가했습니다

새 파일:

```txt
scripts/smoke-acr-mcp-http.mjs
```

스모크 테스트는 “큰 테스트는 아니지만, 기본 동작이 살아 있는지 확인하는 빠른 검사”입니다.

기본 HTTP MCP 스모크:

```bash
node scripts/smoke-acr-mcp-http.mjs
```

이 테스트는 다음을 확인합니다.

- `/health`가 응답하는지
- `/mcp`에서 `initialize`가 성공하는지
- `tools/list`에 도구 4개가 보이는지
- `health_check` 도구가 실행되는지
- 허용되지 않은 Origin이 차단되는지

Gemini 검색까지 확인하는 테스트:

```bash
node scripts/smoke-acr-mcp-http.mjs --live-search
```

이 테스트는 `search_similar_decisions`를 실제로 한 번 호출합니다. Gemini API 사용량이 발생할 수 있습니다.

## 8. 기존 기능이 깨지지 않았는지 확인했습니다

새 HTTP 서버를 추가하면서 가장 중요한 것은 기존 stdio MCP가 깨지지 않는 것입니다.

확인한 명령은 다음입니다.

```bash
node scripts/smoke-acr-mcp.mjs
```

결과:

```txt
smoke-acr-mcp OK (protocol=2024-11-05, tools=4)
```

HTTP MCP도 확인했습니다.

```bash
node scripts/smoke-acr-mcp-http.mjs
```

결과:

```txt
smoke-acr-mcp-http OK (protocol=2024-11-05, tools=4, liveSearch=false)
```

Gemini 검색 경로도 확인했습니다.

```bash
node scripts/smoke-acr-mcp-http.mjs --live-search
```

결과:

```txt
smoke-acr-mcp-http OK (protocol=2024-11-05, tools=4, liveSearch=true)
```

시맨틱 데이터 구조도 확인했습니다.

```bash
node scripts/smoke-acr-semantic.mjs
```

결과:

```txt
structural OK: 638 json files, sample 1019.json fields=제목,민원표시,결정요지,주문
live API smoke SKIP (set GEMINI_API_KEY or GOOGLE_API_KEY to run build+query)
```

여기서 `live API smoke SKIP`은 실패가 아닙니다. 이 스크립트는 shell 환경변수 기준으로 Gemini 키를 확인하는데, 해당 조건이 맞지 않아 API 호출 부분만 건너뛴 것입니다. 대신 HTTP MCP의 `--live-search`로 실제 검색 경로를 확인했습니다.

## 9. 배포 준비 파일을 추가했습니다

HTTP MCP는 Claude.ai 웹에서 쓰려면 공개 HTTPS 주소가 필요합니다.

그래서 Docker 배포 시작점을 추가했습니다.

```txt
Dockerfile
.dockerignore
```

Dockerfile은 서버를 컨테이너로 실행하기 위한 설명서입니다.

배포 플랫폼이 Docker를 지원하면 이 파일을 바탕으로 실행할 수 있습니다.

주의할 점:

- 배포 환경에 `GEMINI_API_KEY`를 넣어야 검색이 됩니다.
- `data/acr-decisions/semantic/index.json`이 서버에 있어야 검색이 됩니다.
- `data/acr-decisions/text/*.json`이 있어야 상세 조회가 됩니다.
- 공개 서버로 운영하면 요청량과 비용을 관리해야 합니다.

## 10. README를 업데이트했습니다

README에는 MCP 설명을 두 부분으로 나눴습니다.

```txt
MCP 서버(stdio)
MCP 서버(HTTP)
```

이렇게 나눈 이유는 사용자가 헷갈리지 않게 하기 위해서입니다.

- Cursor 같은 로컬 도구는 stdio 방식
- Claude.ai 웹 커넥터는 HTTP 방식

README에 추가한 내용은 다음입니다.

- HTTP MCP 실행 방법
- `/mcp`, `/health` 주소
- HTTP MCP 스모크 테스트
- Claude.ai 커넥터 URL 예시
- 접근 토큰 사용법
- API 키를 URL에 넣지 말라는 주의
- Docker 배포 시작점

## 11. Git으로 저장하고 GitHub에 올렸습니다

작업이 끝난 뒤 Git 커밋을 만들었습니다.

커밋:

```txt
2091316 HTTP MCP 서버 추가
```

그다음 GitHub에 푸시했습니다.

브랜치:

```txt
feat/acr-mcp-server
```

마지막으로 PR도 만들었습니다.

```txt
https://github.com/ray-ho33/jeob-su/pull/3
```

PR은 “이 변경을 main에 반영해도 될까요?” 하고 보내는 검토 요청입니다.

## 12. 전체 흐름 요약

이번 작업 흐름은 이렇게 진행됐습니다.

```txt
문제 확인
→ PRD 작성
→ 완료 기준 정리
→ 기존 stdio MCP 코드 분석
→ 공통 MCP 도구 모듈 분리
→ stdio MCP가 공통 모듈을 쓰게 변경
→ HTTP MCP 서버 추가
→ HTTP 스모크 테스트 추가
→ live search 검증 추가
→ Docker/.env 예시 추가
→ README 업데이트
→ 검증 명령 실행
→ Git 커밋
→ GitHub 푸시
→ PR 생성
```

## 13. 초보자가 기억하면 좋은 점

### 먼저 계획을 세운다

큰 변경은 바로 코드를 고치기보다 PRD나 PLAN으로 목표를 정리하면 덜 헷갈립니다.

### 기존 기능을 먼저 지킨다

새 기능을 만들 때는 기존 기능이 깨지지 않았는지 확인해야 합니다.

이번에는 `stdio MCP`가 계속 통과하는지 확인했습니다.

### 중복 코드는 공통 모듈로 뺀다

stdio 서버와 HTTP 서버가 같은 도구를 써야 했기 때문에 `acr-mcp-tools.mjs`로 공통화했습니다.

### 테스트는 작은 것부터 한다

처음부터 전체 배포를 확인하지 않고, 로컬에서 `/health`, `tools/list`, `health_check`부터 확인했습니다.

### 민감정보는 코드에 넣지 않는다

API 키는 코드나 README 예시에 직접 넣지 않고 `.env`나 배포 플랫폼 Secret에 넣어야 합니다.

## 14. 다음 단계

아직 남은 실제 운영 단계는 배포입니다.

추천 다음 질문:

```txt
Fly.io로 배포 설정까지 추가해줘
```

또는:

```txt
Render로 배포하는 방법 문서화해줘
```

