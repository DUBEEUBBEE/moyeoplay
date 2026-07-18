import { expect, test } from '@playwright/test';

const games = [
  'omok',
  'pong',
  'volleyball',
  'pinball-drop',
  'ladder',
  'reaction-duel',
  'tap-battle',
  'roulette',
] as const;

test('기존 root lobby hash는 history를 추가하지 않고 /play/로 이어진다', async ({ page }) => {
  await page.goto('./#lobby');
  await expect(page).toHaveURL(/\/play\/#lobby$/u);
  await expect(page.locator('#game-grid')).toBeVisible();
  const urlAfterRedirect = page.url();
  await page.waitForTimeout(100);
  expect(page.url()).toBe(urlAfterRedirect);
});

test('기존 root game hash 8개는 동일한 게임으로 replace 이동한다', async ({ page }) => {
  for (const game of games) {
    await page.goto(`./#game/${game}`);
    await expect(page).toHaveURL(new RegExp(`/play/#game/${game}$`, 'u'));
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#stage-title')).toBeVisible();
  }
});

test('등록되지 않은 root hash는 redirect하지 않고 정적 랜딩을 유지한다', async ({ page }) => {
  await page.goto('./#game/not-a-game');
  await expect(page).not.toHaveURL(/\/play\//u);
  await expect(page.locator('main h1')).toContainText('바로 PLAY');
  await expect(page.locator('article.static-game-card')).toHaveCount(8);
});
