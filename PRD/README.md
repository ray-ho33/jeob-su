# stdio MCP를 HTTP MCP로 전환하기 위한 PRD 문서

> 생성일: 2026-05-27
> 목적: Claude.ai 웹 커스텀 커넥터에서 `jeob-su` MCP를 URL 하나로 사용할 수 있게 만들기 위한 계획

## 문서 목록

1. [01_PRD.md](01_PRD.md)
   - 무엇을 만들고 왜 필요한지 정리합니다.

2. [02_DATA_MODEL.md](02_DATA_MODEL.md)
   - HTTP MCP 서버가 다루는 설정, 요청, 응답, 데이터 구조를 정리합니다.

3. [03_PHASES.md](03_PHASES.md)
   - 구현 순서를 작은 단계로 나눕니다.

4. [04_PROJECT_SPEC.md](04_PROJECT_SPEC.md)
   - AI 또는 개발자가 구현할 때 지켜야 할 규칙입니다.

## 한 줄 요약

현재 `scripts/acr-mcp-stdio-server.mjs`는 Cursor 같은 로컬 MCP 클라이언트용입니다.
Claude.ai 웹 커넥터에서 쓰려면 공개 HTTPS 주소로 접근 가능한 Streamable HTTP MCP 서버가 필요합니다.

## 먼저 알아야 할 개념

- stdio MCP: 클라이언트가 내 컴퓨터의 프로그램을 직접 실행하고 표준입출력으로 대화하는 방식입니다.
- HTTP MCP: 서버가 인터넷 주소를 열어두고, 클라이언트가 HTTP 요청으로 대화하는 방식입니다.
- Claude.ai 커넥터: Claude 웹이 내 컴퓨터 파일을 실행하는 것이 아니라 원격 MCP 서버 URL에 접속합니다.

