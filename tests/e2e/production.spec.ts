import { expect, test, type Page } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const e2eMode = processEnv.E2E_MODE ?? 'dev';

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
const deployedSite = processEnv.SITE_URL ?? 'https://moyeoplay.studio/';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function requireAssetUrl(value: string | undefined, label: string): string {
  expect(value, label).toBeTruthy();
  if (!value) throw new Error(`Missing required asset URL: ${label}`);
  return value;
}

test.describe('production Pages build', () => {
  test.skip(e2eMode === 'dev', 'production-only assertions');

  test('serves the project base, metadata, and every static asset', async ({ page, request }) => {
    const errors = collectErrors(page);
    const response = await page.goto('./');
    expect(response?.status()).toBe(200);
    await expect(page.locator('article.static-game-card')).toHaveCount(8);

    const markup = await response?.text();
    expect(markup).toBeTruthy();
    expect(markup).not.toContain('/src/main.ts');

    const metadata = await page.evaluate(() => ({
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
      ogUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
      ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content,
      twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content,
      manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href,
      icon: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href,
      appleIcon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href,
      scripts: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(
        (element) => element.src,
      ),
      styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (element) => element.href,
      ),
    }));

    const expectedOgImage = `${deployedSite}og-cover.png`;
    expect(metadata.canonical).toBe(deployedSite);
    expect(metadata.ogUrl).toBe(deployedSite);
    expect(metadata.ogImage).toBe(expectedOgImage);
    expect(metadata.twitterImage).toBe(expectedOgImage);

    const previewRoot = new URL('./', page.url()).href;
    const manifestUrl = requireAssetUrl(metadata.manifest, 'manifest');
    const iconUrl = requireAssetUrl(metadata.icon, 'favicon');
    const appleIconUrl = requireAssetUrl(metadata.appleIcon, 'apple touch icon');
    expect(metadata.scripts.length).toBeGreaterThan(0);
    expect(metadata.styles.length).toBeGreaterThan(0);
    const assetUrls = [
      `${previewRoot}og-cover.png`,
      `${previewRoot}sitemap.xml`,
      manifestUrl,
      iconUrl,
      appleIconUrl,
      ...metadata.scripts,
      ...metadata.styles,
    ];
    expect(assetUrls.length).toBeGreaterThanOrEqual(8);
    const previewPath = new URL(previewRoot).pathname;
    for (const url of assetUrls) {
      const asset = await request.get(url);
      expect(asset.status(), url).toBe(200);
      const pathname = new URL(url).pathname;
      if (previewPath !== '/') expect(pathname, url).not.toMatch(/^\/assets\//);
      expect(pathname.startsWith(previewPath), url).toBe(true);
    }
    const controlsHostRoot = previewPath === '/';
    expect((await request.get(`${previewRoot}robots.txt`)).status()).toBe(
      controlsHostRoot ? 200 : 404,
    );
    expect((await request.get(`${previewRoot}ads.txt`)).status()).toBe(
      controlsHostRoot && processEnv.ADSENSE_PUBLISHER_ID ? 200 : 404,
    );

    const manifestResponse = await request.get(manifestUrl);
    const manifest = (await manifestResponse.json()) as {
      id?: string;
      start_url?: string;
      scope?: string;
      icons?: { src?: string; sizes?: string; purpose?: string }[];
    };
    const expectedBasePath = new URL(previewRoot).pathname;
    expect(manifest.id).toBe(expectedBasePath);
    expect(manifest.start_url).toBe(`${expectedBasePath}play/#lobby`);
    expect(manifest.scope).toBe(expectedBasePath);
    expect(new URL(requireAssetUrl(manifest.id, 'manifest id'), manifestUrl).href).toBe(
      new URL(expectedBasePath, previewRoot).href,
    );
    const manifestIcons = manifest.icons ?? [];
    expect(manifestIcons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
    for (const icon of manifestIcons) {
      const manifestIconUrl = new URL(requireAssetUrl(icon.src, 'manifest icon'), manifestUrl).href;
      expect(new URL(manifestIconUrl).pathname.startsWith(expectedBasePath)).toBe(true);
      expect((await request.get(manifestIconUrl)).status(), manifestIconUrl).toBe(200);
    }
    expect(errors).toEqual([]);
  });

  test('opens every direct hash route, starts Canvas, reloads, and falls back safely', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    for (const gameId of games) {
      await page.goto(`./play/#game/${gameId}`);
      await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
      const response = await page.reload();
      if (!response) throw new Error(`Cold route did not return a response: ${gameId}`);
      expect(response.status()).toBe(200);
      await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('#stage-title')).toBeVisible();
    }

    await page.goto('./play/#game/pong');
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#game-start').click();
    await expect(page.locator('.pong-game canvas')).toBeVisible();
    const canvasSize = await page.locator('.pong-game canvas').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(canvasSize.width).toBeGreaterThan(240);
    expect(canvasSize.height).toBeGreaterThan(120);
    await page.reload();
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await expect(page).toHaveURL(/#game\/pong$/);

    await page.goto('./play/#game/not-a-game');
    await expect(page).toHaveURL(/#lobby$/);
    await expect(page.locator('button.game-card__start[data-game-id]')).toHaveCount(8);
    expect(errors).toEqual([]);
  });

  test('shows an actionable retry state when a game chunk fails to load', async ({ page }) => {
    let chunkRequests = 0;
    await page.route('**/assets/pong-*.js', async (route) => {
      chunkRequests += 1;
      if (chunkRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/javascript',
          body: 'throw new Error("temporary chunk failure")',
        });
      } else {
        await route.continue();
      }
    });
    await page.goto('./play/#game/pong');
    const error = page.getByRole('alert');
    await expect(error).toContainText('네온 탁구를 불러오지 못했습니다');
    await expect(error.getByRole('button', { name: '다시 시도' })).toBeFocused();

    await error.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.pong-game')).toBeVisible();
    expect(chunkRequests).toBe(2);
  });

  test('escalates a repeated game chunk failure to a hash-preserving page reload', async ({
    page,
  }) => {
    let chunkRequests = 0;
    await page.route('**/assets/pong-*.js', async (route) => {
      chunkRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/javascript',
        body: 'throw new Error("repeated chunk failure")',
      });
    });
    await page.goto('./play/#game/pong');
    const firstError = page.getByRole('alert');
    await firstError.getByRole('button', { name: '다시 시도' }).click();

    const repeatedError = page.getByRole('alert');
    await expect(repeatedError).toContainText('재시도도 완료되지 않았습니다');
    await expect(repeatedError.getByRole('button', { name: '페이지 새로고침' })).toBeFocused();
    await expect(page).toHaveURL(/#game\/pong$/);
    expect(chunkRequests).toBe(2);
  });

  test('keeps roulette results selectable when every clipboard path fails', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      Object.defineProperty(Document.prototype, 'execCommand', {
        configurable: true,
        value: () => {
          throw new DOMException('Clipboard blocked', 'SecurityError');
        },
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./play/#game/roulette');
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#game-start').click();
    const result = page.locator('[data-result-text]');
    await expect(result).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.locator('[data-copy-result]').click();
    await expect(page.locator('[data-status]')).toContainText('길게 눌러 복사');
    await expect(result).toBeFocused();
    await expect(page.locator('.roulette-game textarea[aria-hidden="true"]')).toHaveCount(0);
  });
});
