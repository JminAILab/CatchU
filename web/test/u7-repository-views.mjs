// 기존 Node test·TypeScript·React SSR로 실제 JSX의 접근성/조건별 문구를 검사한다.
// CSS 폭·브라우저 초점은 별도의 실제 화면 검사 증거로 남긴다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createHookHarness } from './u7-hooks.mjs';

const src = new URL('../src/', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/repository-management.tsx')) return { url: new URL('./u7-hooks.mjs', import.meta.url).href, shortCircuit: true };
    if (specifier === 'next/link') return next('next/link.js', context);
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith(src.href))) {
      const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), src) : new URL(specifier, context.parentURL);
      for (const extension of ['', '.ts', '.tsx']) {
        const candidate = new URL(base.href + extension);
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {};' };
    if (url.endsWith('/assets-connected.tsx')) return { format: 'module', shortCircuit: true, source: 'export const AssetsConnected = () => null;' };
    if (!url.startsWith(src.href) || !url.endsWith('.tsx')) return next(url, context);
    let source = readFileSync(new URL(url), 'utf8');
    // 순수 표시 함수는 제품 export를 늘리지 않고 시험에서 SSR에 연결한다.
    if (url.endsWith('/repository-management.tsx')) source += '\nexport { AreaMessage, ConnectedList };';
    if (url.endsWith('/repository-management-preview.tsx')) source += '\nexport { repositoryApi, requestApi, catchApi };';
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
    }).outputText };
  },
});
const { AnalysisRequestSection, RetryRequest } = await import('../src/features/analysis-request/analysis-request-section.tsx');
const { RepositoryRegistrationForm } = await import('../src/features/repository-management/repository-registration-form.tsx');
const { RepositoryManagement, AreaMessage, ConnectedList } = await import('../src/features/repository-management/repository-management.tsx');
const preview = await import('../src/features/repository-management/repository-management-preview.tsx');
hooks.deregister();

const repository = { repositoryId: '123', ownerLogin: 'owner', name: 'repo', url: 'https://github.com/owner/repo', allowedScopeRevision: 'scope' };
const ready = value => ({ state: 'ready', value });
const base = { repositories: ready([repository]), notice: ready({ noticeRevision: 'notice', text: '<script>untrusted</script>\n고지' }),
  selectedId: '123', phase: 'editing', retryAt: null, pendingRepositoryId: null, pendingRetry: false, message: null };
const store = (snapshot = base) => ({ subscribe: () => () => {}, getSnapshot: () => snapshot, retryWaitSeconds: () => 3,
  canSubmit: () => snapshot.selectedId !== null, canResend: () => true, canRetry: () => true });
const markup = (component, props) => renderToStaticMarkup(createElement(component, props));
const latest = { requestId: 'request', repositoryId: '123', submittedAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z',
  lifecycle: 'CLOSED', processing: 'SUCCEEDED', application: 'APPLIED', registeredCatchIds: ['catch'], ownerResultsReady: true,
  retryAllowed: false, failures: [], ownCommitObservation: 'FOUND', observedOwnCommitCount: 1, collectionLimitNotes: [] };

test('JSX 등록 필드는 보이는 레이블·오류 연결·요청 중 비활성화를 유지한다', () => {
  for (const [phase, failed, message] of [['editing',true,'주소 확인 실패'],['registering',false,null],['registered',false,'새로 동의해 주세요']]) {
    const html = markup(RepositoryRegistrationForm, { store: store({ url: repository.url, phase, failed, message }), disabled: false });
    assert.match(html, /공개 GitHub 저장소 주소/); assert.match(html, /등록만으로 분석이 시작되지는 않습니다/);
    if (failed) { assert.match(html, /aria-invalid="true"/); assert.match(html, /aria-describedby="[^"]+-message"/); assert.match(html, /role="alert"/); }
    if (phase === 'registering') assert.match(html, /disabled=""[^>]*aria-busy="true"/);
  }
});
test('JSX 현재 고지는 텍스트로 가리고 등록 선택·새 동의 버튼을 분리한다', () => {
  const html = markup(AnalysisRequestSection, { store: store() });
  assert.match(html, /type="radio"/); assert.match(html, /동의하고 분석 요청/);
  assert.match(html, /&lt;script&gt;untrusted&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(markup(AnalysisRequestSection, { store: store({ ...base, selectedId: null }) }), /disabled=""/);
});
test('JSX 목록·고지 조회 실패와 미연결은 분석 실패·빈 목록으로 표시하지 않는다', () => {
  for (const state of ['loading','failed','unavailable']) {
    const html = markup(AnalysisRequestSection, { store: store({ ...base, repositories: { state }, notice: { state } }) });
    assert.doesNotMatch(html, /type="radio"/); assert.match(html, /불러오|지금은/);
  }
  assert.match(markup(AnalysisRequestSection, { store: store({ ...base, repositories: ready([]) }) }), /저장소가 없습니다/);
  assert.match(markup(AnalysisRequestSection, { store: store({ ...base, repositories: { state: 'unavailable', code: 'GITHUB_CONNECTION_REQUIRED' } }) }), /GitHub 연동/);
  for (const connectionNotice of ['CHECKING','DISCONNECTED','REAUTH_REQUIRED']) {
    const html = markup(AnalysisRequestSection, { store: store(), connectionNotice });
    assert.doesNotMatch(html, /동의하고 분석 요청/); assert.match(html, /GitHub/);
  }
});
test('JSX 응답 불명·빈도 제한은 대상과 같은 요청 버튼을 유지한다', () => {
  for (const phase of ['submitting','unknown','limited']) for (const pendingRetry of [false,true]) {
    const html = markup(AnalysisRequestSection, { store: store({ ...base, phase, pendingRepositoryId: '123', pendingRetry,
      retryAt: phase === 'limited' ? 1 : null, message: { tone: 'error', text: '합성 안내', action: 'github' } }), connectionNotice: 'DISCONNECTED' });
    assert.match(html, /owner\/repo/); assert.match(html, /role="alert"/);
    assert.match(html, phase === 'submitting' ? /요청 중/ : /같은 요청 다시 보내기/);
    if (phase === 'limited') assert.match(html, /3초/);
  }
  assert.match(markup(AnalysisRequestSection, { store: store({ ...base, phase: 'unknown', pendingRepositoryId: 'missing' }) }), /저장소 missing/);
});
test('JSX 허용된 실패만 재요청 고지를 그리며 정상·진행 상태를 구분한다', () => {
  const target = { repositoryId: '123', requestId: 'r', retryAllowed: true };
  assert.equal(markup(RetryRequest, { store: store(), target: { ...target, retryAllowed: false } }), '');
  assert.match(markup(RetryRequest, { store: store(), target }), /이전 요청의 동의는 다시 쓰지 않습니다/);
  assert.match(markup(RetryRequest, { store: store(), target, connectionNotice: 'DISCONNECTED' }), /연동을 확인/);
  for (const repositories of [ready([]), { state: 'failed' }]) assert.match(markup(RetryRequest, { store: store({ ...base, repositories }), target }), /목록/);
  for (const pendingRetry of [true,false]) assert.match(markup(RetryRequest, { store: store({ ...base, phase: 'unknown', pendingRepositoryId: '123', pendingRetry }), target }), /결과/);
});
test('JSX 상단 이력은 조회 실패·NONE·부분 결과·Catch 보기·실패 재요청을 분리한다', () => {
  for (const connected of [{ state:'loading' }, { state:'checking' }, { state:'failed' }, { state:'failed', github:'DISCONNECTED' }, { state:'failed', github:'REAUTH_REQUIRED' }, ready([])]) {
    const html = markup(ConnectedList, { connected, expanded: new Set(), titleId: 't' });
    assert.doesNotMatch(html, /Catch 보기/);
    if (connected.state === 'failed') assert.match(html, /분석이 실패한 것은 아닙니다/);
  }
  for (const state of [latest, { ...latest, retryAllowed: true }, { ...latest, retryAllowed: true, processing:'FAILED', ownerResultsReady:false, registeredCatchIds:[] },
    { ...latest, processing:'EMPTY', registeredCatchIds:[], ownCommitObservation:'NONE', observedOwnCommitCount:0 }]) {
    const html = markup(ConnectedList, { connected:ready([{ repositoryId:'123', displayName:null, latest:state }]), expanded:new Set(['123']), titleId:'t', renderRetry:() => '합성 재요청' });
    assert.match(html, /마지막 갱신/); assert.match(html, /등록 목록에서/);
    if (state.retryAllowed) assert.match(html, /합성 재요청/);
    else if (state.registeredCatchIds.length) assert.match(html, /이 저장소 Catch 보기/);
    else assert.match(html, /확인한 범위에서 본인 기록이 없습니다/);
  }
  for (const github of [{state:'loading'},{state:'failed'},ready('CONNECTED'),ready('DISCONNECTED'),ready('REAUTH_REQUIRED')]) assert.ok(markup(AreaMessage,{github}));
  assert.match(markup(RepositoryManagement, { api: {}, bindings: {}, connectSection: '합성' }), /연동 상태를 확인/);
});
test('기존 preview 등록·거부·관측 fixture는 제품 web 응답 해석을 통과한다', async () => {
  const prior = globalThis.window; globalThis.window = { location: { search: '' } };
  try {
    assert.match(markup(preview.RepositoryManagementPreview, {}), /모의 응답/);
    assert.equal((await preview.repositoryApi.githubState()).data, 'CONNECTED');
    assert.equal((await preview.repositoryApi.register(repository.url)).kind, 'success');
    assert.equal((await preview.repositoryApi.register('bad')).code, 'REPOSITORY_URL_INVALID');
    assert.ok((await preview.repositoryApi.analyses()).data.some(row => row.ownCommitObservation === 'NONE'));
    for (const value of ['me-failed','disconnected','reauth','empty','failed']) {
      window.location.search = '?scenario=' + value;
      const valueResult = value === 'empty' || value === 'failed' ? await preview.repositoryApi.analyses() : await preview.repositoryApi.githubState();
      assert.ok(valueResult.kind);
    }
    for (const code of ['REPOSITORY_PRIVATE','REPOSITORY_UNSUPPORTED','REPOSITORY_UNVERIFIED']) {
      window.location.search = '?registration=' + code;
      assert.equal((await preview.repositoryApi.register(repository.url)).code, code);
    }
    for (const mode of ['accepted','existing','daily-limit','in-progress','consent','github','not-allowed','unavailable','deferred','retry-not-allowed','retry-missing','unknown','limited']) {
      window.location.search = '?intake=' + mode;
      const key = 'preview-' + mode, body = { repositoryId:'123', retryOfRequestId:'r', consent:{ accepted:true, noticeRevision:'n', scopeRevision:'v1' } };
      const result = await preview.requestApi.create(body, key);
      assert.ok(result.kind);
      if (mode === 'unknown' || mode === 'limited') assert.equal((await preview.requestApi.create(body,key)).kind, 'success');
    }
    for (const mode of ['accepted','notice-failed','notice-unavailable']) { window.location.search = '?intake=' + mode; assert.ok((await preview.requestApi.notice()).kind); }
    assert.equal((await preview.catchApi.list({})).kind, 'success');
  } finally { globalThis.window = prior; }
});

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}
test('모달 조립은 열기·초안 보존·주소 수정·Catch 이동·닫기에서 요청 수명을 지킨다', async () => {
  const success = data => Promise.resolve({ kind:'success', data });
  let opened = 0, closed = 0, shown = null;
  const api = { githubState:() => success('CONNECTED'), repositories:() => success([repository]), analyses:() => success([latest]),
    analyzableRepositories:() => success([repository]), register:() => success({ ...repository, registrationId:'registration' }) };
  const harness = createHookHarness(RepositoryManagement, { api, bindings: { onOpen:() => opened++, onClosed:() => closed++, onShowRepository:id => { shown = id; } },
    requestApi:{ notice:() => success({ noticeRevision:'n', text:'합성 안내' }) } });
  const settle = async () => { let tree; for (let i=0;i<3;i++) { tree=harness.render(); harness.effects(); await new Promise(resolve => setImmediate(resolve)); } return tree; };
  try {
    let tree = await settle();
    elements(tree).find(element => element.type === 'button' && element.props.children === '연결 관리').props.onClick();
    tree = await settle(); assert.equal(opened,1);
    let section = elements(tree).find(element => element.type === AnalysisRequestSection);
    section.props.registration.change(repository.url); await section.props.registration.submit();
    assert.equal(section.props.store.getSnapshot().selectedId,'123');
    section.props.registration.change(repository.url + '-changed'); assert.equal(section.props.store.getSnapshot().selectedId,null);
    const dialog = elements(tree).find(element => element.type === 'dialog'); let prevented=false;
    dialog.props.onCancel({ preventDefault:() => { prevented=true; } });
    tree = await settle(); assert.equal(closed,1); assert.equal(prevented,true);
    elements(tree).find(element => element.type === 'button' && element.props.children === '연결 관리').props.onClick();
    tree = await settle(); section=elements(tree).find(element => element.type === AnalysisRequestSection);
    assert.equal(section.props.registration.getSnapshot().url, repository.url + '-changed');
    const list=elements(tree).find(element=>element.type===ConnectedList); list.props.onToggle('123');
    tree=await settle(); assert.ok(elements(tree).find(element=>element.type===ConnectedList).props.expanded.has('123'));
    list.props.onShowRepository('123'); tree=await settle(); assert.equal(shown,'123'); assert.equal(closed,1);
    assert.equal(elements(tree).some(element=>element.type===AnalysisRequestSection),false);
    elements(tree).find(element => element.type === 'button' && element.props.children === '연결 관리').props.onClick();
    tree=await settle(); const backdrop=elements(tree).find(element=>element.type==='dialog');
    const target={}; backdrop.props.onPointerDown({target,currentTarget:target}); backdrop.props.onClick({target,currentTarget:target});
    await settle(); assert.equal(closed,2);
  } finally { harness.dispose(); }
});
