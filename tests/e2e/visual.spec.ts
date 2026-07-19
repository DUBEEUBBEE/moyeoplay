import { expect, test } from '@playwright/test';

test('가로 화면 클레이 탁구 idle 레이아웃은 시각 기준선을 유지한다', async ({
  browserName,
  page,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'A single Chromium baseline avoids engine font drift.');
  testInfo.snapshotSuffix = '';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./play/#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');

  await expect(page.locator('.game-view')).toHaveScreenshot('pong-landscape.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.08,
    threshold: 0.25,
  });
});
