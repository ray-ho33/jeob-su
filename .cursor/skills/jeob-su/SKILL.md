---
name: jeob-su
description: >-
  국민권익위원회 결정문 MCP 시맨틱 검색. 레포 복제 후 `@jeob-su`로 호출하면
  MCP 도구 ensure_semantic_corpus로 다운로드·색인을 맞춘 뒤
  search_similar_decisions로 유사 의결례를 찾는다. jeob-su·AcrService·민원
  유사 사례·embedContent·`data/acr-decisions` 작업 시 사용.
disable-model-invocation: false
---

# jeob-su: 권익위 결정문 MCP 시맨틱 검색

## 레포가 하는 일

1. **수집**: MCP `download_acr_decisions` 또는 `ensure_semantic_corpus`로 결정문 JSON을 `data/acr-decisions/text/`에 저장.
2. **인덱싱**: MCP `build_semantic_index` 또는 `ensure_semantic_corpus`로 `semantic/index.json` 생성.
3. **검색**: MCP `search_similar_decisions`로 민원 문장과 유사한 의결례 Top-K.

**사용자 워크플로는 MCP 도구만 사용한다.** `node scripts/query-acr-semantic.mjs` 등 CLI는 개발·점검용이며 스킬에서 호출하지 않는다.

## MCP 서버 연결

Cursor MCP 설정 예시(경로는 본인 환경에 맞게 수정):

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

## 비밀·외부 전송

- `search_similar_decisions`·색인 빌드 시 **검색 텍스트와 사용자 민원 문장이 Google로 전송**될 수 있다.
- API 키는 코드·스킬 본문에 넣지 않는다. 프로젝트 루트 **`.env`** 또는 MCP 서버 `cwd` 환경변수. [`.env.example`](../../../.env.example) 참고.

## 환경 변수

| 변수 | 용도 |
|------|------|
| `LAW_OC` 또는 `KOREAN_LAW_API_KEY` | `download_acr_decisions` |
| `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` | `build_semantic_index`, `search_similar_decisions` |

## 스킬 호출 시 자동 선행 (필수)

`@jeob-su` 또는 `@korean-acr-semantic`으로 **권익위 유사 사례·시맨틱 검색**을 요청하면, 검색·인용 **전에** MCP를 다음 순서로 호출한다.

1. **`health_check`** — 색인·키 상태 확인 (API 호출 없음).
2. **`ensure_semantic_corpus`** — `text/*.json` 또는 `semantic/index.json`이 없으면 생성. 이미 있으면 해당 단계는 건너뜀.
3. 사용자에게 “진행할까요?”처럼 **확인만 하고 멈추지 않는다.** (단, **API 키가 없어 실패**하면 `.env.example`을 복사해 루트 `.env`에 키를 넣으라고 안내하고, **키 값을 채팅에 묻거나 출력하지 않는다.**)
4. 전체 재다운로드·재색인은 사용자가 명시할 때만 `force_download` / `force_rebuild`를 사용한다.

소량 검증 예시 인수:

```json
{ "max_pages": 2, "build_limit": 5 }
```

## 워크플로 (에이전트)

**1) 유사 의결례 찾기**

- MCP `search_similar_decisions` — `query`(민원 본문), `top`(기본 10), 필요 시 `dimensions`.

**2) 원문·인용**

- MCP `get_decision_detail` — `decision_id`(검색 결과 `id`).
- MCP `get_citation_pack` — 인용용 메타 묶음.

**3) 부분 작업**

- 다운로드만: `download_acr_decisions`
- 색인만: `build_semantic_index` (`limit`, `delay_ms`, `dimensions`)

## 에이전트가 결과를 설명할 때

1. `search_similar_decisions` 결과의 `id`·`file`·`preview`·`score`를 본다.
2. `get_decision_detail` 또는 원문 JSON으로 **사건번호·주문·결정요지**를 인용해 왜 유사한지 요약한다.
3. 검색 실패·인덱스 없음이면 `ensure_semantic_corpus`(필요 시 `force_rebuild`)를 다시 호출한다.

## 경로 요약

| 경로 | 내용 |
|------|------|
| `data/acr-decisions/text/*.json` | 의결서 원본 |
| `data/acr-decisions/semantic/index.json` | 임베딩 인덱스 |
| `scripts/acr-mcp-stdio-server.mjs` | MCP 서버 |
| `scripts/smoke-acr-mcp.mjs` | MCP 스모크 (개발용) |

## `@korean-acr-semantic`

동일 레포의 별칭 스킬 이름이다. 절차는 이 파일과 동일하다.
