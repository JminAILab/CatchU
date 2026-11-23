## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T05:41:12Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u4-privacy-policy/functional-design/frontend-components.md > 시험과 안내 (`web/test/privacy-policy.test.mjs` 행) 및 functional-spec.md > 원문 출처와 대조 | 설계는 시험에서 출처 주석과 `SOURCE_SHA256`만 바꾸고 "대조 방식은 그대로"라고 적었다. 그러나 지금 시험 94행은 목록 항목 수를 `[1, 9, 2, 14, 7, 8, 33]`로 고정해 두었고(92행 주석도 「목록 8묶음 33항목」), 사본의 `- ` 줄은 지금 정확히 33개다. C5가 `<li>` 하나를 더하면 34개가 되어, 설계대로만 고치면 시험이 실패한다. 설계가 이 고정 숫자를 바꿀 곳으로 적지 않았다. | 시험 94행의 항목 수 33을 34로, 92행 주석의 「33항목」도 34로 고친다고 `frontend-components.md`의 시험 행과 `functional-spec.md`의 대조 절에 적는다. 새 대조 방식이 아니라 기존 숫자 갱신이라고 밝힌다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u4-privacy-policy/functional-design/functional-spec.md > 확정 문구 C5와 실패와 경계 | C5의 `○○`는 날짜가 정해져야 채워지는데, 날짜가 들어간 뒤의 사본 SHA-256 값은 설계에 적을 수 없고 코드 생성이 계산해야 한다. 설계는 「날짜가 정해지기 전에는 코드 생성을 시작하지 않는다」로 막아 두었으나, 날짜를 모르는 채 시험의 SHA-256 값을 채우는 임시 상태를 어떻게 다룰지는 없다. | 코드 생성이 날짜를 받은 뒤 사본을 먼저 쓰고 SHA-256을 계산해 시험에 넣는 순서를 한 줄로 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `shasum -a 256 web/src/features/privacy/privacy-policy.md` | `83f9a28e...86c5d` | 설계에 적힌 지금 사본 SHA-256과 같다 |
| C1~C4 「지금 글」과 사본 13·23·24·56행 대조 | 글자 일치, 줄 번호 일치 | 지금 글 칸은 사본과 한 글자도 다르지 않다 |
| C5 위치 확인(83행 시행일 줄, 84행 변경 약속 줄) | 일치 | 「바로 아래」 삽입 위치가 맞고, 사본은 84행이라 85행이 된다는 설명이 맞다 |
| 새 글과 질의응답 Q1 A·Q2 A·Q3 B·Q4(A 변형)·Q5 C 대조 | 일치 | C1~C5가 답과 같다. C5는 Q4 답의 정정 문장대로다 |
| `wc -l` 및 `- ` 줄 수 | 84줄, 33항목 | 위 Major의 근거 |
| 프리셋이 들어갈 곳 점검(1번 표, 2번, 4번, 5번 전체) | 빠진 곳 없음 | 4번 AWS 행의 「정보 전체」는 이미 프리셋을 포함하고, 4번 외부 AI 절은 ADR-007대로 바꾸지 않는 것이 맞다. C3의 「이미 만든 발행본에는 남습니다」는 FR2.11과 맞는다 |

### Summary

확정 문구 C1~C5는 지금 사본·질의응답·상류 요구사항과 글자 수준으로 맞고, SHA-256과 줄 번호도 맞다. 다만 시험의 고정 항목 수(33)가 C5로 34가 되는 점을 설계가 빠뜨려, 설계대로만 하면 시험이 실패한다. 이는 Major 하나이고 한도 안이라 READY로 보되, 고쳐 두기를 권한다.
