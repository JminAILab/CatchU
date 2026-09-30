import { ValidateBy } from 'class-validator';
import { isMemberId } from './access-token.service';

/** 입력값을 보정하지 않고 기존 회원 ID 조건을 공통 ValidationPipe로 검사한다. */
export class DevLoginDto {
  @ValidateBy({ name: 'isMemberId', validator: { validate: isMemberId } })
  memberId!: string;
}
