// 회원 탈퇴는 회원 행 하나를 지워 그 회원의 자료를 DB에서 함께 지운다(#387, 11월 범위 결정 「회원 탈퇴」).
// 회원에 딸린 자료와 그 자료에 딸린 행의 외래 키는 부모를 따라 지워지게 한다.
// 지우기 거부(NO ACTION)는 탈퇴를 막고, 참조 비우기(SET NULL)는 주인 없는 자료를 남기므로 쓰지 않는다.
export const deleteWithParent = { onDelete: 'CASCADE' } as const;
