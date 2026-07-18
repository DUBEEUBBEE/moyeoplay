import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(serious).toEqual([]);
}

test('로비, 설정, 규칙과 8개 게임 idle 상태에 serious axe 위반이 없다', async ({ page }) => {
  await page.goto('./#lobby');
  await expect(page.locator('article.game-card')).toHaveCount(8);
  await expect(page.getByRole('button', { name: '오목 시작', exact: true })).toBeVisible();
  await expectNoSeriousAxeViolations(page);

  const settingsTrigger = page.locator('[data-action="settings"]').first();
  await settingsTrigger.click();
  await expect(page.getByRole('dialog', { name: '플레이 설정' })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.getByRole('button', { name: '플레이 설정 닫기' }).click();
  await expect(settingsTrigger).toBeFocused();

  for (const gameId of games) {
    await page.goto(`./#game/${gameId}`);
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    if (gameId === 'pong' || gameId === 'volleyball' || gameId === 'pinball-drop') {
      await expect(page.locator('#game-host canvas[role="img"]')).not.toHaveAttribute(
        'tabindex',
        '0',
      );
    }
    await expectNoSeriousAxeViolations(page);
  }

  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  const rulesTrigger = page.locator('[data-action="rules"]');
  await rulesTrigger.click();
  await expect(page.getByRole('dialog', { name: '게임 규칙' })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(rulesTrigger).toBeFocused();
});

test('playing, paused, and result dialog states remain accessible', async ({ page }) => {
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await expectNoSeriousAxeViolations(page);
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
  await expectNoSeriousAxeViolations(page);

  await page.goto('./#game/ladder');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.locator('[data-action="show-all"]').click();
  await expect(page.getByRole('dialog', { name: '경기 결과' })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test('header touch target and visible game HUD labels meet minimum sizes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#lobby');
  const settingsBounds = await page.locator('.header-button[data-action="settings"]').boundingBox();
  expect(settingsBounds).not.toBeNull();
  expect(settingsBounds?.width).toBeGreaterThanOrEqual(44);
  expect(settingsBounds?.height).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  for (const selector of ['#stage-eyebrow', '#game-phase']) {
    const fontSize = await page
      .locator(selector)
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(11);
  }
});

test('핀볼 live status는 진행 시간 tick을 반복 공지하지 않는다', async ({ page }) => {
  await page.goto('./#game/pinball-drop');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('경기 중', { timeout: 6_000 });
  const mutations = await page.locator('.pinball-game .game-local-status').evaluate(
    (element) =>
      new Promise<number>((resolve) => {
        let count = 0;
        const observer = new MutationObserver(() => {
          count += 1;
        });
        observer.observe(element, { childList: true, characterData: true, subtree: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 300);
      }),
  );
  expect(mutations).toBe(0);
});
