import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const e2eMode = processEnv.E2E_MODE ?? 'dev';
const checkRedirects = processEnv.E2E_CHECK_REDIRECTS === 'true';
const requireBranded404 = processEnv.E2E_REQUIRE_BRANDED_404 !== 'false';
const expectedAdsenseClientId = processEnv.ADSENSE_CLIENT_ID?.trim() ?? '';
const expectedAdsensePublisherId = processEnv.ADSENSE_PUBLISHER_ID?.trim() ?? '';
const accountMetaProfile = processEnv.ADSENSE_ACCOUNT_META_ENABLED ?? 'true';
const adsProfile = processEnv.ADSENSE_ADS_ENABLED ?? 'false';
const accountMetaEnabled = accountMetaProfile === 'true';
const adsEnabled = adsProfile === 'true';
const EXPECTED_SITE = 'https://moyeoplay.studio/';
const EXPECTED_HOST = 'moyeoplay.studio';
const SOFT_404_PATTERN = /(?:\b404\b|not found|페이지를? 찾을 수|찾을 수 없습니다|페이지 없음)/iu;

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
const editorialGuides = [
  'penalty-roulette-ideas',
  'pinball-drop-timing',
  'two-player-browser-games',
  'party-game-host-guide',
  'omok-threats-and-defense',
  'reaction-time-and-input-delay',
  'ladder-permutation-explained',
  'local-multiplayer-input-check',
] as const;
const indexableRoutes = [
  { label: '홈', path: '' },
  ...games.map((game) => ({ label: game, path: `games/${game}/` })),
  { label: '가이드 자료실', path: 'guides/' },
  ...editorialGuides.map((guide) => ({ label: guide, path: `guides/${guide}/` })),
  { label: '소개', path: 'about/' },
  { label: '이용 방법', path: 'how-to-play/' },
  { label: '공정성', path: 'fairness/' },
  { label: '개인정보', path: 'privacy/' },
  { label: '이용약관', path: 'terms/' },
  { label: '문의', path: 'contact/' },
] as const;

function requireAssetUrl(value: string | undefined, label: string): string {
  expect(value, label).toBeTruthy();
  if (!value) throw new Error(`Missing required asset URL: ${label}`);
  return value;
}

function expectCustomBaseUrl(baseURL: string | undefined): void {
  expect(baseURL, 'live smoke must target the canonical custom-domain root').toBe(EXPECTED_SITE);
  if (!baseURL) throw new Error('Missing Playwright baseURL.');
  const configuredUrl = new URL(baseURL);
  expect(configuredUrl.protocol).toBe('https:');
  expect(configuredUrl.hostname).toBe(EXPECTED_HOST);
  expect(configuredUrl.pathname).toBe('/');
}

function isGoogleAdEndpoint(value: string): boolean {
  const { hostname, pathname } = new URL(value);
  return (
    /(^|\.)(?:googlesyndication|googleadservices)\.com$/iu.test(hostname) ||
    /(^|\.)doubleclick\.net$/iu.test(hostname) ||
    /^adservice\.google\./iu.test(hostname) ||
    pathname.startsWith('/pagead/')
  );
}

function redactSensitive(value: string): string {
  return value
    .replace(/\b(ca-pub-|pub-)(\d{4})\d+(\d{4})\b/giu, '$1$2…$3')
    .replace(
      /([?&](?:client|slot|publisher|google_ad_client|google_ad_slot)=)[^&\s]+/giu,
      '$1<redacted>',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '<redacted-email>')
    .replace(/\b\d{10,20}\b/gu, '<redacted-number>');
}

function monitorPage(page: Page): { adRequestCount: number; errors: string[] } {
  const signals = { adRequestCount: 0, errors: [] as string[] };
  page.on('pageerror', (error) => signals.errors.push(redactSensitive(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') signals.errors.push(redactSensitive(message.text()));
  });
  page.on('request', (browserRequest) => {
    if (isGoogleAdEndpoint(browserRequest.url())) signals.adRequestCount += 1;
  });
  return signals;
}

function expectNoRuntimeFailures(signals: { adRequestCount: number; errors: string[] }): void {
  expect(signals.errors, 'live pages must not emit console errors or uncaught exceptions').toEqual(
    [],
  );
  expect(
    signals.adRequestCount,
    'the live profile must not request Google ad endpoints before granted consent',
  ).toBe(0);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    Math.max(dimensions.bodyScrollWidth, dimensions.documentScrollWidth),
    `${label} must fit the viewport without horizontal overflow`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectPermanentRedirect(
  request: APIRequestContext,
  sourceUrl: string,
  expectedTarget: string,
): Promise<void> {
  const response = await request.get(sourceUrl, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect([301, 308], `${sourceUrl} must use a permanent redirect`).toContain(response.status());
  const location = response.headers().location;
  expect(location, `${sourceUrl} must provide a redirect target`).toBeTruthy();
  if (!location) throw new Error(`Missing redirect location for ${sourceUrl}`);
  const target = new URL(location, sourceUrl).href;
  expect(target).toBe(expectedTarget);
  expect(target).not.toBe(sourceUrl);

  const targetResponse = await request.get(target, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect(targetResponse.status(), `${sourceUrl} must not enter a redirect loop`).toBe(200);
  expect(targetResponse.headers().location).toBeUndefined();
}

test.describe('live custom-domain smoke', () => {
  test.skip(e2eMode !== 'live', 'runs only against the deployed custom-domain URL');

  test.beforeAll(() => {
    expect(
      accountMetaProfile,
      'the post-submission review profile must keep account metadata enabled',
    ).toBe('true');
    expect(adsProfile, 'the post-submission review profile must keep ad delivery disabled').toBe(
      'false',
    );
    expect(accountMetaEnabled).toBe(true);
    expect(adsEnabled).toBe(false);
    if (expectedAdsenseClientId) {
      expect(
        /^ca-pub-\d{16}$/u.test(expectedAdsenseClientId),
        'the configured client ID must have a valid format',
      ).toBe(true);
    }
    if (expectedAdsensePublisherId) {
      expect(
        /^pub-\d{16}$/u.test(expectedAdsensePublisherId),
        'the configured publisher ID must have a valid format',
      ).toBe(true);
    }
  });

  test('24 indexable routes are real custom-domain documents rather than soft 404s', async ({
    baseURL,
    page,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const route of indexableRoutes) {
      const expectedUrl = new URL(route.path, EXPECTED_SITE).href;
      const response = await page.goto(expectedUrl, { waitUntil: 'load' });
      expect(response?.status(), route.label).toBe(200);

      const metadata = await page.evaluate(
        ({ expectedClientId, expectedOrigin }) => {
          const accountMetas = [
            ...document.querySelectorAll<HTMLMetaElement>('meta[name="google-adsense-account"]'),
          ];
          const accountMetaValue = accountMetas[0]?.content ?? '';
          const structuredData = [
            ...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
          ];
          const absoluteUrls: string[] = [];
          const collectUrls = (value: unknown): void => {
            if (typeof value === 'string' && /^https?:\/\//u.test(value)) {
              absoluteUrls.push(value);
            } else if (Array.isArray(value)) {
              value.forEach(collectUrls);
            } else if (value && typeof value === 'object') {
              Object.values(value).forEach(collectUrls);
            }
          };
          let structuredDataValid = structuredData.length > 0;
          for (const script of structuredData) {
            try {
              collectUrls(JSON.parse(script.textContent));
            } catch {
              structuredDataValid = false;
            }
          }
          return {
            accountMetaCount: accountMetas.length,
            accountMetaFormatValid:
              /^ca-pub-\d{16}$/u.test(accountMetaValue) &&
              !/(?:0000000000000000|1234567890123456)$/u.test(accountMetaValue),
            accountMetaMatchesExpected: expectedClientId
              ? accountMetaValue === expectedClientId
              : null,
            adsbygoogleElements: document.querySelectorAll('.adsbygoogle').length,
            adsenseSlots: document.querySelectorAll('[data-adsense-slot]').length,
            description:
              document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content.trim() ??
              '',
            googleAdScripts: document.querySelectorAll(
              'script[src*="googlesyndication"], script[src*="googleadservices"], script[src*="doubleclick.net"], script[src*="/pagead/"]',
            ).length,
            canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
            h1Count: document.querySelectorAll('h1').length,
            h1Text: document.querySelector('h1')?.textContent.trim() ?? '',
            mainText: document.querySelector('main')?.textContent.trim() ?? '',
            ogUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
            structuredDataValid,
            structuredDataUrlsUseCanonicalHost: absoluteUrls.every((url) => {
              try {
                const origin = new URL(url).origin;
                return origin === expectedOrigin || origin === 'https://schema.org';
              } catch {
                return false;
              }
            }),
            title: document.title.trim(),
          };
        },
        {
          expectedClientId: expectedAdsenseClientId,
          expectedOrigin: new URL(EXPECTED_SITE).origin,
        },
      );

      expect(metadata.h1Count, route.label).toBe(1);
      expect(metadata.h1Text.length, route.label).toBeGreaterThan(1);
      expect(metadata.title.length, route.label).toBeGreaterThan(10);
      expect(metadata.description.length, route.label).toBeGreaterThan(30);
      expect(metadata.mainText.length, route.label).toBeGreaterThan(250);
      expect(
        SOFT_404_PATTERN.test(`${metadata.title}\n${metadata.h1Text}\n${metadata.mainText}`),
        `${route.label} must not render a soft-404 document`,
      ).toBe(false);
      expect(metadata.canonical, route.label).toBe(expectedUrl);
      expect(metadata.ogUrl, route.label).toBe(expectedUrl);
      expect(metadata.structuredDataValid, route.label).toBe(true);
      expect(metadata.structuredDataUrlsUseCanonicalHost, route.label).toBe(true);
      expect(metadata.accountMetaCount, route.label).toBe(1);
      expect(metadata.accountMetaFormatValid, route.label).toBe(true);
      if (expectedAdsenseClientId) {
        expect(
          metadata.accountMetaMatchesExpected,
          `${route.label} account metadata must match the configured ID`,
        ).toBe(true);
      }
      expect(metadata.adsenseSlots, route.label).toBe(0);
      expect(metadata.adsbygoogleElements, route.label).toBe(0);
      expect(metadata.googleAdScripts, route.label).toBe(0);
      titles.add(metadata.title);
      descriptions.add(metadata.description);
    }

    expect(titles.size).toBe(indexableRoutes.length);
    expect(descriptions.size).toBe(indexableRoutes.length);
    expectNoRuntimeFailures(signals);
  });

  test('root artifacts and the play surface keep the custom-domain no-ads contract', async ({
    baseURL,
    page,
    request,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);
    const response = await page.goto(EXPECTED_SITE, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('article.static-game-card')).toHaveCount(8);

    const metadata = await page.evaluate((expectedClientId) => {
      const accountMetas = [
        ...document.querySelectorAll<HTMLMetaElement>('meta[name="google-adsense-account"]'),
      ];
      const accountMetaValue = accountMetas[0]?.content ?? '';
      return {
        appleIcon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href,
        appleIconSizes: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
          ?.sizes.value,
        accountMetaCount: accountMetas.length,
        accountMetaFormatValid:
          /^ca-pub-\d{16}$/u.test(accountMetaValue) &&
          !/(?:0000000000000000|1234567890123456)$/u.test(accountMetaValue),
        accountMetaMatchesExpected: expectedClientId ? accountMetaValue === expectedClientId : null,
        icon: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href,
        iconSizes: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.sizes.value,
        manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href,
        ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content,
        scripts: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(
          (element) => element.src,
        ),
        styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
          (element) => element.href,
        ),
        twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')
          ?.content,
      };
    }, expectedAdsenseClientId);
    const expectedOgImage = new URL('og-cover.png', EXPECTED_SITE).href;
    expect(metadata.ogImage).toBe(expectedOgImage);
    expect(metadata.twitterImage).toBe(expectedOgImage);
    expect(metadata.iconSizes).toBe('any');
    expect(metadata.appleIconSizes).toBe('180x180');
    expect(metadata.accountMetaCount).toBe(1);
    expect(metadata.accountMetaFormatValid).toBe(true);
    if (expectedAdsenseClientId) {
      expect(
        metadata.accountMetaMatchesExpected,
        'live account metadata must match the configured ID',
      ).toBe(true);
    }

    const manifestUrl = requireAssetUrl(metadata.manifest, 'manifest');
    const iconUrl = requireAssetUrl(metadata.icon, 'favicon');
    const appleIconUrl = requireAssetUrl(metadata.appleIcon, 'apple touch icon');
    expect(new URL(manifestUrl).origin).toBe(new URL(EXPECTED_SITE).origin);
    const assetUrls = [
      expectedOgImage,
      manifestUrl,
      iconUrl,
      appleIconUrl,
      ...metadata.scripts,
      ...metadata.styles,
    ];
    expect(assetUrls.length).toBeGreaterThanOrEqual(6);
    for (const url of assetUrls) {
      expect(new URL(url).origin, url).toBe(new URL(EXPECTED_SITE).origin);
      expect((await request.get(url)).status(), url).toBe(200);
    }
    const [faviconResponse, appleIconResponse, ogImageResponse] = await Promise.all([
      request.get(iconUrl),
      request.get(appleIconUrl),
      request.get(expectedOgImage),
    ]);
    expect(faviconResponse.headers()['content-type']).toContain('image/svg+xml');
    expect(appleIconResponse.headers()['content-type']).toContain('image/png');
    expect(ogImageResponse.headers()['content-type']).toContain('image/png');

    const sitemapResponse = await request.get(new URL('sitemap.xml', EXPECTED_SITE).href);
    expect(sitemapResponse.status()).toBe(200);
    const sitemapSource = await sitemapResponse.text();
    const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/gu)]
      .map((match) => match[1])
      .filter((url): url is string => Boolean(url));
    const expectedSitemapUrls = indexableRoutes.map(
      (route) => new URL(route.path, EXPECTED_SITE).href,
    );
    expect(sitemapUrls).toEqual(expectedSitemapUrls);
    expect(new Set(sitemapUrls).size).toBe(indexableRoutes.length);
    expect(sitemapUrls.some((url) => url.includes('/play/') || url.includes('#'))).toBe(false);

    const robotsResponse = await request.get(new URL('robots.txt', EXPECTED_SITE).href);
    expect(robotsResponse.status()).toBe(200);
    const robotsSource = await robotsResponse.text();
    expect(robotsSource).toContain(`Sitemap: ${EXPECTED_SITE}sitemap.xml`);
    expect(robotsSource).not.toMatch(/^\s*Disallow:\s*\/play(?:\/|$)/imu);

    const manifestResponse = await request.get(manifestUrl);
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      icons?: { src?: string; sizes?: string; purpose?: string }[];
      id?: string;
      scope?: string;
      start_url?: string;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/play/#lobby');
    expect(manifest.scope).toBe('/');
    const manifestIcons = manifest.icons ?? [];
    expect(manifestIcons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
        expect.objectContaining({ sizes: 'any', purpose: 'any' }),
      ]),
    );
    for (const icon of manifestIcons) {
      const manifestIconUrl = new URL(requireAssetUrl(icon.src, 'manifest icon'), manifestUrl).href;
      expect(new URL(manifestIconUrl).origin).toBe(new URL(EXPECTED_SITE).origin);
      expect((await request.get(manifestIconUrl)).status(), manifestIconUrl).toBe(200);
    }

    const cnameResponse = await request.get(new URL('CNAME', EXPECTED_SITE).href);
    expect(cnameResponse.status()).toBe(200);
    expect((await cnameResponse.text()).trim()).toBe(EXPECTED_HOST);
    const adsTxtResponse = await request.get(new URL('ads.txt', EXPECTED_SITE).href, {
      failOnStatusCode: false,
    });
    expect(adsTxtResponse.status()).toBe(200);
    expect(adsTxtResponse.headers()['content-type']).toContain('text/plain');
    const adsTxtSource = (await adsTxtResponse.text()).trim();
    const adsTxtFormatValid =
      /^google\.com, pub-\d{16}, DIRECT, f08c47fec0942fa0$/u.test(adsTxtSource) &&
      !/(?:pub-0000000000000000|pub-1234567890123456)/u.test(adsTxtSource);
    expect(adsTxtFormatValid, 'live ads.txt must contain one valid non-placeholder record').toBe(
      true,
    );
    if (expectedAdsensePublisherId) {
      const adsTxtMatches =
        adsTxtSource === `google.com, ${expectedAdsensePublisherId}, DIRECT, f08c47fec0942fa0`;
      expect(adsTxtMatches, 'live ads.txt must match the configured publisher').toBe(true);
    }

    const playResponse = await page.goto(new URL('play/#lobby', EXPECTED_SITE).href, {
      waitUntil: 'load',
    });
    expect(playResponse?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('meta[name="google-adsense-account"]')).toHaveCount(0);
    await expect(page.locator('[data-adsense-slot]')).toHaveCount(0);
    await expect(page.locator('.adsbygoogle')).toHaveCount(0);
    await expect(
      page.locator(
        'script[src*="googlesyndication"], script[src*="googleadservices"], script[src*="doubleclick.net"], script[src*="/pagead/"]',
      ),
    ).toHaveCount(0);
    await expect(page.locator('#game-grid article.game-card')).toHaveCount(8);

    expect(
      (await page.goto(new URL('privacy/', EXPECTED_SITE).href, { waitUntil: 'load' }))?.status(),
    ).toBe(200);
    await expect(page.locator('[data-privacy-ad-profile]')).toHaveAttribute(
      'data-privacy-ad-profile',
      'account-meta-only',
    );
    expectNoRuntimeFailures(signals);
  });

  test('mobile content has no horizontal overflow and Pong still starts', async ({
    baseURL,
    page,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);

    await page.setViewportSize({ width: 390, height: 844 });
    expect((await page.goto(EXPECTED_SITE, { waitUntil: 'load' }))?.status()).toBe(200);
    await expect(page.locator('article.static-game-card')).toHaveCount(8);
    await expectNoHorizontalOverflow(page, '390x844 home');

    await page.setViewportSize({ width: 844, height: 390 });
    const omokGuideUrl = new URL('games/omok/', EXPECTED_SITE).href;
    expect((await page.goto(omokGuideUrl, { waitUntil: 'load' }))?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('오목');
    await expectNoHorizontalOverflow(page, '844x390 Omok guide');

    expect(
      (
        await page.goto(new URL('play/#game/pong', EXPECTED_SITE).href, { waitUntil: 'load' })
      )?.status(),
    ).toBe(200);
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#game-start').click();
    const canvas = page.locator('.pong-game canvas');
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThan(200);
    expect(bounds?.height ?? 0).toBeGreaterThan(100);
    await expectNoHorizontalOverflow(page, '844x390 Pong game');
    expectNoRuntimeFailures(signals);
  });

  test('HTTP, www, and legacy Pages URLs permanently redirect once with paths intact', async ({
    baseURL,
    request,
  }) => {
    test.skip(
      !checkRedirects,
      'set E2E_CHECK_REDIRECTS=true after DNS, TLS, and Pages HTTPS enforcement are ready',
    );
    expectCustomBaseUrl(baseURL);
    for (const path of ['', 'games/omok/']) {
      const expectedTarget = new URL(path, EXPECTED_SITE).href;
      await expectPermanentRedirect(request, `http://${EXPECTED_HOST}/${path}`, expectedTarget);
      await expectPermanentRedirect(
        request,
        `https://www.${EXPECTED_HOST}/${path}`,
        expectedTarget,
      );
      await expectPermanentRedirect(
        request,
        new URL(path, 'https://dubeeubbee.github.io/moyeoplay/').href,
        expectedTarget,
      );
    }
  });

  test('unknown documents and assets return real 404 responses', async ({
    baseURL,
    page,
    request,
  }) => {
    expectCustomBaseUrl(baseURL);
    const unknownPageUrl = new URL(
      `this-page-should-not-exist-${String(Date.now())}/`,
      EXPECTED_SITE,
    ).href;
    const response = await page.goto(unknownPageUrl, { waitUntil: 'load' });
    expect(response?.status()).toBe(404);

    if (requireBranded404) {
      await expect(page).toHaveTitle('페이지를 찾을 수 없습니다 | 모여PLAY');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('페이지를 찾을 수 없습니다');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex,follow',
      );
      await expect(page.getByRole('link', { name: '홈으로 이동' })).toHaveAttribute('href', '/');
      await expect(page.getByRole('link', { name: '게임 목록 보기' })).toHaveAttribute(
        'href',
        '/#games',
      );
      await expect(page.getByRole('link', { name: '문의하기' })).toHaveAttribute(
        'href',
        '/contact/',
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
      await expect(page.locator('meta[name="google-adsense-account"]')).toHaveCount(0);
      await expect(page.locator('[data-adsense-slot], .adsbygoogle')).toHaveCount(0);
    }

    const unknownAsset = await request.get(
      new URL(`assets/this-asset-should-not-exist-${String(Date.now())}.js`, EXPECTED_SITE).href,
      { failOnStatusCode: false },
    );
    expect(unknownAsset.status()).toBe(404);
  });

  test('all game routes, screenshots, recovery flow, and footer links stay usable', async ({
    baseURL,
    page,
    request,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);

    for (const game of games) {
      const screenshotResponse = await request.get(
        new URL(`assets/screenshots/${game}.webp`, EXPECTED_SITE).href,
      );
      expect(screenshotResponse.status(), `${game} screenshot`).toBe(200);
      expect(screenshotResponse.headers()['content-type'], `${game} screenshot`).toContain(
        'image/webp',
      );

      const routeResponse = await page.goto(new URL(`play/#game/${game}`, EXPECTED_SITE).href, {
        waitUntil: 'load',
      });
      expect(
        routeResponse === null || routeResponse.status() === 200,
        `${game} hash navigation must stay on the live play document`,
      ).toBe(true);
      await expect(page.locator('#game-host'), game).toHaveAttribute('aria-busy', 'false');
      const reloadResponse = await page.reload({ waitUntil: 'load' });
      expect(reloadResponse?.status(), `${game} cold reload`).toBe(200);
      await expect(page.locator('#game-host'), `${game} cold reload`).toHaveAttribute(
        'aria-busy',
        'false',
      );
    }

    await page.goto(EXPECTED_SITE, { waitUntil: 'load' });
    const omokCard = page.locator('article.static-game-card').filter({ hasText: '오목' });
    await omokCard.getByRole('link', { name: '가이드' }).click();
    await expect(page).toHaveURL(new URL('games/omok/', EXPECTED_SITE).href);
    await page.getByRole('link', { name: '오목 바로 플레이' }).click();
    await expect(page).toHaveURL(/\/play\/#game\/omok$/u);
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: '로비로 이동' }).first().click();
    await expect(page).toHaveURL(/\/play\/#lobby$/u);
    await expect(page.locator('#game-grid article.game-card')).toHaveCount(8);

    await page.goto(EXPECTED_SITE, { waitUntil: 'load' });
    const footerUrls = await page
      .locator('footer a[href]')
      .evaluateAll((links) =>
        links
          .map((link) => (link as HTMLAnchorElement).href)
          .filter((href) => new URL(href).origin === location.origin),
      );
    expect(footerUrls.length).toBeGreaterThanOrEqual(7);
    for (const href of new Set(footerUrls)) {
      const footerResponse = await request.get(href, { failOnStatusCode: false });
      expect(footerResponse.status(), new URL(href).pathname).toBe(200);
    }

    expectNoRuntimeFailures(signals);
  });
});
