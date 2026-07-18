import { expect, test, type Page } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const adsenseEnabled = processEnv.ADSENSE_ENABLED === 'true';
const adsenseTestMode = processEnv.ADSENSE_TEST_MODE === 'true';

function collectGoogleAdRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/googlesyndication|doubleclick|googleadservices/iu.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

test('AdSense 기본 off 빌드는 ad DOM, 외부 tag, 광고 요청을 만들지 않는다', async ({ page }) => {
  test.skip(adsenseEnabled, 'enabled profile has separate assertions');
  const adRequests = collectGoogleAdRequests(page);
  for (const target of ['./', './games/omok/', './privacy/', './play/#lobby']) {
    await page.goto(target);
    await expect(page.locator('[data-adsense-slot], .adsbygoogle')).toHaveCount(0);
    await expect(page.locator('script[src*="pagead2.googlesyndication.com"]')).toHaveCount(0);
  }
  await page.goto('./privacy/');
  await expect(page.locator('main')).toContainText(
    '현재 공개 서비스에서 광고 게재는 활성화되어 있지 않습니다',
  );
  await expect(page.locator('main')).toContainText('moyeoplay:settings');
  await expect(page.locator('main')).toContainText('moyeoplay:session');
  expect(adRequests).toEqual([]);
});

test('mock-on root profile은 콘텐츠에만 slot을 두고 consent 전후 외부 요청을 막는다', async ({
  page,
}) => {
  test.skip(!adsenseEnabled, 'runs only for the isolated enabled profile');
  const adRequests = collectGoogleAdRequests(page);

  await page.goto('./');
  const rootSlot = page.locator('[data-adsense-slot]');
  await expect(rootSlot).toHaveCount(1);
  await expect(page.locator('script[src*="pagead2.googlesyndication.com"]')).toHaveCount(0);
  expect(adRequests).toEqual([]);
  if (adsenseTestMode) {
    await page.evaluate(() => window.dispatchEvent(new Event('moyeoplay:ads-consent-granted')));
    await expect(rootSlot).toHaveAttribute('data-adsense-consent-ready', 'true');
    await expect(page.locator('script[src*="pagead2.googlesyndication.com"]')).toHaveCount(0);
    expect(adRequests).toEqual([]);
  }

  await page.goto('./games/omok/');
  const guideSlot = page.locator('[data-adsense-slot]');
  await expect(guideSlot).toHaveCount(1);
  await expect(page.locator('canvas, .game-host, [data-action="reset"]')).toHaveCount(0);
  const slotBox = await guideSlot.boundingBox();
  expect(slotBox?.height ?? 0).toBeGreaterThanOrEqual(120);
  expect(slotBox?.height ?? 0).toBeLessThan(260);
  await page.evaluate(() => {
    location.hash = 'ad-safety-regression';
  });
  await expect(guideSlot).toHaveCount(1);
  await page.goto('./privacy/');
  await expect(page.locator('[data-adsense-slot], .adsbygoogle')).toHaveCount(0);
  await expect(page.locator('main')).toContainText(
    '이 빌드에는 Google AdSense용 콘텐츠 광고 영역이 활성화되어 있습니다',
  );
  await expect(
    page.getByRole('link', { name: 'Google 파트너 사이트 데이터 사용 안내' }),
  ).toHaveAttribute('href', 'https://policies.google.com/technologies/partner-sites');
  await page.goto('./play/#game/omok');
  await expect(page.locator('[data-adsense-slot], .adsbygoogle')).toHaveCount(0);
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
  const publisherId = processEnv.ADSENSE_PUBLISHER_ID;
  const expectedDomain = processEnv.CUSTOM_DOMAIN;
  const expectedSiteUrl = processEnv.SITE_URL;
  const controlsHostRoot = processEnv.PAGES_BASE_PATH === '/';
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
    expect(await robots.text()).toContain(`Sitemap: ${expectedSiteUrl ?? ''}sitemap.xml`);
  } else expect(robots.status()).toBe(404);
});
