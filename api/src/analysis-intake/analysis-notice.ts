import { Injectable } from '@nestjs/common';
import { isDevelopmentOrTest } from '../common/node-env';
import { ApiError } from '../common/errors';
import { SYNTHETIC_REPOSITORY } from '../member-analysis/dev-member.service';

/** 합성 본문·판본·범위를 함께 관리한다. 실제 자료용 동의가 아니다. */
export const SYNTHETIC_NOTICE = Object.freeze({
  noticeRevision: 'catchu-synthetic-analysis-notice-v1',
  text: '[합성 시험 전용] 선정된 합성 저장소의 합성 커밋·PR·이슈를 분석하는 접수 시험입니다. 실제 GitHub 자료를 읽거나 외부 분석 제공자에게 보내지 않습니다. 이 동의는 실제 자료 처리 동의가 아닙니다.',
  scopeRevision: SYNTHETIC_REPOSITORY.allowedScopeRevision,
  allowedResourceTypes: Object.freeze(['COMMIT', 'PULL_REQUEST', 'ISSUE']),
  selectionReference: 'catchu:synthetic-selection:v1',
});
@Injectable()
export class AnalysisNoticeService {
  private readonly enabled = isDevelopmentOrTest(process.env) && process.env.DEV_LOGIN_ENABLED === 'true';
  current() {
    if (!this.enabled) throw new ApiError('CONSENT_REQUIRED');
    return { noticeRevision: SYNTHETIC_NOTICE.noticeRevision, text: SYNTHETIC_NOTICE.text };
  }
  scope(repositoryId: string, revision: string, sourceMode: string) {
    this.current();
    // 실제 자료용 설정이 없을 때 합성 판본으로 대체하지 않는다.
    if (sourceMode !== 'MOCK' || repositoryId !== SYNTHETIC_REPOSITORY.repositoryId ||
        revision !== SYNTHETIC_NOTICE.scopeRevision) throw new ApiError('CONSENT_REQUIRED');
    return { revision, repositoryId, allowedResourceTypes: [...SYNTHETIC_NOTICE.allowedResourceTypes],
      selectionReference: SYNTHETIC_NOTICE.selectionReference };
  }
}
