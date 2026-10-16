import { Module } from '@nestjs/common';
import { MemberProfileController } from './member-profile.controller';
import { MemberProfileService } from './member-profile.service';
import { GitHubConnectionModule } from '../github-connection/github-connection.module';

@Module({ imports: [GitHubConnectionModule], controllers: [MemberProfileController], providers: [MemberProfileService] })
export class MemberProfileModule {}
