const assert = require('node:assert/strict');
const { test } = require('node:test');
const { decideDeadline, ANALYSIS_PROCESSING_DEADLINE_MS } = require('../../dist/analysis-deadline/analysis-deadline.service');

const submittedAt = new Date('2026-10-14T00:00:00.000Z');
const at = ms => new Date(submittedAt.getTime() + ms);
const active = { lifecycle: 'ACTIVE', submittedAt };

test('처리 시한은 접수 후 60분이며, 60분이 되는 순간부터 처리 중 요청을 닫는다', () => {
  assert.equal(ANALYSIS_PROCESSING_DEADLINE_MS, 60 * 60 * 1000);
  for (const processing of ['QUEUED', 'RUNNING', 'UNCERTAIN']) {
    const attempt = { processing, application: 'NOT_READY' };
    assert.equal(decideDeadline(active, attempt, at(ANALYSIS_PROCESSING_DEADLINE_MS - 1)), 'NONE');
    assert.equal(decideDeadline(active, attempt, at(ANALYSIS_PROCESSING_DEADLINE_MS)), 'PROCESSING_DEADLINE');
  }
});

test('반영 대기는 시한이 지나야, 반영 실패는 시한과 관계없이 닫는다', () => {
  const pending = { processing: 'SUCCEEDED', application: 'PENDING' };
  assert.equal(decideDeadline(active, pending, at(ANALYSIS_PROCESSING_DEADLINE_MS - 1)), 'NONE');
  assert.equal(decideDeadline(active, pending, at(ANALYSIS_PROCESSING_DEADLINE_MS)), 'APPLICATION_DEADLINE');
  assert.equal(decideDeadline(active, { processing: 'EMPTY', application: 'APPLY_FAILED' }, at(0)), 'APPLICATION_FAILED');
});

test('닫힌 요청은 판정하지 않고, 계약 전이에 없는 조합은 바꾸지 않는다', () => {
  const late = at(2 * ANALYSIS_PROCESSING_DEADLINE_MS);
  assert.equal(decideDeadline({ lifecycle: 'CLOSED', submittedAt }, { processing: 'QUEUED', application: 'NOT_READY' }, late), 'NONE');
  assert.equal(decideDeadline({ lifecycle: 'CLOSED', submittedAt }, { processing: 'FAILED', application: 'APPLY_FAILED' }, late), 'NONE');
  for (const attempt of [
    { processing: 'SUCCEEDED', application: 'APPLIED' },
    { processing: 'SUCCEEDED', application: 'NOT_READY' },
    { processing: 'SUCCEEDED', application: 'APPLYING' },
    { processing: 'SUCCEEDED', application: 'RECOVERING' },
  ]) assert.equal(decideDeadline(active, attempt, late), 'UNEXPECTED', `${attempt.processing}/${attempt.application}`);
});
