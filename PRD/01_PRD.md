# jeob-su HTTP MCP 전환 -- PRD

> 생성일: 2026-05-27
> 생성 도구: Show Me The PRD

---

## 1. 제품 개요

### 한 줄 요약

`jeob-su`의 국민권익위원회 의결례 검색 MCP를 Claude.ai 웹에서 커스텀 커넥터 URL로 바로 사용할 수 있게 만든다.

### 해결하는 문제

현재 README의 MCP 설정은 로컬 `stdio` 방식입니다.
사용자는 Cursor 같은 로컬 도구에서는 쓸 수 있지만, Claude.ai 웹의 커스텀 커넥터에는 아래처럼 URL을 넣고 싶어합니다.

```txt
https://example.com/mcp
```

Claude.ai 커스텀 커넥터는 원격 MCP 서버 URL을 등록하는 방식이므로, 로컬 Node 스크립트를 직접 실행하는 설정만으로는 부족합니다.

### 핵심 가치

- Claude.ai 웹에서 설치 없이 URL 등록만으로 사용 가능
- 기존 `health_check`, `search_similar_decisions`, `get_decision_detail`, `get_citation_pack` 도구 재사용
- 기존 검색 로직과 데이터 구조를 최대한 유지
- API 키와 민감정보를 코드나 README에 직접 넣지 않음

---

## 2. 사용자

### 주요 사용자

- **누구**: Claude.ai 웹에서 `jeob-su` 의결례 검색을 쓰고 싶은 사용자
- **상황**: 로컬 Cursor 설정 없이 Claude.ai 설정 화면에서 커스텀 커넥터를 추가하고 싶을 때
- **목표**: 민원 텍스트와 유사한 국민권익위원회 의결례를 Claude 대화 안에서 바로 찾기

### 사용자 시나리오

1. 사용자가 배포된 MCP URL을 Claude.ai 커넥터에 등록합니다.
2. Claude.ai가 `/mcp` 엔드포인트로 MCP 초기화 요청을 보냅니다.
3. 서버가 도구 목록을 제공합니다.
4. 사용자가 민원 내용을 묻습니다.
5. Claude가 `search_similar_decisions`를 호출합니다.
6. 서버가 유사 의결례와 인용용 정보를 반환합니다.

---

## 3. 핵심 기능

| 기능 | 설명 | 우선순위 | 복잡도 |
|------|------|----------|--------|
| Streamable HTTP MCP 엔드포인트 | `/mcp`에서 MCP JSON-RPC 요청을 처리 | P1 | 보통 |
| 기존 도구 로직 재사용 | stdio 서버의 4개 도구를 HTTP 서버에서도 사용 | P1 | 보통 |
| 헬스체크 URL | 배포 상태를 사람이 확인할 `/health` 제공 | P1 | 간단 |
| 배포 설정 | Fly.io/Render/Railway 등에 올릴 설정 추가 | P1 | 보통 |
| README 업데이트 | Claude.ai 커넥터 등록 방법 추가 | P1 | 간단 |
| 인증 또는 접근 제한 | 공개 서버 남용을 막기 위한 토큰/키 검증 | P2 | 보통 |
| 구버전 SSE 호환 | 필요 시 예전 HTTP+SSE 클라이언트도 지원 | P3 | 복잡 |

---

## 4. 사용자 흐름

### 핵심 흐름

```txt
서버 배포 -> Claude.ai 설정 -> 커스텀 커넥터 추가 -> 도구 활성화 -> 의결례 검색
```

### 상세 흐름

1. **서버 배포**: `jeob-su` 프로젝트를 공개 HTTPS 서버에 올립니다.
2. **환경변수 설정**: `GEMINI_API_KEY`, 필요 시 `LAW_OC`를 배포 환경에 넣습니다.
3. **커넥터 등록**: Claude.ai 설정에서 `https://배포주소/mcp`를 입력합니다.
4. **도구 사용**: Claude 대화에서 민원 텍스트 기반 유사 의결례를 검색합니다.

---

## 5. 성공 기준

- [ ] `GET /health`가 서버 상태와 색인 존재 여부를 반환한다.
- [ ] `POST /mcp`로 MCP `initialize` 요청이 성공한다.
- [ ] `tools/list`에서 기존 4개 도구가 보인다.
- [ ] `health_check`는 Gemini 키 없이도 실행된다.
- [ ] `search_similar_decisions`는 Gemini 키가 있을 때 정상 실행된다.
- [ ] Claude.ai 커스텀 커넥터에 배포 URL을 등록할 수 있다.
- [ ] README에 stdio 방식과 HTTP 커넥터 방식이 구분되어 설명된다.

---

## 6. 안 만드는 것

> 이 목록은 첫 버전에서 제외합니다.

- 사용자별 로그인 시스템
  - 이유: 첫 버전 목적은 Claude.ai 커넥터 연결 검증입니다.

- 웹 관리자 화면
  - 이유: 서버 상태는 `/health`와 로그로 충분합니다.

- 실시간 색인 재빌드 API
  - 이유: Gemini API 비용과 긴 실행 시간이 있어 운영 리스크가 큽니다.

- URL에 Gemini API 키 전달
  - 이유: URL은 로그에 남기 쉬워서 보안상 좋지 않습니다.

---

## 7. 근거

- MCP 공식 스펙은 표준 전송 방식으로 `stdio`와 `Streamable HTTP`를 정의합니다.
- Streamable HTTP 서버는 하나의 MCP 엔드포인트, 예를 들면 `https://example.com/mcp`, 를 제공해야 합니다.
- Claude.ai 커스텀 커넥터는 원격 MCP 서버 URL을 수동으로 추가할 수 있습니다.

참고:

- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- https://claude.com/docs/connectors/custom/remote-mcp

---

## 8. [NEEDS CLARIFICATION]

- [ ] 배포 플랫폼을 Fly.io, Render, Railway 중 어디로 할지 결정해야 합니다.
- [ ] 공개 서버 접근을 완전 공개로 둘지, `?token=` 같은 간단한 보호를 둘지 결정해야 합니다.
- [ ] `data/acr-decisions/semantic/index.json`을 Git에 포함할지, 배포 시 별도 생성/업로드할지 결정해야 합니다.

