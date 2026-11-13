# NC3 NFR4.1 사람 대조 (2026-11-11, 측정 DB catchu-nc3-measure-db)

다른 Claude 세션이 스크립트로 사실 66줄을 GitHub 커밋 상세와 자동 대조한 표를 그대로 옮겼다. 원본은 그 세션의 임시 폴더(`…/3eb63b98-…/scratchpad/nc3-check/nfr4-1-draft.md`)에 있었다. 짧은 맞춤 4줄의 줄 위치 확인과 같은 폴더 이름 바꿈 판단도 그 세션이 했다. 팀장은 화면 링크와 GitHub로 표본 38번·65번을 확인했다.

- 대상: TheMe LIVE 분석(후보 46, Catch 46) 중 「다시 볼 곳」 사실이 붙은 Catch 20개의 사실 66줄 전부
- 방법: 사실마다 GitHub 커밋 상세 응답(gh api)과 맞춤. 줄 글자는 적지 않음
- 판정 기준: 모든 커밋이 ljm0850 본인 커밋인가, 다시 고침은 앞 커밋이 넣은 줄을 뒤 커밋이 지웠고 앞뒤 순서가 맞는가, 옮김·확장자 바꿈은 GitHub 이름 바꿈(renamed) 기록이 있는가(BR3.2·BR3.3)
- 결과: 맞음 66 / 전체 66, 남의 일을 본인 것으로 붙인 줄 0, 틀린 줄 0(합격 기준: 0줄, 2줄 이하)
- 대조 세션 덧붙임: 맞춘 줄이 6~10자로 짧은 다시 고침 4줄(12·14·26·38)도 파일 안 줄 위치가 같다(차이 0~1). 같은 폴더 이름 바꿈 2줄(3·65)은 BR3.2대로 옮김이 맞다.

| # | 판정 | 종류 | Catch | 경로 | 커밋 | 근거 |
|---|---|---|---|---|---|---|
| 1 | 맞음 | 다시 고침 | ljm - github | README.md | f358354, cd9f5d2 | 맞춘 줄 1개, 가장 긴 줄 54자 |
| 2 | 맞음 | 다시 고침 | ljm - github | README.md | ede7772, 442e1a4 | 맞춘 줄 1개, 가장 긴 줄 97자 |
| 3 | 맞음 | 옮김 | ljm - github | readme_asset/파이어 베이스 이미지 조회.md → readme_asset/firebase_problem.md | cd9f5d2 | 한 커밋 안의 이름 바꿈(renamed) |
| 4 | 맞음 | 다시 고침 | README update | README.md | 9cef43a, eec3b32 | 맞춘 줄 8개, 가장 긴 줄 88자 |
| 5 | 맞음 | 다시 고침 | feat : 카카오 지도 api #S07P31C203- | Front/theme/src/API/rest.ts | 5670519, 4de7096 | 맞춘 줄 1개, 가장 긴 줄 52자 |
| 6 | 맞음 | 다시 고침 | feat : 카카오 지도 api #S07P31C203- | Front/theme/src/components/articles/CreateArticlePage.vue | 9b5b4c4, f0e6072 | 맞춘 줄 1개, 가장 긴 줄 29자 |
| 7 | 맞음 | 다시 고침 | feat : 카카오 지도 api #S07P31C203- | Front/theme/src/store/feed/feed.ts | f0e6072, 936209c | 맞춘 줄 1개, 가장 긴 줄 29자 |
| 8 | 맞음 | 확장자 바꿈 | feat : 카카오 지도 api #S07P31C203- | Front/theme/src/store/index.ts → Front/theme/src/store/index.js | 0e24f9f | 한 커밋 안의 이름 바꿈(renamed) |
| 9 | 맞음 | 다시 고침 | feat : 게시글 등록 이미지 리사이징 #S07P31 | Front/theme/src/store/firebase/firebase.ts | ba6bba8, d42d9a3 | 맞춘 줄 1개, 가장 긴 줄 78자 |
| 10 | 맞음 | 다시 고침 | fix : 게시글 모달창 정보 갱신 늦는거 아마 해결 | Front/theme/src/API/rest.ts | 6bb09e6, c61c6c2 | 맞춘 줄 2개, 가장 긴 줄 53자 |
| 11 | 맞음 | 다시 고침 | 버그 확인 | Front/theme/src/components/articles/ArticleListModal.vue | a001ab8, 5c57023 | 맞춘 줄 3개, 가장 긴 줄 38자 |
| 12 | 맞음 | 다시 고침 | 버그 확인 | Front/theme/src/components/articles/ArticleItem.vue | a001ab8, 7258ae8 | 맞춘 줄 1개, 가장 긴 줄 10자 |
| 13 | 맞음 | 다시 고침 | 버그 확인 | Front/theme/src/components/articles/ArticleList.vue | 5c57023, 7258ae8 | 맞춘 줄 1개, 가장 긴 줄 24자 |
| 14 | 맞음 | 다시 고침 | 버그 확인 | Front/theme/src/components/articles/ArticleListModal.vue | a001ab8, 7258ae8 | 맞춘 줄 1개, 가장 긴 줄 10자 |
| 15 | 맞음 | 다시 고침 | 버그 확인 | Front/theme/src/store/feed/feed.ts | 5c57023, 7258ae8 | 맞춘 줄 5개, 가장 긴 줄 43자 |
| 16 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/ScrollObserver.vue | de7950a, 64dc75b | 맞춘 줄 3개, 가장 긴 줄 67자 |
| 17 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/theme/CreateThemeModal.vue | 5557b93, 64dc75b | 맞춘 줄 5개, 가장 긴 줄 62자 |
| 18 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/main/mainPageComponents/NewFeed.vue | de7950a, f9750c3 | 맞춘 줄 5개, 가장 긴 줄 31자 |
| 19 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/store/feed/feed.ts | de7950a, f9750c3 | 맞춘 줄 3개, 가장 긴 줄 47자 |
| 20 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/main/mainPageComponents/NewFeed.vue | f9750c3, 6d3a26b | 맞춘 줄 5개, 가장 긴 줄 34자 |
| 21 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/main/mainPageComponents/NewFeed.vue | de7950a, 6d3a26b | 맞춘 줄 3개, 가장 긴 줄 45자 |
| 22 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/store/feed/feed.ts | f9750c3, 6d3a26b | 맞춘 줄 1개, 가장 긴 줄 31자 |
| 23 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/theme/CreateThemeModal.vue | 5557b93, 1577235 | 맞춘 줄 2개, 가장 긴 줄 107자 |
| 24 | 맞음 | 다시 고침 | feat : 이모지 체크 임시 추가 #S07P31C20 | Front/theme/src/components/theme/CreateThemeModal.vue | 64dc75b, 1577235 | 맞춘 줄 1개, 가장 긴 줄 46자 |
| 25 | 맞음 | 다시 고침 | fix : 내 프로필 여부 로직 변경 | Front/theme/src/components/profile/profilePageComponents/IntroduceUser.vue | 4670a71, 542f0af | 맞춘 줄 3개, 가장 긴 줄 20자 |
| 26 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/components/theme/AddThemeText.vue | 5c5c7ca, 48d1f08 | 맞춘 줄 1개, 가장 긴 줄 9자 |
| 27 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/components/theme/PlusThemePage.vue | 5c5c7ca, 48d1f08 | 맞춘 줄 2개, 가장 긴 줄 51자 |
| 28 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/store/themes/themes.ts | 5c5c7ca, 48d1f08 | 맞춘 줄 2개, 가장 긴 줄 42자 |
| 29 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/components/theme/CreateThemeModal.vue | eade6c4, 2ec5e56 | 맞춘 줄 3개, 가장 긴 줄 92자 |
| 30 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/components/theme/CreateThemeModal.vue | 5c5c7ca, 2ec5e56 | 맞춘 줄 1개, 가장 긴 줄 17자 |
| 31 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/components/theme/CreateThemeModal.vue | 2ec5e56, c45b6dd | 맞춘 줄 7개, 가장 긴 줄 84자 |
| 32 | 맞음 | 다시 고침 | fix : 테마 등록시 challenge 변경 #S07 | Front/theme/src/components/theme/PlusThemePage.vue | 48d1f08, 9c83689 | 맞춘 줄 1개, 가장 긴 줄 48자 |
| 33 | 맞음 | 다시 고침 | feat: 사진 캐러셀 적용, ArticleDetail | Front/theme/src/components/articles/ArticleDetail.vue | 25403fb, 94f73f8 | 맞춘 줄 1개, 가장 긴 줄 13자 |
| 34 | 맞음 | 다시 고침 | style: 테마 생성 모달 css #S07P31C20 | Front/theme/src/components/theme/PlusThemePage.vue | ea1afd3, 9fe0fbc | 맞춘 줄 1개, 가장 긴 줄 26자 |
| 35 | 맞음 | 다시 고침 | style: 테마 생성 모달 css #S07P31C20 | Front/theme/src/components/articles/CreateArticlePage.vue | 9fe0fbc, 1ce2abc | 맞춘 줄 2개, 가장 긴 줄 18자 |
| 36 | 맞음 | 다시 고침 | feat: 게시물 생성 카카오 맵 구현 #S07P31C | Front/theme/src/components/articles/CreateArticlePage.vue | 78ac1de, 94a21af | 맞춘 줄 1개, 가장 긴 줄 17자 |
| 37 | 맞음 | 다시 고침 | feat: 게시물 생성 카카오 맵 구현 #S07P31C | Front/theme/src/store/feed/feed.ts | 78ac1de, 94a21af | 맞춘 줄 3개, 가장 긴 줄 144자 |
| 38 | 맞음 | 다시 고침 | feat: 게시물 생성 카카오 맵 구현 #S07P31C | Front/theme/src/store/feed/feed.ts | 94a21af, 347368c | 맞춘 줄 1개, 가장 긴 줄 6자 |
| 39 | 맞음 | 다시 고침 | fix: 테마 검색 인풋값 처리 방식 변화 #S07P3 | Front/theme/public/index.html | 052665b, c05dd4b | 맞춘 줄 3개, 가장 긴 줄 118자 |
| 40 | 맞음 | 다시 고침 | fix: 테마 검색 인풋값 처리 방식 변화 #S07P3 | Front/theme/src/components/KakaoMapTest.vue | c05dd4b, 256cbfb | 맞춘 줄 4개, 가장 긴 줄 72자 |
| 41 | 맞음 | 다시 고침 | fix: 테마 검색 인풋값 처리 방식 변화 #S07P3 | Front/theme/src/components/map/KakaoMap.vue | c05dd4b, 256cbfb | 맞춘 줄 5개, 가장 긴 줄 73자 |
| 42 | 맞음 | 다시 고침 | fix: 테마 검색 인풋값 처리 방식 변화 #S07P3 | Front/theme/src/components/KakaoMapTest.vue | 256cbfb, 3eeac45 | 맞춘 줄 1개, 가장 긴 줄 56자 |
| 43 | 맞음 | 다시 고침 | fix: 테마 검색 인풋값 처리 방식 변화 #S07P3 | Front/theme/src/components/map/KakaoMap.vue | c05dd4b, 3eeac45 | 맞춘 줄 15개, 가장 긴 줄 60자 |
| 44 | 맞음 | 다시 고침 | fix: 테마 검색 인풋값 처리 방식 변화 #S07P3 | Front/theme/src/components/map/KakaoMap.vue | 256cbfb, 3eeac45 | 맞춘 줄 7개, 가장 긴 줄 67자 |
| 45 | 맞음 | 다시 고침 | feat: 로그아웃  #S07P31C203-91 | Front/theme/src/components/theme/CreateThemeModal.vue | c39fded, ec93b2c | 맞춘 줄 43개, 가장 긴 줄 92자 |
| 46 | 맞음 | 다시 고침 | feat: 로그아웃  #S07P31C203-91 | Front/theme/src/components/theme/PlusThemePage.vue | c39fded, ec93b2c | 맞춘 줄 4개, 가장 긴 줄 104자 |
| 47 | 맞음 | 다시 고침 | feat: 로그아웃  #S07P31C203-91 | Front/theme/src/API/rest.ts | c39fded, 0dcfaf7 | 맞춘 줄 2개, 가장 긴 줄 52자 |
| 48 | 맞음 | 다시 고침 | feat: 로그아웃  #S07P31C203-91 | Front/theme/src/components/theme/AddThemeText.vue | ec93b2c, 0dcfaf7 | 맞춘 줄 3개, 가장 긴 줄 57자 |
| 49 | 맞음 | 다시 고침 | feat: 로그아웃  #S07P31C203-91 | Front/theme/src/components/theme/CreateThemeModal.vue | ec93b2c, 0dcfaf7 | 맞춘 줄 19개, 가장 긴 줄 102자 |
| 50 | 맞음 | 다시 고침 | feat: 로그아웃  #S07P31C203-91 | Front/theme/src/store/themes/themes.ts | 5f6e877, 0dcfaf7 | 맞춘 줄 10개, 가장 긴 줄 102자 |
| 51 | 맞음 | 다시 고침 | feat: theme,user axios 처리 #S07 | Front/theme/src/store/feed/feed.ts | e566461, c550a25 | 맞춘 줄 11개, 가장 긴 줄 84자 |
| 52 | 맞음 | 다시 고침 | feat: theme,user axios 처리 #S07 | Front/theme/src/store/user/user.ts | e566461, c550a25 | 맞춘 줄 2개, 가장 긴 줄 43자 |
| 53 | 맞음 | 옮김 | feat: theme,user axios 처리 #S07 | Front/theme/src/store/acounts/accounts.ts → Front/theme/src/store/user/user.ts | e566461 | 한 커밋 안의 이름 바꿈(renamed) |
| 54 | 맞음 | 다시 고침 | fix: firebase import 형식으로 할 때  | Front/theme/src/components/FirebaseTest.vue | 490d704, f781277 | 맞춘 줄 17개, 가장 긴 줄 69자 |
| 55 | 맞음 | 다시 고침 | fix: firebase import 형식으로 할 때  | Front/theme/src/store/firebase/firebase.ts | 490d704, f781277 | 맞춘 줄 1개, 가장 긴 줄 46자 |
| 56 | 맞음 | 다시 고침 | feat: USER api axios #S07P31C2 | Front/theme/src/store/acounts/accounts.ts | 5448c0c, 672cd66 | 맞춘 줄 1개, 가장 긴 줄 19자 |
| 57 | 맞음 | 다시 고침 | feat: USER api axios #S07P31C2 | Front/theme/src/store/acounts/accounts.ts | 672cd66, 92d7a17 | 맞춘 줄 1개, 가장 긴 줄 14자 |
| 58 | 맞음 | 다시 고침 | feat: USER api axios #S07P31C2 | Front/theme/src/store/firebase/firebase.ts | 672cd66, 92d7a17 | 맞춘 줄 6개, 가장 긴 줄 62자 |
| 59 | 맞음 | 옮김 | feat : F01 axios요청 함수 | Front/theme/src/store/accounts.ts → Front/theme/src/store/acounts/accounts.ts | 4bcc903 | 한 커밋 안의 이름 바꿈(renamed) |
| 60 | 맞음 | 옮김 | feat : F01 axios요청 함수 | Front/theme/src/store/articles.ts → Front/theme/src/store/articles/articles.ts | 4bcc903 | 한 커밋 안의 이름 바꿈(renamed) |
| 61 | 맞음 | 옮김 | feat : F01 axios요청 함수 | Front/theme/src/store/comments.ts → Front/theme/src/store/comments/comments.ts | 4bcc903 | 한 커밋 안의 이름 바꿈(renamed) |
| 62 | 맞음 | 옮김 | feat : F01 axios요청 함수 | Front/theme/src/store/follow_like.ts → Front/theme/src/store/follow_like/follow_like.ts | 4bcc903 | 한 커밋 안의 이름 바꿈(renamed) |
| 63 | 맞음 | 옮김 | feat : F01 axios요청 함수 | Front/theme/src/store/report.ts → Front/theme/src/store/report/report.ts | 4bcc903 | 한 커밋 안의 이름 바꿈(renamed) |
| 64 | 맞음 | 다시 고침 | feat : 하단 네브바 +버튼 토글 | Front/theme/src/App.vue | a4531a9, 33586e0 | 맞춘 줄 1개, 가장 긴 줄 54자 |
| 65 | 맞음 | 옮김 | feat : 하단 네브바 +버튼 토글 | Front/theme/src/components/navbar/NavBar.vue → Front/theme/src/components/navbar/BottomNavBar.vue | 33586e0 | 한 커밋 안의 이름 바꿈(renamed) |
| 66 | 맞음 | 다시 고침 | feat: 하단 네비게이션 바 설정 | Front/theme/src/components/navbar/NavBar.vue | cfe20f4, 771b09c | 맞춘 줄 2개, 가장 긴 줄 53자 |
