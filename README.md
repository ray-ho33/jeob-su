# jeob-su

국민권익위원회 의결례를 **법제처 Open API**로 내려받고, **Google Gemini 임베딩**으로 색인한 뒤, 민원·사실관계 텍스트와 **의미적으로 유사한** 과거 결정문을 찾는 **MCP(stdio) 서버** 중심 프로젝트입니다. Cursor 등 MCP 클라이언트에서 도구로 호출합니다.

> **법률 자문이 아닙니다.** 이 저장소에 들어 있는 결정문 범위 안에서 참고용 유사 사례를 빠르게 찾는 도구로만 사용하세요.

---

## 무엇을 하나요


| 단계        | 설명                                           | MCP 도구 |
| --------- | -------------------------------------------- | -------- |
| 1. 자료 모으기 | `AcrService` 의결서를 JSON으로 저장                  | `download_acr_decisions` / `ensure_semantic_corpus` |
| 2. 색인     | 검색용 필드를 묶어 `embedContent`(문서용)로 벡터화 후 저장     | `build_semantic_index` / `ensure_semantic_corpus` |
| 3. 검색     | 질의를 `embedContent`(질의용)로 벡터화하고 코사인 유사도 Top-K | `search_similar_decisions` |


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

프로젝트 루트에 `.env`를 두면 MCP 서버가 자동으로 읽습니다. **키는 GitHub·채팅·로그에 넣지 마세요.**

| 변수                                   | 용도                           |
| ------------------------------------ | ---------------------------- |
| `LAW_OC` 또는 `KOREAN_LAW_API_KEY`     | `download_acr_decisions` |
| `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` | `build_semantic_index`, `search_similar_decisions` |

발급 안내: [법제처 오픈API](https://open.law.go.kr/LSO/openApi/guideResult.do) · [Google AI Studio API 키](https://aistudio.google.com/app/apikey)

### 2) Cursor MCP 연결

경로를 본인 환경에 맞게 바꾸세요.

```json
{
  "mcpServers": {
    "jeob-su-acr": {
      "command": "node",
      "args": ["C:/절대경로/jeob-su/scripts/acr-mcp-stdio-server.mjs"],
      "cwd": "C:/절대경로/jeob-su"
    }
  }
}
```

### 3) MCP 워크플로 (권장)

1. **`health_check`** — 색인·키 상태 확인
2. **`ensure_semantic_corpus`** — JSON·`index.json` 없으면 생성 (소량 테스트: `max_pages: 2`, `build_limit: 5`)
3. **`search_similar_decisions`** — `query`에 민원·사실관계 입력
4. **`get_decision_detail`** / **`get_citation_pack`** — 상위 `decision_id`로 발췌

`@jeob-su` 스킬을 쓰면 에이전트가 위 순서를 따릅니다. [스킬](.cursor/skills/jeob-su/SKILL.md) 참고.

### 4) MCP 도구 요약

| 도구 | 설명 |
|------|------|
| `health_check` | 색인·manifest·Gemini 키 설정 여부 |
| `ensure_semantic_corpus` | 다운로드+색인 자동 보정 |
| `download_acr_decisions` | 결정문 JSON 수집 |
| `build_semantic_index` | 시맨틱 색인 생성 |
| `search_similar_decisions` | 유사 의결례 Top-K |
| `get_decision_detail` | 결정문 헤더·이유 발췌 |
| `get_citation_pack` | 인용용 메타 |

색인에 `dimensions`를 썼다면 **검색에도 동일 `dimensions`**를 넘기세요.

### 5) 점검 (개발용)

```bash
node scripts/smoke-acr-mcp.mjs
```

민감 정보는 **직접 입력 전 요약·가명**을 검토하세요.

### 레거시 CLI (개발·점검용)

`scripts/setup-acr-semantic.mjs`, `download-acr-decisions.mjs`, `build-acr-semantic-index.mjs`, `query-acr-semantic.mjs`는 사용자 워크플로에서 제외된 래퍼입니다. 일상 사용은 MCP만 쓰세요.

---

## 기술 개요

- **데이터**: 법제처 Open API — 국민권익위원회 의결서(JSON).
- **임베딩**: Gemini `embedContent`, 모델 기본값 `gemini-embedding-001` (문서: `RETRIEVAL_DOCUMENT`, 질의: `RETRIEVAL_QUERY`).
- **유사도**: 벡터 L2 정규화 후 내적(코사인과 동치).

---

## 저장소 구조

```
scripts/
  acr-mcp-stdio-server.mjs       # MCP stdio 서버 (진입점, 도구 7종)
  smoke-acr-mcp.mjs              # MCP 스모크
  lib/
    acr-setup.mjs                # ensure_semantic_corpus
    acr-download.mjs             # download_acr_decisions
    acr-index-build.mjs          # build_semantic_index
    acr-semantic-search.mjs      # search_similar_decisions 코어
    gemini-embed.mjs
    load-env.mjs
  setup-acr-semantic.mjs         # (레거시 CLI 래퍼)
  download-acr-decisions.mjs
  build-acr-semantic-index.mjs
  query-acr-semantic.mjs
data/
  acr-decisions/
    text/                      # 다운로드된 결정문 JSON (용량 큼 — Git에 포함하지 않는 것을 권장)
    semantic/                  # 색인 산출물
.cursor/skills/jeob-su/        # Cursor 에이전트 스킬
AGENTS.md                      # AI 에이전트용 요약
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
| 검색 실패 / 인덱스 없음 | MCP `ensure_semantic_corpus` 또는 `build_semantic_index` 실행 |
| 유사도 이상         | 빌드에 `dimensions`를 썼다면 검색에도 동일 값                        |
| 결과가 기대와 다름     | 색인에 없는 사안은 검색되지 않음. 질의를 구체화해 재시도                         |


---

## 더 읽을 것

- [AGENTS.md](AGENTS.md) — 코딩 에이전트용 요약
- [.env.example](.env.example) — 환경 변수 템플릿

질문·버그·개선은 **Issues**로 남겨 주시면 됩니다.