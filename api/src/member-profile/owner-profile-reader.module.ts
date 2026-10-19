import { Module } from '@nestjs/common';
import { OwnerProfileReader } from './owner-profile-reader';

/**
 * 수신자 조회(#151)에 소유 회원 상태·공개 프로필을 주는 읽기 전용 모듈. 수신자 모듈이 imports에 넣어 OwnerProfileReader를 주입받는다.
 * 컨트롤러가 없어 HTTP 경로를 만들지 않으며, GitHub 연결 모듈을 가져오지 않는다. DB 연결은 앱의 DatabaseModule이 제공한다.
 */
@Module({ providers: [OwnerProfileReader], exports: [OwnerProfileReader] })
export class OwnerProfileReaderModule {}
