// 화면 조작 도우미. 요소는 역할·접근 이름·라벨로 찾고, 새 표식 속성(data-testid)을 더하지 않는다(#594 담당 결정).
import { expect } from '@playwright/test';
import { listenForCallback } from './callback.mjs';

/** 개발용 로그인으로 새 합성 회원을 만들고 첫 프로필을 저장해 홈까지 간다. */
export async function signUp(page, webOrigin, { identity, displayName }) {
  await page.goto(`${webOrigin}/login`);
  await page.getByLabel('개발용 식별 문자열').fill(identity);
  await page.getByRole('button', { name: '개발용 로그인', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '최초 프로필 입력' })).toBeVisible();
  await page.getByLabel('표시 이름').fill(displayName);
  await page.getByRole('button', { name: '저장하고 시작하기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'GitHub 기록을 나의 경험으로 정리해 보세요.' })).toBeVisible();
}

/**
 * 합성 Claude가 만든 승인 시작 주소를 브라우저로 연다. api가 web 승인 화면으로 보내면 decision대로 누르고, 돌아갈 주소로 온 주소를 돌려준다.
 * 처음 연결하는 회원이라 승인 단추는 「동의하고 승인」이어야 한다. 화면 주소에 state·code_challenge가 실리므로 주소는 출력하지 않는다.
 */
export async function decideOnAuthorizeScreen(page, { authorizationUrl, callbackPort, decision }) {
  const callback = await listenForCallback(callbackPort);
  try {
    // SDK의 startAuthorization은 승인 시작 주소를 URL 객체로 돌려준다.
    await page.goto(new URL(authorizationUrl).href);
    await expect(page.getByRole('heading', { level: 1, name: 'Claude 연결 승인' })).toBeVisible();
    await expect(page.getByText(`127.0.0.1:${callbackPort}`, { exact: true })).toBeVisible();
    const approve = page.getByRole('button', { name: '동의하고 승인', exact: true });
    const cancel = page.getByRole('button', { name: '취소', exact: true });
    await expect(approve).toBeEnabled();
    await expect(cancel).toBeEnabled();
    const codeChallenge = new URL(page.url()).searchParams.get('code_challenge');
    await (decision === 'approve' ? approve : cancel).click();
    // 요청이 도착한 것과 브라우저가 그 페이지를 다 연 것은 다르다. 다 열기 전에 다음 이동을 하면 그 이동이 끊긴다.
    const [redirectTo] = await Promise.all([
      callback.received(),
      page.waitForURL((url) => url.host === `127.0.0.1:${callbackPort}` && url.pathname === '/oauth/callback'),
    ]);
    return { redirectTo, codeChallenge };
  } finally {
    await callback.close();
  }
}

/** 연결 관리 화면에서 전체 연결 해제를 누르고, 연결이 없다고 보일 때까지 확인한다. */
export async function disconnectAll(page, webOrigin) {
  await page.goto(`${webOrigin}/profile/claude`);
  await expect(page.getByRole('heading', { level: 1, name: 'Claude 연결', exact: true })).toBeVisible();
  await expect(page.getByText('연결되어 있습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 연결 해제' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '해제하기', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '연결을 모두 해제했습니다' })).toBeVisible();
  await expect(page.getByText('연결되어 있지 않습니다', { exact: true })).toBeVisible();
}
