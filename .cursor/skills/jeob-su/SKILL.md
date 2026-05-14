---
name: jeob-su
description: >-
  국민권익위원회 결정문을 법제처 API로 내려받고 Gemini로 색인한 뒤 유사
  의결례를 찾는다. 레포 복제 후 `@jeob-su`로 호출하면 에이전트가
  `setup-acr-semantic.mjs`로 다운로드·색인을 자동 보정한다. jeob-su·
  AcrService·민원 유사 사례·embedContent·`data/acr-decisions` 작업 시 사용.
disable-model-invocation: false
---

# jeob-su: 권익위 결정문 코퍼스와 시맨틱 검색

## 레포가 하는 일

1. **수집**: 법제처 Open API `AcrService`로 국민권익위원회 의결서 JSON을 `data/acr-decisions/text/`에 저장한다.
2. **인덱싱**: 코퍼스 텍스트를 묶어 Gemini `embedContent`(문서)로 벡터화하고 `data/acr-decisions/semantic/index.json`에 저장한다.
3. **검색**: 사용자 민원 문장을 쿼리 임베딩으로 바꾼 뒤 코사인 유사도로 Top-K를 고른다.

## 비밀·외부 전송

- `embedContent` 호출 시 **검색 텍스트와 사용자 민원 문장이 Google로 전송**된다.
- API 키는 코드·스킬 본문에 넣지 않는다. 프로젝트 루트 **`.env`** 또는 셸 `export`를 쓴다. 키 이름은 아래 표 참고.

## 환경 변수

| 변수 | 용도 |
|------|------|
| `LAW_OC` 또는 `KOREAN_LAW_API_KEY` | 법제처 다운로드 스크립트 |
| `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` | 임베딩 빌드·쿼리 |

스크립트는 저장소 루트의 `.env`를 자동으로 읽는다(`scripts/lib/load-env.mjs`). 예시 키 형식은 `.env.example` 참고.

## 스킬 호출 시 자동 선행 (필수)

사용자가 **`@jeob-su`** 또는 **`@korean-acr-semantic`** 으로 이 스킬을 쓰거나, 이 레포 맥락에서 **권익위 유사 사례·시맨틱 검색**을 요청하면, **유사도 검색·결정문 인용에 앞서** 저장소 루트에서 아래를 실행한다.

```bash
node scripts/setup-acr-semantic.mjs
```

- `data/acr-decisions/text/`에 결정문 JSON이 **없으면** 다운로드, `data/acr-decisions/semantic/index.json`이 **없으면** 색인 빌드를 **순서대로** 수행한다. 이미 있으면 해당 단계는 건너뛴다.
- 사용자에게 “진행할까요?”처럼 **확인만 하고 멈추지 않는다.** 스킬을 연 것은 파이프라인 동의로 본다. (단, **API 키가 없어 실패**하면 `.env.example`을 복사해 루트 `.env`에 키를 넣으라고 안내하고, **키 값을 채팅에 묻거나 출력하지 않는다.**)
- 사용자가 **다운로드만·색인만·이미 받은 데이터만** 등 범위를 명시한 경우에는 그에 따른다.

전체를 다시 받거나 색인만 갱신할 때:

```bash
node scripts/setup-acr-semantic.mjs --force-download   # 다운로드부터 강제
node scripts/setup-acr-semantic.mjs --force-rebuild    # 색인만 강제
```

빠른 검증(소량만):

```bash
node scripts/setup-acr-semantic.mjs --max-pages 2 --build-limit 5
```

## 워크플로 (에이전트)

프로젝트 루트에서 실행한다. **일반 경로는 위 `setup-acr-semantic.mjs` 한 번**이면 된다. 개별 스크립트는 유지보수·부분 실행용이다.

**1) 결정문만 내려받기**

```bash
node scripts/download-acr-decisions.mjs
```

**2) 색인만 만들기**

```bash
node scripts/build-acr-semantic-index.mjs
```

- 스모크: `node scripts/build-acr-semantic-index.mjs --limit 5`
- API 완화: `--delay-ms 250`
- 차원 축소: `--dimensions 768` (쿼리에도 **동일 값** 필요)

**3) 유사 의결례 찾기**

```bash
node scripts/query-acr-semantic.mjs --top 10 -- "민원 또는 사실관계 서술"
node scripts/query-acr-semantic.mjs --format md --top 8 -- "…"
```

**4) 구조·연동 점검**

```bash
node scripts/smoke-acr-semantic.mjs
```

## 에이전트가 결과를 설명할 때

1. `query` 출력의 `file`(또는 경로)로 원본 JSON을 연다.
2. **사건번호·주문·결정요지** 등을 인용해 왜 유사한지 짧게 요약한다.
3. 검색이 실패하거나 인덱스가 비어 있으면 `setup-acr-semantic.mjs`(필요 시 `--force-rebuild`)로 다시 맞춘다.

## 경로 요약

| 경로 | 내용 |
|------|------|
| `data/acr-decisions/text/*.json` | 의결서 원본 (법제처 JSON) |
| `data/acr-decisions/semantic/index.json` | 임베딩 인덱스 |
| `scripts/setup-acr-semantic.mjs` | 다운로드+색인 자동 보정(스킬 선행) |
| `scripts/download-acr-decisions.mjs` | 수집 |
| `scripts/build-acr-semantic-index.mjs` | 인덱스 빌드 |
| `scripts/query-acr-semantic.mjs` | 시맨틱 검색 |
| `scripts/smoke-acr-semantic.mjs` | 스모크 |

## `@korean-acr-semantic`

동일 레포의 별칭 스킬 이름이다. 세부 트리거를 유지하려고 남겨 두었으며, 절차는 이 파일과 동일하다.
