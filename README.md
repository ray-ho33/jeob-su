# jeob-su

국민권익위원회 의결례를 **법제처 Open API**로 내려받고, **Google Gemini 임베딩**으로 색인한 뒤, 민원·사실관계 텍스트와 **의미적으로 유사한** 과거 결정문을 찾는 **Node.js 스크립트** 모음입니다.

> **법률 자문이 아닙니다.** 코퍼스 범위 안에서 참고용 유사 사례를 빠르게 찾는 도구로만 사용하세요.

---

## 무엇을 하나요

| 단계 | 설명 | 스크립트 |
|------|------|----------|
| 1. 자료 모으기 | `AcrService` 의결서를 JSON으로 저장 | [`scripts/download-acr-decisions.mjs`](scripts/download-acr-decisions.mjs) |
| 2. 색인 | 검색용 필드를 묶어 `embedContent`(문서용)로 벡터화 후 저장 | [`scripts/build-acr-semantic-index.mjs`](scripts/build-acr-semantic-index.mjs) |
| 3. 검색 | 질의를 `embedContent`(질의용)로 벡터화하고 코사인 유사도 Top-K | [`scripts/query-acr-semantic.mjs`](scripts/query-acr-semantic.mjs) |

색인에 넣는 텍스트는 결정문의 **제목, 민원표시, 결정요지, 주문, 이유(상한 자름)** 를 조합합니다.

---

## 요구 사항

- **Node.js 18+** (ESM, `fetch` 사용)
- **npm 의존성 없음** — `package.json` 없이 저장소의 `.mjs`만 실행합니다.

---

## 빠른 시작

```bash
git clone <저장소 URL>
cd jeob-su
cp .env.example .env   # 키 입력 후 저장
```

### 1) 환경 변수

프로젝트 루트에 `.env`를 두면 [`scripts/lib/load-env.mjs`](scripts/lib/load-env.mjs)가 자동으로 읽습니다. **키는 GitHub·채팅·로그에 넣지 마세요.** `.env`는 `.gitignore`에 포함되어 있습니다.

| 변수 | 용도 |
|------|------|
| `LAW_OC` 또는 `KOREAN_LAW_API_KEY` | 법제처 API — **다운로드** |
| `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` | Google AI Studio — **색인·검색** |

발급 안내: [법제처 오픈API](https://open.law.go.kr/LSO/openApi/guideResult.do) · [Google AI Studio API 키](https://aistudio.google.com/app/apikey)

### 2) 다운로드 + 시맨틱 색인 (한 번에)

결정문 JSON이 없으면 다운로드하고, `data/acr-decisions/semantic/index.json`이 없으면 색인을 만듭니다. 이미 있으면 해당 단계는 건너뜁니다.

```bash
node scripts/setup-acr-semantic.mjs
```

강제로 다시 받거나 색인만 다시 만들 때: `--force-download`, `--force-rebuild`. 소량만: `--max-pages 2 --build-limit 5`.

Cursor에서 **`@jeob-su`** 스킬을 쓸 때도, 에이전트가 이 명령으로 먼저 자료·색인을 맞추도록 [스킬](.cursor/skills/jeob-su/SKILL.md)에 적어 두었습니다.

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
  download-acr-decisions.mjs   # 코퍼스 수집
  build-acr-semantic-index.mjs
  query-acr-semantic.mjs
  smoke-acr-semantic.mjs
  lib/
    gemini-embed.mjs           # Gemini 호출·정규화·내적
    load-env.mjs               # .env 로드
data/
  acr-decisions/
    text/                      # 다운로드된 결정문 JSON (용량 큼 — Git에 포함하지 않는 것을 권장)
    semantic/                  # 색인 산출물
.cursor/skills/jeob-su/        # Cursor 에이전트 스킬
AGENTS.md                      # AI 에이전트용 요약
```

대용량 `data/`는 **`.gitignore`에 넣거나 Git LFS** 등으로 별도 관리하는 편이 일반적입니다.

---

## Cursor

에이전트 워크플로는 [`.cursor/skills/jeob-su/SKILL.md`](.cursor/skills/jeob-su/SKILL.md)를 참고하세요. 채팅에서 `@jeob-su`로 불러 쓸 수 있습니다.

---

## 개인정보·비용·면책

- 색인·검색 시 **결정문 발췌 텍스트와 사용자 입력 문장이 Google API로 전송**될 수 있습니다. 민감 정보는 입력 전에 검토하세요.
- 다운로드 시 **법제처 서버와 통신**합니다.
- Gemini API는 무료 한도·과금 정책이 있을 수 있으니 [Google AI 개발자 문서](https://ai.google.dev/)를 확인하세요.
- 출력은 **참고용**이며, 최종 판단·제출·소송 대응 등에는 공식 자료와 전문가 의견을 사용하세요.

---

## 문제 해결

| 증상 | 확인 |
|------|------|
| 인증키 오류 | 루트 `.env` 위치, 변수명 철자, 값 앞뒤 불필요한 따옴표 |
| 검색 실패 / 인덱스 없음 | `data/acr-decisions/semantic/index.json` 존재 여부, 먼저 빌드 실행 |
| 유사도 이상 | 빌드에 `--dimensions`를 썼다면 쿼리에도 동일 값 |
| 결과가 기대와 다름 | 코퍼스에 없는 사안은 검색되지 않음. 질의를 구체화해 재시도 |

---

## 더 읽을 것

- [AGENTS.md](AGENTS.md) — 코딩 에이전트용 요약
- [.env.example](.env.example) — 환경 변수 템플릿

질문·버그·개선은 **Issues**로 남겨 주시면 됩니다.
