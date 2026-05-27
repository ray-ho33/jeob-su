# jeob-su

국민권익위원회 의결례를 **법제처 Open API**로 내려받고, **Google Gemini 임베딩**으로 색인한 뒤, 민원·사실관계 텍스트와 **의미적으로 유사한** 과거 결정문을 찾는 **Node.js 스크립트** 모음입니다.

> **법률 자문이 아닙니다.** 이 저장소에 들어 있는 결정문 범위 안에서 참고용 유사 사례를 빠르게 찾는 도구로만 사용하세요.

---

## 무엇을 하나요


| 단계        | 설명                                           | 스크립트                                                                           |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. 자료 모으기 | `AcrService` 의결서를 JSON으로 저장                  | `[scripts/download-acr-decisions.mjs](scripts/download-acr-decisions.mjs)`     |
| 2. 색인     | 검색용 필드를 묶어 `embedContent`(문서용)로 벡터화 후 저장     | `[scripts/build-acr-semantic-index.mjs](scripts/build-acr-semantic-index.mjs)` |
| 3. 검색     | 질의를 `embedContent`(질의용)로 벡터화하고 코사인 유사도 Top-K | `[scripts/query-acr-semantic.mjs](scripts/query-acr-semantic.mjs)`             |


색인에 넣는 텍스트는 결정문의 **제목, 민원표시, 결정요지, 주문, 이유(상한 자름)** 를 조합합니다.

---

## 시맨틱 검색·임베딩이 뭔가요?

### 시맨틱 검색이란

**키워드 검색**은 글에 특정 단어가 들어 있는지를 본다. 예를 들어 “육교”라고만 찾으면, 표현이 “횡단시설”이나 “통학로 안전”으로만 적힌 결정문은 잘 안 걸릴 수 있다.

**시맨틱(의미 기반) 검색**은 단어가 완전히 같지 않아도, **말하는 내용·상황이 비슷한지**를 기준으로 가까운 문서를 찾는 방식이다. 민원을 한 줄로 적어 넣었을 때, 과거 의결례 중 **비슷한 쟁점·사실관계**가 담긴 것부터 순서대로 나오게 만드는 것이 이 저장소의 목적이다.

### 임베딩(embedding)이란

컴퓨터는 글을 그대로 “비교”하기 어렵다. 그래서 **한 덩어리의 글을, 고정 길이의 숫자 나열(벡터)** 로 바꾼 것을 **임베딩**이라고 부른다.

비유하자면, 글마다 **많은 차원을 가진 좌표**를 하나씩 받는다고 생각하면 된다. 의미가 비슷한 글은 그 좌표가 **비슷한 방향**을 향하는 경향이 있다. 반대로 전혀 다른 주제는 다른 방향에 놓인다. 이 좌표는 사람이 손으로 적는 것이 아니라, **Gemini 같은 임베딩 모델**이 문장 전체를 읽고 자동으로 만든다.

### 이 프로젝트에서 Gemini가 하는 일

1. **색인(의결례 쪽)**  
   각 결정문 JSON에서 검색에 쓸 본문을 만든다(위 표의 **제목·민원표시·결정요지·주문·이유**를 이어 붙인 텍스트). 이 텍스트를 Google의 **`embedContent` API**에 보낸다.  
   모델은 기본적으로 **`gemini-embedding-001`** 을 쓰며, 이때 요청 종류를 **`RETRIEVAL_DOCUMENT`** 로 둔다. 이름 그대로 “나중에 찾아볼 **문서** 묶음”에 넣기 좋게 벡터를 뽑으라는 힌트다. 나온 벡터를 `data/acr-decisions/semantic/index.json`에 저장해 두면, 매번 결정문 전체를 API에 다시 보내지 않고도 검색할 수 있다.

2. **검색(민원·질문 쪽)**  
   사용자가 입력한 민원 한 줄(또는 여러 문장)도 같은 API로 벡터로 바꾼다. 이때는 **`RETRIEVAL_QUERY`** 로 요청한다. “지금 이 **질문**과 맞는 문서를 찾아라”에 맞춘 설정이다.

즉, **의결례는 ‘문서용’ 벡터**, **민원 글은 ‘질의용’ 벡터**로 각각 만들고, 둘을 같은 기준으로 비교한다. 모델 안에서 구체적으로 몇 층 신경망을 쓰는지까지는 공개 문서에 다 있지 않을 수 있지만, 사용 입장에서는 “문장 → 의미가 담긴 숫자 벡터”로 바꿔 준다고 이해하면 된다.

### 유사도는 어떻게 계산하나

두 벡터가 **얼마나 같은 방향을 보는지**를 숫자로 나타낸 것이 **코사인 유사도**에 가깝다. 이 저장소의 스크립트는 벡터를 길이 1로 맞춘 뒤(**L2 정규화**), 두 벡터의 **내적**을 유사도로 쓴다. 정규화된 벡터끼리는 내적이 곧 코사인 유사도와 같아서, 값이 클수록 의미적으로 가깝다고 본다.

### 알아 두면 좋은 점

- 시맨틱 검색은 **“비슷해 보인다”는 통계적 추천**에 가깝고, **법적 판단이나 최종 결론을 대신해 주지 않는다.**
- 찾아지는 범위는 **이 색인에 들어 있는 의결례** 안으로 한정된다. 저장소에 내려받아 두지 않은 사안은 아무리 잘 임베딩해도 나오지 않는다.
- API로 텍스트를 내므로, **민감한 개인정보를 넣기 전**에 가명·요약 등을 검토하는 것이 좋다(아래 “개인정보·비용·면책” 참고).

---

## 요구 사항

- **Node.js 18+** (ESM, `fetch` 사용)
- **npm 의존성 없음** — `package.json` 없이 저장소의 `.mjs`만 실행합니다.

---

## 빠른 시작

```bash
git clone https://github.com/ray-ho33/jeob-su.git
cd jeob-su
cp .env.example .env   # 키 입력 후 저장
```

### 1) 환경 변수

프로젝트 루트에 `.env`를 두면 `[scripts/lib/load-env.mjs](scripts/lib/load-env.mjs)`가 자동으로 읽습니다. **키는 GitHub·채팅·로그에 넣지 마세요.** `.env`는 `.gitignore`에 포함되어 있습니다.


| 변수                                   | 용도                           |
| ------------------------------------ | ---------------------------- |
| `LAW_OC` 또는 `KOREAN_LAW_API_KEY`     | 법제처 API — **다운로드**           |
| `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` | Google AI Studio — **색인·검색** |
| `PORT`                                | HTTP MCP 서버 포트, 기본 `3000` |
| `HOST`                                | HTTP MCP 서버 바인딩 주소, 기본 `0.0.0.0` |
| `MCP_ACCESS_TOKEN`                    | 선택: 공개 HTTP MCP 서버 접근 토큰 |
| `MCP_ALLOWED_ORIGINS`                 | 선택: 추가 허용 Origin 목록, 쉼표로 구분 |


발급 안내: [법제처 오픈API](https://open.law.go.kr/LSO/openApi/guideResult.do) · [Google AI Studio API 키](https://aistudio.google.com/app/apikey)

### 2) 다운로드 + 시맨틱 색인 (한 번에)

결정문 JSON이 없으면 다운로드하고, `data/acr-decisions/semantic/index.json`이 없으면 색인을 만듭니다. 이미 있으면 해당 단계는 건너뜁니다.

```bash
node scripts/setup-acr-semantic.mjs
```

강제로 다시 받거나 색인만 다시 만들 때: `--force-download`, `--force-rebuild`. 소량만: `--max-pages 2 --build-limit 5`.

Cursor에서 `**@jeob-su**` 스킬을 쓸 때도, 에이전트가 이 명령으로 먼저 자료·색인을 맞추도록 [스킬](.cursor/skills/jeob-su/SKILL.md)에 적어 두었습니다.

### 3) 결정문만 / 색인만 실행할 때

```bash
node scripts/download-acr-decisions.mjs
```

테스트 시 페이지 수 제한:

```bash
node scripts/download-acr-decisions.mjs --max-pages 2
```

기본 출력: `data/acr-decisions/text/*.json` (출력 경로는 `--out`으로 변경 가능)

```bash
node scripts/build-acr-semantic-index.mjs --limit 5    # 소량 검증
node scripts/build-acr-semantic-index.mjs                # 전체 (시간·API 호출 다수)
node scripts/build-acr-semantic-index.mjs --delay-ms 250 # 호출 간격(ms)
```

산출물: `data/acr-decisions/semantic/index.json`, `manifest.json`

선택: `--dimensions N`으로 임베딩 차원을 줄인 경우, **검색 시에도 동일한 `--dimensions`**를 넘겨야 합니다.

### 4) 유사 사례 검색

```bash
node scripts/query-acr-semantic.mjs --format md --top 10 -- "민원 또는 사실관계를 여기에"
```

표준 입력으로 질의를 넣을 수도 있습니다:

```bash
echo "민원 본문" | node scripts/query-acr-semantic.mjs --format md
```

### 점검용 스모크

```bash
node scripts/smoke-acr-semantic.mjs
```

### MCP 서버(stdio)

Cursor 등 **MCP(Model Context Protocol)** 클라이언트에서 같은 시맨틱 검색·발췌를 호출할 수 있습니다. 의존성 없이 저장소 안의 **`node`** 만으로 **`scripts/acr-mcp-stdio-server.mjs`** 가 stdio JSON-RPC 라인 하나씩 처리합니다.

- **실행 파일**: `[scripts/acr-mcp-stdio-server.mjs](scripts/acr-mcp-stdio-server.mjs)`
- **도구**: `health_check`, `search_similar_decisions`(Gemini 키 필요), `get_decision_detail`, `get_citation_pack`
- **`search_similar_decisions`** 는 `build` 시 **`--dimensions N`** 을 썼다면 MCP 인수 **`dimensions`** 로도 동일 값을 맞춰야 합니다.
- Gemini 키 없이 MCP 핸셰이크·도구 목록·`health_check` 만 검증할 때:

```bash
node scripts/smoke-acr-mcp.mjs
```

예시(Cursor MCP 설정 형식 참고용 — 경로를 본인 환경에 맞게 바꾸세요):

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

민감 정보는 MCP·Gemini 호출 면책 문구와 동일하게 **직접 입력 전 요약·가명**을 검토하세요.

### MCP 서버(HTTP)

Claude.ai 웹의 **커스텀 커넥터**는 위의 stdio 설정처럼 내 컴퓨터의 파일을 직접 실행하지 않습니다. 대신 인터넷에서 접근 가능한 **HTTPS URL**로 MCP 서버에 접속합니다.

이 저장소는 로컬 검증용 HTTP MCP 서버도 제공합니다.

- **실행 파일**: [scripts/acr-mcp-http-server.mjs](scripts/acr-mcp-http-server.mjs)
- **MCP URL**: `http://localhost:3000/mcp` (로컬 테스트용)
- **상태 확인 URL**: `http://localhost:3000/health`
- **도구**: stdio MCP와 동일한 `health_check`, `search_similar_decisions`, `get_decision_detail`, `get_citation_pack`

로컬에서 실행:

```bash
node scripts/acr-mcp-http-server.mjs
```

이 명령어는 `PORT` 환경변수가 없으면 기본으로 `3000`번 포트에서 HTTP MCP 서버를 엽니다.

배포 환경처럼 포트를 지정해 실행:

```bash
PORT=3000 HOST=0.0.0.0 node scripts/acr-mcp-http-server.mjs
```

HTTP MCP 스모크:

```bash
node scripts/smoke-acr-mcp-http.mjs
```

이 명령어는 임시 로컬 포트에서 HTTP 서버를 띄운 뒤 `/health`, `initialize`, `tools/list`, `health_check` 호출이 되는지 확인합니다.

Gemini 키와 색인이 준비된 상태에서 MCP 검색 호출까지 확인하려면:

```bash
node scripts/smoke-acr-mcp-http.mjs --live-search
```

이 명령어는 `search_similar_decisions`도 한 번 호출하므로 Gemini API 사용량이 발생할 수 있습니다.

Claude.ai 웹 커넥터에서 쓰려면 이 로컬 서버를 그대로 넣는 것이 아니라, Fly.io·Render·Railway 같은 곳에 배포해 공개 HTTPS 주소를 만들어야 합니다.

Claude.ai 커넥터 URL 예시:

```txt
https://배포한주소.example/mcp
```

간단한 접근 토큰을 쓰고 싶다면 배포 환경에 `MCP_ACCESS_TOKEN`을 설정한 뒤 URL에 `token`을 붙일 수 있습니다.

```txt
https://배포한주소.example/mcp?token=발급한토큰
```

배포 플랫폼이 Docker를 지원한다면 저장소의 `Dockerfile`을 사용할 수 있습니다. 배포할 때는 플랫폼의 환경변수/Secret 설정에 `GEMINI_API_KEY`와 필요한 키를 넣고, `data/acr-decisions/semantic/index.json`과 `data/acr-decisions/text/*.json`이 함께 포함되어 있는지 확인하세요.

#### GitHub Actions로 Fly.io 자동 배포

이 저장소에는 Fly.io 자동 배포용 파일이 들어 있습니다.

```txt
fly.toml
.github/workflows/fly-deploy.yml
```

구조는 다음과 같습니다.

```txt
GitHub main 브랜치에 push
→ GitHub Actions 실행
→ flyctl deploy --remote-only
→ Fly.io에 HTTP MCP 서버 배포
```

처음 한 번만 준비할 것:

1. Fly.io 계정을 만들고 `flyctl`을 설치합니다.
2. Fly.io 앱을 만듭니다.

```bash
fly apps create jeob-su-acr-mcp
```

이 명령어는 Fly.io에 `jeob-su-acr-mcp`라는 서버 공간을 만듭니다. 다른 이름을 쓰고 싶다면 `fly.toml`의 `app` 값도 같은 이름으로 바꾸거나, GitHub Repository Variable `FLY_APP_NAME`에 앱 이름을 넣으세요.

3. Fly.io에 서버 환경변수를 넣습니다.

```bash
fly secrets set GEMINI_API_KEY="본인_Gemini_키" --app jeob-su-acr-mcp
fly secrets set LAW_OC="본인_법제처_키" --app jeob-su-acr-mcp
fly secrets set MCP_ACCESS_TOKEN="원하는_접근_토큰" --app jeob-su-acr-mcp
```

이 명령어들은 API 키를 코드에 넣지 않고 Fly.io의 비밀 저장소에 넣습니다.

4. GitHub Actions용 Fly 토큰을 만듭니다.

```bash
fly tokens create deploy --app jeob-su-acr-mcp -x 999999h
```

5. GitHub 저장소 설정에서 Secret을 추가합니다.

```txt
Settings → Secrets and variables → Actions → New repository secret
Name: FLY_API_TOKEN
Value: 위에서 만든 Fly 토큰
```

6. `main` 브랜치에 merge 또는 push하면 자동 배포됩니다.

배포 후 Claude.ai 커넥터에는 아래처럼 등록합니다.

```txt
https://jeob-su-acr-mcp.fly.dev/mcp?token=원하는_접근_토큰
```

주의:

- `GEMINI_API_KEY`, `GOOGLE_API_KEY` 같은 키를 URL에 넣지 마세요.
- API 키는 `.env` 또는 배포 플랫폼의 Secret/Environment Variables에 넣으세요.
- `MCP_ACCESS_TOKEN`을 URL에 붙이는 방식은 간단하지만 URL 로그에 남을 수 있습니다. 클라이언트가 지원하면 `Authorization: Bearer ...` 헤더가 더 낫습니다.
- Claude.ai에서 보낸 민원 본문은 검색 과정에서 Gemini API로 전송될 수 있습니다.
- 공개 서버로 운영하면 요청량, 비용, 개인정보 처리를 별도로 관리해야 합니다.

---

## 기술 개요

- **데이터**: 법제처 Open API — 국민권익위원회 의결서(JSON).
- **임베딩**: Gemini `embedContent`, 모델 기본값 `gemini-embedding-001` (문서: `RETRIEVAL_DOCUMENT`, 질의: `RETRIEVAL_QUERY`).
- **유사도**: 벡터 L2 정규화 후 내적(코사인과 동치).

---

## 저장소 구조

```
scripts/
  setup-acr-semantic.mjs        # 다운로드 + 색인 자동 보정
  download-acr-decisions.mjs   # 결정문 JSON 수집
  build-acr-semantic-index.mjs
  query-acr-semantic.mjs
  acr-mcp-stdio-server.mjs       # MCP stdio 서버(도구 4종)
  acr-mcp-http-server.mjs        # MCP HTTP 서버(Claude.ai 커넥터용)
  smoke-acr-semantic.mjs
  smoke-acr-mcp.mjs              # MCP 라이프사이클·health 무키 스모크
  smoke-acr-mcp-http.mjs         # HTTP MCP 라이프사이클·health 무키 스모크
  lib/
    gemini-embed.mjs           # Gemini 호출·정규화·내적
    acr-semantic-search.mjs      # 인덱스 로드·검색 코어(shared)
    acr-mcp-tools.mjs            # stdio/HTTP MCP 공통 도구 로직
    load-env.mjs               # .env 로드
data/
  acr-decisions/
    text/                      # 다운로드된 결정문 JSON (용량 큼 — Git에 포함하지 않는 것을 권장)
    semantic/                  # 색인 산출물
.cursor/skills/jeob-su/        # Cursor 에이전트 스킬
AGENTS.md                      # AI 에이전트용 요약
Dockerfile                     # HTTP MCP 서버 배포용 기본 컨테이너 설정
.dockerignore                  # 컨테이너 빌드에서 비밀·불필요 파일 제외
```

대용량 `data/`는 `**.gitignore`에 넣거나 Git LFS** 등으로 별도 관리하는 편이 일반적입니다.

---

## Cursor

에이전트 워크플로는 `[.cursor/skills/jeob-su/SKILL.md](.cursor/skills/jeob-su/SKILL.md)`를 참고하세요. 채팅에서 `@jeob-su`로 불러 쓸 수 있습니다.

---

## 개인정보·비용·면책

- 색인·검색 시 **결정문 발췌 텍스트와 사용자 입력 문장이 Google API로 전송**될 수 있습니다. 민감 정보는 입력 전에 검토하세요.
- 다운로드 시 **법제처 서버와 통신**합니다.
- Gemini API는 무료 한도·과금 정책이 있을 수 있으니 [Google AI 개발자 문서](https://ai.google.dev/)를 확인하세요.
- 출력은 **참고용**이며, 최종 판단·제출·소송 대응 등에는 공식 자료와 전문가 의견을 사용하세요.

---

## 문제 해결


| 증상             | 확인                                                       |
| -------------- | -------------------------------------------------------- |
| 인증키 오류         | 루트 `.env` 위치, 변수명 철자, 값 앞뒤 불필요한 따옴표                      |
| 검색 실패 / 인덱스 없음 | `data/acr-decisions/semantic/index.json` 존재 여부, 먼저 빌드 실행 |
| 유사도 이상         | 빌드에 `--dimensions`를 썼다면 쿼리에도 동일 값                        |
| 결과가 기대와 다름     | 색인에 없는 사안은 검색되지 않음. 질의를 구체화해 재시도                         |


---

## 더 읽을 것

- [AGENTS.md](AGENTS.md) — 코딩 에이전트용 요약
- [docs/http-mcp-workflow.md](docs/http-mcp-workflow.md) — HTTP MCP 전환 작업 과정 설명
- [.env.example](.env.example) — 환경 변수 템플릿

질문·버그·개선은 **Issues**로 남겨 주시면 됩니다.
