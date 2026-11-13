"""PDF 글 추출 소비자(U8, 기능 명세 W2 worker·BR3.1~BR3.7·BR7.4).

`pdf-extraction-requests` 큐의 `PdfExtract`를 분석 소비자와 독립인 별도 Worker가 받아, 작업마다 자식
프로세스 하나에서 원본을 읽고(`reader`) pypdf로 쪽별 글을 뽑은 뒤(`extract`) 결과를 `worker-messages`
큐에 `PdfExtractionResult`로 넣고 수신 확인을 기록한다(`worker`). 설정은 `settings`, 메시지 모양은
`envelope`, 자식 진입점은 `child`다. 10월 분석 소비자의 자식 틀(`app.consumer.children`·`frames`)과
수신 확인 조회(`app.consumer.receipts`)를 재사용한다.
"""
