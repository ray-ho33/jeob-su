# jeob-su HTTP MCP 전환 -- Phase 분리 계획

> 한 번에 다 바꾸지 않고, 기존 stdio MCP를 보존하면서 HTTP MCP를 추가하는 방식으로 진행합니다.

---

## Phase 1: 로컬 HTTP MCP 서버 추가

### 목표

내 컴퓨터에서 `http://localhost:3000/mcp`로 MCP 요청을 받을 수 있게 만듭니다.

### 기능

- [ ] 기존 stdio 서버의 도구 정의와 실행 로직을 공통 모듈로 분리
- [ ] `scripts/acr-mcp-http-server.mjs` 추가
- [ ] `GET /health` 추가
- [ ] `POST /mcp`에서 MCP `initialize`, `tools/list`, `tools/call` 처리
- [ ] 로컬 스모크 테스트 추가

### 확인 방법

```bash
node scripts/acr-mcp-http-server.mjs
```

이 명령어는 로컬 HTTP MCP 서버를 실행합니다.

```bash
node scripts/smoke-acr-mcp-http.mjs
```

이 명령어는 HTTP MCP 서버가 초기화와 도구 호출을 처리하는지 확인합니다.

### 장점

- 배포 전에 로컬에서 빠르게 검증할 수 있습니다.
- 기존 stdio MCP는 그대로 유지됩니다.

### 단점

- Claude.ai 웹에서는 아직 사용할 수 없습니다. 공개 HTTPS 배포가 필요합니다.

---

## Phase 2: 배포 가능한 서버 구성

### 목표

Fly.io, Render, Railway 같은 플랫폼에 올릴 수 있는 형태를 만듭니다.

### 기능

- [ ] `package.json` 추가 여부 결정
- [ ] 배포 시작 명령 정리
- [ ] 환경변수 문서화
- [ ] 색인 파일 포함 또는 배포 후 생성 절차 결정
- [ ] 서버 로그에서 API 키가 절대 출력되지 않게 점검

### 확인 방법

```bash
PORT=3000 node scripts/acr-mcp-http-server.mjs
```

이 명령어는 배포 환경과 비슷하게 포트를 지정해 서버를 실행합니다.

### 장점

- Claude.ai가 접근할 수 있는 공개 서버 준비가 됩니다.

### 단점

- 배포 플랫폼별 설정 차이가 있습니다.

---

## Phase 3: Claude.ai 커넥터 연결

### 목표

Claude.ai 설정 화면에서 커스텀 커넥터 URL을 추가하고 실제 도구 호출을 확인합니다.

### 기능

- [ ] README에 Claude.ai 커넥터 등록 방법 추가
- [ ] 커넥터 URL 예시 추가
- [ ] 도구별 사용 예시 추가
- [ ] 민감정보와 법률 자문 아님 면책 문구 추가

### 커넥터 URL 예시

```txt
https://배포주소/mcp
```

접근 보호를 둘 경우:

```txt
https://배포주소/mcp?token=발급한토큰
```

### 장점

- 사용자가 로컬 설정 없이 Claude.ai 웹에서 사용할 수 있습니다.

### 단점

- 공개 서버가 되므로 비용, 요청량, 보안 고려가 필요합니다.

---

## Phase 4: 운영 보강

### 목표

서버를 공개해도 안정적으로 운영할 수 있게 보강합니다.

### 기능

- [ ] 간단한 접근 토큰 검증
- [ ] 요청 크기 제한
- [ ] 요청량 제한
- [ ] Origin 검증
- [ ] 장애 로그 정리
- [ ] `dimensions` 불일치 같은 자주 나는 오류 메시지 개선

### 장점

- 공개 서버 남용과 운영 장애를 줄입니다.

### 단점

- 첫 구현보다 코드가 조금 복잡해집니다.

---

## 추천 MVP 범위

처음에는 Phase 1과 Phase 2까지만 구현하는 것을 추천합니다.

이유:

- 먼저 로컬 HTTP MCP가 안정적으로 동작해야 합니다.
- Claude.ai 커넥터 연결 문제는 서버 구현 문제와 배포 문제를 분리해서 봐야 디버깅이 쉽습니다.

