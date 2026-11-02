import { ForbiddenException, Injectable } from '@nestjs/common';
import { isDevelopmentOrTest } from '../common/node-env';
import { ApiError } from '../common/errors';
import { SYNTHETIC_REPOSITORY } from '../member-analysis/dev-member.service';

export interface AnalysisNotice { readonly noticeRevision: string; readonly text: string }

/** 합성 본문·판본·범위를 함께 관리한다. 실제 자료용 동의가 아니다. */
export const SYNTHETIC_NOTICE = Object.freeze({
  noticeRevision: 'catchu-synthetic-analysis-notice-v1',
  text: '[합성 시험 전용] 선정된 합성 저장소의 합성 커밋·PR·이슈를 분석하는 접수 시험입니다. 실제 GitHub 자료를 읽거나 외부 분석 제공자에게 보내지 않습니다. 이 동의는 실제 자료 처리 동의가 아닙니다.',
  scopeRevision: SYNTHETIC_REPOSITORY.allowedScopeRevision,
  allowedResourceTypes: Object.freeze(['COMMIT', 'PULL_REQUEST', 'ISSUE']),
  selectionReference: 'catchu:synthetic-selection:v1',
});

/**
 * 실제 자료용 고지(#322 원문, #424의 2026-10-30 팀장 확정 v2). 한 원소가 한 줄이고 빈 원소가 문단 구분이다.
 * 12월 공개판 기준이라 설명하는 기능의 현재 구현 여부에 맞춰 고치지 않는다. 문구를 바꾸면 판본도 함께
 * 바꾸고 반영 PR에서 팀장 승인을 받는다(docs/analysis-intake.md 「실제 자료용 고지와 고지 선택」).
 */
export const REAL_NOTICE: AnalysisNotice = Object.freeze({
  noticeRevision: 'catchu-real-analysis-notice-v2',
  text: [
    '[CatchU 저장소 분석 안내]',
    '',
    '이 동의는 지금 요청하는 분석 한 번에만 쓰입니다. 같은 저장소를 다시 분석할 때도 그때 다시 동의를 받습니다.',
    '',
    '1. 읽는 자료',
    '직접 등록하신 공개 저장소 하나를 GitHub API로 읽고, 그 안에서 연결한 GitHub 계정이 작성자로 기록된 커밋을 찾습니다. 지원 조건이나 한도에 맞지 않는 저장소는 분석을 시작하기 전에 이유를 알려 드립니다.',
    '읽는 것은 기본 브랜치의 최근 커밋, 최근 PR과 그 PR의 커밋 목록, 최근 이슈입니다. 여기에는 같은 저장소의 다른 사람이 쓴 제목·본문·커밋 메시지도 들어 있습니다. 변경 내용은 연결한 GitHub 계정이 작성자로 기록된 커밋을 읽고, 같은 작업인지 가려야 할 때만 다른 사람 커밋의 변경 내용도 읽습니다. 다른 사람의 변경 내용은 외부 AI 서비스로 보내지 않습니다. 저장소를 통째로 내려받지 않으며, GitHub 연결은 공개 정보만 읽는 권한으로 합니다.',
    '',
    '2. 만드는 것',
    '읽은 기록에서 본인 작업을 묶고 근거 링크를 붙여 Catch로 만듭니다. Catch마다 짧은 설명 초안, 생각해볼 질문, 제목을 만듭니다. 설명과 질문은 확인한 변경만 넣은 정해진 문장으로 만듭니다.',
    '',
    '3. 외부 AI 서비스로 보내는 자료',
    '설명 초안, 질문, 제목을 만들 때 Anthropic, PBC(미국)의 AI 서비스를 씁니다.',
    '- 보내는 것: 본인 커밋에서 추가·삭제된 줄과 바뀐 파일의 경로·상태',
    '- 보내지 않는 것: 커밋 메시지, PR과 이슈의 글, 다른 계정의 커밋, 비밀 파일(.env 등)의 경로와 내용',
    '- 비밀값과 개인정보: 이메일, 접근 토큰처럼 보이는 값은 자동으로 가린 뒤 보냅니다. 자동 가림이 모든 값을 찾지는 못하므로, 비밀값이 커밋에 들어 있는 저장소는 분석을 요청하지 않는 것이 좋습니다.',
    '- 보내는 때와 방법: 분석을 처리하는 동안 암호화된 연결(HTTPS)로 보냅니다.',
    '- 처리 위치와 보관: 미국에서 처리하고 저장합니다. Anthropic은 받은 자료와 만든 결과를 AI 학습에 쓰지 않고 최대 30일 안에 지웁니다. 다만 Anthropic의 이용 정책 위반으로 자동 표시되면 최대 2년, 법이 요구하면 그 기간 동안 보관될 수 있습니다.',
    '- Anthropic 연락처: privacy@anthropic.com',
    '- 동의하지 않으면: 이번 분석은 접수되지 않습니다. 이미 만든 Catch와 다른 기능은 그대로 쓸 수 있습니다.',
    '',
    '4. CatchU에 남는 것',
    '- 읽은 GitHub 원자료는 분석이 끝나면 지웁니다.',
    '- 새 Catch는 미공개 상태로 시작하며, 공개 여부는 본인이 정합니다. 미공개 Catch도 발행할 때 고를 수 있고, 고르면 공개로 바뀝니다. 받은 사람과 AI 요약·질의응답은 발행한 내용만 봅니다. 본인의 Claude 연결은 동의를 받아 미공개 Catch도 읽습니다.',
    '- Catch를 하나씩 지우는 기능은 없습니다. 쓰지 않을 Catch는 미공개로 두세요.',
    '- 같은 저장소를 다시 분석할 수 있습니다. 이미 있던 작업은 기존 Catch를 처음 만든 내용과 작성하신 설명 그대로 두고, 새로 찾은 작업만 Catch로 더합니다. 진행 중이거나 실패하면 기존 Catch를 그대로 둡니다. 이미 발행한 발행본은 발행 당시 내용을 유지합니다.',
    '- 탈퇴하면 Catch와 분석 결과를 지체 없이 지웁니다. 법령상 보관해야 하는 항목이 있으면 그 항목만 정해진 기간 동안 따로 보관합니다.',
    '',
    '5. GitHub 연결 해제',
    'CatchU에서 GitHub 연결을 해제하면 저장해 둔 GitHub 접근 정보를 지웁니다. GitHub에 남은 앱 승인은 GitHub 설정에서 따로 취소할 수 있습니다.',
  ].join('\n'),
});

@Injectable()
export class AnalysisNoticeService {
  private readonly enabled = isDevelopmentOrTest(process.env) && process.env.DEV_LOGIN_ENABLED === 'true';
  // 실제 회원에게 줄 현재 판본. 없으면 합성 고지로 대신하지 않는다.
  private readonly realNotice: AnalysisNotice | null = REAL_NOTICE;
  /** 개발 회원의 합성 고지. 개발 환경과 개발 로그인을 함께 켠 때만 준다. */
  current() {
    if (!this.enabled) throw new ForbiddenException();
    return { noticeRevision: SYNTHETIC_NOTICE.noticeRevision, text: SYNTHETIC_NOTICE.text };
  }
  /** 실제 회원의 고지. 개발 로그인 설정과 관계없다. */
  real() {
    if (!this.realNotice) throw new ApiError('CONSENT_REQUIRED');
    return { noticeRevision: this.realNotice.noticeRevision, text: this.realNotice.text };
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
