# jeob-su HTTP MCP 전환 -- 데이터 모델

> 이 문서는 HTTP MCP 서버가 다루는 핵심 데이터 구조를 설명합니다.
> 여기서 데이터 모델은 DB 테이블이 아니라, 서버가 읽고 주고받는 정보의 뼈대입니다.

---

## 전체 구조

```txt
[HTTP MCP Server]
  ├── [Environment Config]
  ├── [Semantic Index]
  ├── [Decision JSON Files]
  └── [MCP Tool Request/Response]
```

---

## 엔티티 상세

### Environment Config

서버 실행에 필요한 설정입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| PORT | 서버가 열릴 포트 | 3000 | O |
| GEMINI_API_KEY 또는 GOOGLE_API_KEY | Gemini 임베딩 API 키 | 실제 값은 비공개 | 검색 기능에 필요 |
| LAW_OC 또는 KOREAN_LAW_API_KEY | 법제처 API 키 | 실제 값은 비공개 | 다운로드 기능에 필요 |
| MCP_ACCESS_TOKEN | 공개 서버 보호용 토큰 | 실제 값은 비공개 | 선택 |

### Semantic Index

유사도 검색에 쓰는 임베딩 색인입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| manifest | 색인 메타데이터 | 모델명, 차원, 생성일 | O |
| items | 의결례별 임베딩과 메타데이터 목록 | title, decision_id, embedding | O |

현재 기본 위치:

```txt
data/acr-decisions/semantic/index.json
data/acr-decisions/semantic/manifest.json
```

### Decision JSON File

다운로드된 국민권익위원회 의결서 원문입니다.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| decision_id | 파일명 기준 ID | 35 | O |
| title | 의결례 제목 | 고충민원 의결례 제목 | O |
| order | 주문 | 신청 취지에 대한 판단 | 선택 |
| summary | 결정요지 | 핵심 요약 | 선택 |
| reason | 이유 | 상세 판단 이유 | 선택 |

현재 기본 위치:

```txt
data/acr-decisions/text/*.json
```

### MCP Tool Request

Claude.ai 또는 MCP 클라이언트가 서버에 보내는 도구 호출 요청입니다.

| 도구 | 입력 | 설명 |
|------|------|------|
| health_check | 없음 | 색인, manifest, Gemini 키 설정 여부 확인 |
| search_similar_decisions | query, top, dimensions 등 | 민원 텍스트로 유사 의결례 검색 |
| get_decision_detail | decision_id 등 | 특정 의결례 상세 발췌 |
| get_citation_pack | decision_id 등 | 인용용 정보 묶음 생성 |

### MCP Tool Response

도구 실행 결과입니다.

| 필드 | 설명 | 예시 |
|------|------|------|
| content | MCP 표준 응답 본문 | `{ type: "text", text: "..." }` |
| isError | 오류 여부 | true/false |
| result payload | 실제 검색 결과 JSON | 유사도 점수, 제목, 파일 경로 |

---

## 왜 이 구조인가

- 기존 stdio 서버가 이미 도구 목록과 실행 로직을 갖고 있습니다.
- HTTP 서버는 새로 만들되, 검색/상세 조회 로직은 기존 `scripts/lib/*`를 재사용하는 편이 안전합니다.
- 데이터 파일 위치를 유지하면 기존 `setup`, `build`, `query` 스크립트와 충돌이 적습니다.

---

## [NEEDS CLARIFICATION]

- [ ] 배포 서버에 `data/` 전체를 포함할지, semantic 색인과 필요한 text JSON만 포함할지 결정해야 합니다.
- [ ] 검색 결과에 원문 발췌를 어느 정도까지 포함할지 운영 기준이 필요합니다.
- [ ] 공개 접근이면 요청량 제한(rate limit)을 둘지 결정해야 합니다.

