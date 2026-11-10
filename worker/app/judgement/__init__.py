"""판정 공급자 자리(CR3): AI가 쓴 제목 후보·설명 문장과 큰 후보의 재료를 참일 확률·고르기·점수로만 묻는다.

생성 흐름(`app.generation.flow`)이 이 패키지를 부르고, 이 패키지는 생성 흐름·후보 판정을 불러오지 않는다.
판정 요청에 넘기는 자료는 단순한 값(문자열·목록·사전)이다. 실제 공급자 어댑터(`app.judgement.openai_judge`,
`app.judgement.claude`)는 SDK를 불러오므로 여기서 다시 내보내지 않고, 만드는 쪽(큐 소비자 자식,
`app.consumer.child`)에서 직접 불러온다. 규칙은 `worker/docs/generation-judgement.md`에 있다.
"""
