import { expect, test } from '@playwright/test';

const e2eMode =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env?.E2E_MODE ?? 'dev';

function requireAssetUrl(value: string | undefined, label: string): string {
  expect(value, label).toBeTruthy();
  if (!value) throw new Error(`Missing required asset URL: ${label}`);
  return value;
}

test.describe('live GitHub Pages smoke', () => {
  test.skip(e2eMode !== 'live', 'runs only against the deployed Pages URL');

  test('loads the lobby, metadata, assets, and a Canvas game on a landscape phone', async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width: 844, height: 390 });

    const response = await page.goto('./');
    expect(response?.status()).toBe(200);
    await expect(page.locator('article.static-game-card')).toHaveCount(8);

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
    const expectedSite = new URL('./', page.url()).href.replace(/#.*$/u, '');
    expect(metadata.canonical).toBe(expectedSite);
    expect(metadata.ogUrl).toBe(expectedSite);
    const expectedOgImage = new URL('og-cover.png', expectedSite).href;
    expect(metadata.ogImage).toBe(expectedOgImage);
    expect(metadata.twitterImage).toBe(expectedOgImage);

    const manifestUrl = requireAssetUrl(metadata.manifest, 'manifest');
    const iconUrl = requireAssetUrl(metadata.icon, 'favicon');
    const appleIconUrl = requireAssetUrl(metadata.appleIcon, 'apple touch icon');
    expect(metadata.scripts.length).toBeGreaterThan(0);
    expect(metadata.styles.length).toBeGreaterThan(0);
    const assetUrls = [
      expectedOgImage,
      new URL('sitemap.xml', expectedSite).href,
      manifestUrl,
      iconUrl,
      appleIconUrl,
      ...metadata.scripts,
      ...metadata.styles,
    ];
    expect(assetUrls.length).toBeGreaterThanOrEqual(6);
    const expectedBasePath = new URL(expectedSite).pathname;
    for (const url of assetUrls) {
      expect((await request.get(url)).status(), url).toBe(200);
      expect(new URL(url).pathname.startsWith(expectedBasePath), url).toBe(true);
    }
    const robotsResponse = await request.get(new URL('robots.txt', expectedSite).href);
    if (expectedBasePath === '/') expect(robotsResponse.status()).toBe(200);
    else expect(robotsResponse.status()).toBe(404);

    const manifestResponse = await request.get(manifestUrl);
    const manifest = (await manifestResponse.json()) as {
      id?: string;
      start_url?: string;
      scope?: string;
      icons?: { src?: string; sizes?: string; purpose?: string }[];
    };
    expect(manifest.id).toBe(expectedBasePath);
    expect(manifest.start_url).toBe(`${expectedBasePath}play/#lobby`);
    expect(manifest.scope).toBe(expectedBasePath);
    expect(new URL(requireAssetUrl(manifest.id, 'manifest id'), manifestUrl).href).toBe(
      new URL(expectedBasePath, expectedSite).href,
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

    await page.goto('./play/#game/pong');
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#game-start').click();
    const canvas = page.locator('.pong-game canvas');
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThan(200);
    expect(bounds?.height ?? 0).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
});
