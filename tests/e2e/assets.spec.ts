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

test('8개 아이콘의 현대 포맷은 40KB 이하이며 fallback PNG와 OG·스크린샷이 존재한다', async ({
  request,
}) => {
  for (const game of games) {
    for (const extension of ['avif', 'webp'] as const) {
      const response = await request.get(`./assets/game-icons/${game}.${extension}`);
      expect(response.status(), `${game}.${extension}`).toBe(200);
      const contentLength = Number(response.headers()['content-length']);
      expect(Number.isFinite(contentLength), `${game}.${extension}`).toBe(true);
      expect(contentLength, `${game}.${extension}`).toBeLessThanOrEqual(40 * 1024);
    }
    expect((await request.get(`./assets/game-icons/${game}.png`)).status(), game).toBe(200);
    expect((await request.get(`./assets/og/${game}.png`)).status(), game).toBe(200);
    expect((await request.get(`./assets/screenshots/${game}.webp`)).status(), game).toBe(200);
  }
});

test('카드 아이콘은 고정 공간을 예약하고 로드 성공 뒤 glyph만 숨긴다', async ({ page }) => {
  await page.goto('./play/#lobby');
  const cards = page.locator('article.game-card');
  await expect(cards).toHaveCount(8);
  for (let index = 0; index < 8; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('img.game-card__icon')).toHaveJSProperty('naturalWidth', 320);
    await expect(card.locator('.game-card__art')).toHaveAttribute('data-icon-loaded', 'true');
  }
  const dimensions = await cards.locator('img.game-card__icon').evaluateAll((images) =>
    images.map((image) => {
      const icon = image as HTMLImageElement;
      return {
        width: icon.getAttribute('width'),
        height: icon.getAttribute('height'),
        naturalWidth: icon.naturalWidth,
      };
    }),
  );
  expect(dimensions).toHaveLength(8);
  for (const image of dimensions) {
    expect(image).toMatchObject({ width: '320', height: '320' });
    expect(image.naturalWidth).toBe(320);
  }
  await expect(cards.locator('.game-card__art[data-icon-loaded="true"]')).toHaveCount(8);
  await expect(cards.first().locator('.game-card__glyph')).toHaveCSS('opacity', '0');
});

test('모든 아이콘 요청 실패 시 glyph fallback과 카드 조작을 유지한다', async ({ page }) => {
  await page.route('**/assets/game-icons/**', (route) => route.abort());
  await page.goto('./play/#lobby');
  await expect(page.locator('.game-card__art[data-icon-loaded="true"]')).toHaveCount(0);
  await expect(page.locator('.game-card__glyph')).toHaveCount(8);
  await page.locator('button.game-card__start[data-game-id="omok"]').click();
  await expect(page).toHaveURL(/#game\/omok$/u);
});

test('지연 로드 전후 카드 art bounds가 바뀌지 않아 CLS를 만들지 않는다', async ({ page }) => {
  await page.route('**/assets/game-icons/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.continue();
  });
  await page.goto('./play/#lobby', { waitUntil: 'domcontentloaded' });
  const art = page.locator('.game-card__art').first();
  await art.scrollIntoViewIfNeeded();
  const before = await art.boundingBox();
  await expect(art).toHaveAttribute('data-icon-loaded', 'true');
  const after = await art.boundingBox();
  expect(before).not.toBeNull();
  expect(after).toEqual(before);
});

test('모션 감소에서도 아이콘과 가이드 CTA가 읽히고 수평 overflow가 없다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('./play/#lobby');
  await expect(page.locator('a.game-card__guide')).toHaveCount(8);
  const bounds = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport + 1);
});
