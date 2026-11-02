// 기존 접수 회귀용 C-03 시험 대역. 제품 모듈에 등록하지 않으며 U2 실제 소비 검증을 대신하지 않는다.
const { AnalysisIntakeService } = require('../../dist/analysis-intake/analysis-intake.service');
function bindSyntheticDailyLimit(app) {
  app.get(AnalysisIntakeService).dailyLimit = { consume: async (_member, _kind, _now, manager) => {
    if (!manager.queryRunner?.isTransactionActive) throw new Error('Daily limit must share intake transaction');
    return 'ALLOWED';
  } };
}
module.exports = { bindSyntheticDailyLimit };
