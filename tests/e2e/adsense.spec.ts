import { expect, test, type Page } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const accountMetaEnabled = processEnv.ADSENSE_ACCOUNT_META_ENABLED === 'true';
const adsEnabled =
  processEnv.ADSENSE_ADS_ENABLED === 'true' || processEnv.ADSENSE_ENABLED === 'true';
const adsenseTestMode = processEnv.ADSENSE_TEST_MODE === 'true';
const clientId = processEnv.ADSENSE_CLIENT_ID ?? '';

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
const indexablePaths = [
  './',
  ...games.map((game) => `./games/${game}/`),
  './about/',
  './how-to-play/',
  './fairness/',
  './privacy/',
  './terms/',
  './contact/',
] as const;
const adEligiblePaths = ['./', ...games.map((game) => `./games/${game}/`)] as const;
const adExcludedPaths = [
  './about/',
  './how-to-play/',
  './fairness/',
  './privacy/',
  './terms/',
  './contact/',
  './play/#lobby',
] as const;

function collectGoogleAdRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/googlesyndication|doubleclick|googleadservices/iu.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

test('account meta는 색인 페이지에만 나타나고 광고 송출과 독립적이다', async ({ page }) => {
  const adRequests = collectGoogleAdRequests(page);
  for (const target of indexablePaths) {
    await page.goto(target);
    const metas = page.locator('meta[name="google-adsense-account"]');
    await expect(metas, target).toHaveCount(accountMetaEnabled ? 1 : 0);
    if (accountMetaEnabled) await expect(metas, target).toHaveAttribute('content', clientId);
  }

  await page.goto('./play/#lobby');
  await expect(page.locator('meta[name="google-adsense-account"]')).toHaveCount(0);
  if (!adsEnabled) {
    await expect(page.locator('[data-adsense-slot], .adsbygoogle')).toHaveCount(0);
    await expect(page.locator('script[src*="pagead2.googlesyndication.com"]')).toHaveCount(0);
    expect(adRequests).toEqual([]);
  }
});

test('광고 off와 meta-only profile은 slot, 외부 tag, 광고 요청을 만들지 않는다', async ({
  page,
}) => {
  test.skip(adsEnabled, 'enabled profile has separate assertions');
  const adRequests = collectGoogleAdRequests(page);
  for (const target of [...adEligiblePaths, ...adExcludedPaths]) {
    await page.goto(target);
    await expect(page.locator('[data-adsense-slot], .adsbygoogle'), target).toHaveCount(0);
    await expect(page.locator('script[src*="pagead2.googlesyndication.com"]'), target).toHaveCount(
      0,
    );
  }
  await page.goto('./privacy/');
  await expect(page.locator('[data-privacy-ad-profile]')).toHaveAttribute(
    'data-privacy-ad-profile',
    accountMetaEnabled ? 'account-meta-only' : 'off',
  );
  await expect(page.locator('main')).toContainText('moyeoplay:settings');
  await expect(page.locator('main')).toContainText('moyeoplay:session');
  expect(adRequests).toEqual([]);
});

test('ads-on test profile은 홈과 8개 가이드에만 수동 slot을 둔다', async ({ page }) => {
  test.skip(!adsEnabled, 'runs only for the isolated enabled profile');
  const adRequests = collectGoogleAdRequests(page);

  for (const target of adEligiblePaths) {
    await page.goto(target);
    const slot = page.locator('[data-adsense-slot]');
    await expect(slot, target).toHaveCount(1);
    await expect(slot, target).toContainText('광고 · Advertisement');
    await expect(page.locator('script[src*="pagead2.googlesyndication.com"]'), target).toHaveCount(
      0,
    );
  }
  for (const target of adExcludedPaths) {
    await page.goto(target);
    await expect(page.locator('[data-adsense-slot], .adsbygoogle'), target).toHaveCount(0);
  }
  expect(adRequests).toEqual([]);
});

test('거부, 철회, 미사용, 오류 상태에서는 광고 요청이 0이다', async ({ page }) => {
  test.skip(!adsEnabled, 'runs only for the isolated enabled profile');
  const adRequests = collectGoogleAdRequests(page);
  await page.goto('./');
  const slot = page.locator('[data-adsense-slot]');
  await expect(slot).toHaveAttribute('data-adsense-consent-state', 'unknown');

  for (const state of ['denied', 'withdrawn', 'unavailable', 'error'] as const) {
    await page.evaluate((nextState) => {
      window.dispatchEvent(
        new CustomEvent('moyeoplay:ads-consent-state-changed', {
          detail: { state: nextState },
        }),
      );
    }, state);
    await expect(slot).toHaveAttribute('data-adsense-consent-state', state);
    await expect(page.locator('script[src*="pagead2.googlesyndication.com"]')).toHaveCount(0);
    expect(adRequests).toEqual([]);
  }
});

test('test mode의 consent granted는 상태만 표시하고 외부 요청을 만들지 않는다', async ({
  page,
}) => {
  test.skip(!adsEnabled || !adsenseTestMode, 'runs only for the isolated enabled test profile');
  const adRequests = collectGoogleAdRequests(page);
  await page.goto('./');
  const slot = page.locator('[data-adsense-slot]');
  await page.evaluate(() => window.dispatchEvent(new Event('moyeoplay:ads-consent-granted')));
  await expect(slot).toHaveAttribute('data-adsense-consent-state', 'granted');
  await expect(slot).toHaveAttribute('data-adsense-consent-ready', 'true');
  await expect(page.locator('script[src*="pagead2.googlesyndication.com"]')).toHaveCount(0);
  expect(adRequests).toEqual([]);

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('moyeoplay:ads-consent-state-changed', { detail: 'withdrawn' }),
    );
  });
  await expect(slot).toHaveAttribute('data-adsense-consent-state', 'withdrawn');
  expect(adRequests).toEqual([]);
});

test('root 파일은 host profile 제약을 따른다', async ({ request }) => {
  const [adsTxt, cname, robots, sitemap] = await Promise.all([
    request.get('./ads.txt'),
    request.get('./CNAME'),
    request.get('./robots.txt'),
    request.get('./sitemap.xml'),
  ]);
  expect(sitemap.status()).toBe(200);
  const productionDefaults = (processEnv.E2E_MODE ?? 'dev') === 'prod';
  const publisherId = processEnv.ADSENSE_PUBLISHER_ID;
  const expectedDomain = processEnv.CUSTOM_DOMAIN ?? (productionDefaults ? 'moyeoplay.studio' : '');
  const expectedSiteUrl =
    processEnv.SITE_URL ??
    (productionDefaults ? 'https://moyeoplay.studio/' : 'http://127.0.0.1:5173/');
  const controlsHostRoot = (processEnv.PAGES_BASE_PATH ?? processEnv.E2E_BASE_PATH ?? '/') === '/';
  if (controlsHostRoot && publisherId) {
    expect(adsTxt.status()).toBe(200);
    expect(adsTxt.headers()['content-type']).toContain('text/plain');
    expect((await adsTxt.text()).trim()).toBe(
      `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`,
    );
  } else expect(adsTxt.status()).toBe(404);
  if (expectedDomain) {
    expect(cname.status()).toBe(200);
    expect((await cname.text()).trim()).toBe(expectedDomain);
  } else expect(cname.status()).toBe(404);
  if (controlsHostRoot) {
    expect(expectedSiteUrl).toBeTruthy();
    expect(robots.status()).toBe(200);
    const robotsSource = await robots.text();
    expect(robotsSource).toContain(`Sitemap: ${expectedSiteUrl}sitemap.xml`);
    expect(robotsSource).not.toMatch(/Disallow:\s*\/play\//iu);
  } else expect(robots.status()).toBe(404);
});
