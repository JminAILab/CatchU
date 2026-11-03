## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-29T04:20:55Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR1.11 확인 칸 | 주소 허용 시험이 `http://github.com/`, `github.com.evil.example`, `gist.github.com`, `javascript:` 네 가지뿐이다. 사용자 정보가 붙은 주소(`https://github.com@evil.example/`), 포트가 붙은 주소(`https://github.com:8443/`), 대문자 호스트가 빠져 있다. 또 자유 문장 안에서 주소의 끝을 어디까지로 보는지(뒤따르는 문장부호·공백) 정해져 있지 않다 | 거부 사례에 위 세 가지를 더하고, 주소 끝 판정 기준을 한 줄로 적는다. 기준이 `https://github.com/` 접두 비교인지 URL 해석 뒤 호스트 비교인지도 함께 정한다 | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR1.10·NFR1.11·NFR7.1 | 주소 링크 규칙(NFR1.11)의 적용 대상이 텍스트 자료 본문과 Catch 작성자 설명뿐이다. 같은 화면에 나오는 AI 요약·AI 설명 초안·질의응답 답에 주소가 있을 때 글자로만 보이는지는 어디에도 적혀 있지 않다 | AI가 쓴 글 안의 주소는 링크로 만들지 않고 글자로 보인다는 한 줄을 NFR1.11에 더하거나, 그 판단을 U5·U10 몫으로 넘긴다고 명시한다 | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR1.8 | 경로의 ID는 UUID 형식을 먼저 확인한다고 했지만, 받은 사람 경로의 토큰(256비트 난수)은 UUID가 아니다. 형식이 틀린 토큰이 400인지 404 `LINK_UNAVAILABLE`인지 정해져 있지 않다. 400이면 NFR1.3의 "구분 없이 404"와 어긋난다 | 형식이 틀린 토큰도 없는 토큰과 같은 404 `LINK_UNAVAILABLE`로 처리한다고 NFR1.8 또는 NFR1.3에 적는다 | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/scalability-requirements.md > NFR4.9 | 발행 빈도 제한기와 unlock 시도 제한기를 "10월 구현 그대로"라고만 하고 저장 위치를 적지 않았다. 12월 최종 환경이 EKS(복제 여러 개 가능)인데, 이 제한기가 프로세스 메모리 기반이면 비밀번호 시도 제한(NFR1.7)이 복제 수만큼 느슨해진다. 이 점을 확인하지 못했다 | 10월 제한기의 저장 위치를 한 줄로 확인해 적고, 메모리 기반이면 "복제 N개일 때 한도가 N배가 되는 한계"를 NFR1.7 또는 NFR4.9에 남긴다 | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md > NFR7.4 | 확인 방법이 "화면 문구 검토"뿐이고, 줄인 고정 안내 문구는 "받은 사람 화면 연결 전에 정한다"로 미뤄 두었다. 통과·실패 기준이 없어 다른 사람이 같은 결론에 이르기 어렵다. U2 문구 두 건(#423)도 아직 반영 전이다 | 중복 판정 기준을 적는다. 예를 들어 "U4 안내는 발행 시각만 표시하고, `fixed-copy`·U5 고지·U10 안내와 같은 의미의 문장이 한 화면에 둘 이상이면 실패"처럼 쓴다. 문구 확정 시점도 입력 변경 항목에 올린다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 구문 | PASS (UTF-8로 읽을 때 유효, 기본 cp949 읽기는 인코딩 오류였으나 파일 문제는 아님) | 구조 문제 없음 |
| `NFRx.y` ID 대조 | PASS: 문서의 NFR1.1~1.11, 2.1~2.2, 4.1~4.12, 5.1~5.7, 6.1~6.8, 7.1~7.5가 traceability.json target과 일치하고 중복 ID 없음. NFR3은 N/A로 사유가 적혀 있음 | 상류 NFR1~NFR7이 모두 닫힘 |
| 상류 참조 확인 | PASS: BR1.5·3.4·4.7·4.8·5.4·5.5·6.1~6.5·7.1·7.5·8.4·10.1·10.2, 시나리오 S1~S15, C-11 0번 자리와 guide-rule, 에러 대응 최소선, `share-links.md`의 토큰 저장 한계가 실제로 있고 내용이 인용과 맞음 | 깨진 참조 없음 |

### Summary

공통 전제와 기능 설계 BR을 그대로 이어받았고 참조가 모두 풀린다. 보안 요구사항은 소유 확인, 링크 판정 순서, 비밀값 로그 금지, 화면 출력 규칙이 개발자가 질문 없이 구현할 수 있을 만큼 구체적이다. 확정값과 임시값(NFR4.3·NFR4.4·NFR6.3)도 구분해 적었고 근거 없는 운영 장치는 넣지 않았다. 남은 것은 시험 사례 보강과 몇 가지 빈칸 확인이며 모두 Minor다.
