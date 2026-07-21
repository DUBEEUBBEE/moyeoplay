import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const e2eMode = processEnv.E2E_MODE ?? 'dev';
const expectedSiteUrl =
  processEnv.SITE_URL ??
  (e2eMode === 'prod' ? 'https://moyeoplay.studio/' : 'http://127.0.0.1:5173/');

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
const contentPaths = [
  '/',
  ...games.map((game) => `/games/${game}/`),
  '/about/',
  '/how-to-play/',
  '/fairness/',
  '/privacy/',
  '/terms/',
  '/contact/',
] as const;

function relativeUrl(cleanPath: string): string {
  return cleanPath === '/' ? './' : `.${cleanPath}`;
}

test('15개 clean URL은 JavaScript 없이 고유 콘텐츠와 SEO 데이터를 제공한다', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const canonicals = new Set<string>();
  for (const cleanPath of contentPaths) {
    const response = await page.goto(relativeUrl(cleanPath));
    expect(response?.status(), cleanPath).toBe(200);
    const metadata = await page.evaluate(() => {
      const structuredData = document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"]',
      )?.textContent;
      return {
        lang: document.documentElement.lang,
        title: document.title,
        description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
        openGraphUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
        openGraphImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')
          ?.content,
        twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')
          ?.content,
        openGraphImageAlt: [...document.querySelectorAll('meta[property="og:image:alt"]')].map(
          (element) => (element as HTMLMetaElement).content,
        ),
        twitterImageAlt: [...document.querySelectorAll('meta[name="twitter:image:alt"]')].map(
          (element) => (element as HTMLMetaElement).content,
        ),
        h1Count: document.querySelectorAll('h1').length,
        mainTextLength: document.querySelector('main')?.textContent.trim().length ?? 0,
        staticGuideLinks: document.querySelectorAll('article.static-game-card a[href*="/games/"]')
          .length,
        playLinks: document.querySelectorAll('a[href*="/play/"]').length,
        footerPolicyLinks: ['privacy', 'terms', 'contact'].filter((slug) =>
          document.querySelector(`footer a[href*="/${slug}/"]`),
        ).length,
        internalLinks: [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(
          (link) => link.origin === location.origin,
        ).length,
        currentNav: [
          ...document.querySelectorAll<HTMLElement>('.content-nav [aria-current="page"]'),
        ].map((element) => element.textContent.trim()),
        structuredData,
        images: [...document.querySelectorAll<HTMLImageElement>('img')].map((image) => ({
          width: image.getAttribute('width'),
          height: image.getAttribute('height'),
          alt: image.getAttribute('alt'),
          src: image.src,
        })),
      };
    });
    expect(metadata.lang, cleanPath).toBe('ko');
    expect(metadata.title.length, cleanPath).toBeGreaterThan(10);
    expect(metadata.description?.length ?? 0, cleanPath).toBeGreaterThan(30);
    expect(metadata.canonical, cleanPath).toBeTruthy();
    expect(metadata.openGraphUrl, cleanPath).toBe(metadata.canonical);
    expect(metadata.openGraphImage?.startsWith(expectedSiteUrl), cleanPath).toBe(true);
    expect(metadata.twitterImage, cleanPath).toBe(metadata.openGraphImage);
    expect(metadata.openGraphImageAlt, cleanPath).toHaveLength(1);
    expect(metadata.openGraphImageAlt[0]?.length ?? 0, cleanPath).toBeGreaterThan(10);
    expect(metadata.twitterImageAlt, cleanPath).toHaveLength(1);
    expect(metadata.twitterImageAlt[0]?.length ?? 0, cleanPath).toBeGreaterThan(10);
    expect(metadata.h1Count, cleanPath).toBe(1);
    expect(metadata.mainTextLength, cleanPath).toBeGreaterThan(250);
    expect(metadata.internalLinks, cleanPath).toBeGreaterThan(2);
    expect(() => {
      JSON.parse(metadata.structuredData ?? '');
    }).not.toThrow();
    for (const image of metadata.images) {
      expect(Number(image.width), cleanPath).toBeGreaterThan(0);
      expect(Number(image.height), cleanPath).toBeGreaterThan(0);
      if (image.src.includes('/assets/game-icons/')) expect(image.alt, cleanPath).toBe('');
      if (image.src.includes('/assets/screenshots/')) {
        expect(image.alt?.includes('실제 게임 화면'), cleanPath).toBe(true);
      }
    }
    if (cleanPath === '/') {
      expect(metadata.staticGuideLinks).toBe(8);
      expect(metadata.playLinks).toBeGreaterThan(0);
    }
    expect(metadata.footerPolicyLinks, cleanPath).toBe(3);
    const expectedCanonical = new URL(cleanPath.replace(/^\//u, ''), expectedSiteUrl).href;
    expect(metadata.canonical, cleanPath).toBe(expectedCanonical);
    const expectedCurrentNav =
      cleanPath === '/'
        ? ['홈']
        : cleanPath.startsWith('/games/')
          ? ['게임']
          : cleanPath === '/about/'
            ? ['소개']
            : cleanPath === '/fairness/'
              ? ['공정성']
              : cleanPath === '/how-to-play/'
                ? ['도움말']
                : [];
    expect(metadata.currentNav, cleanPath).toEqual(expectedCurrentNav);
    titles.add(metadata.title);
    descriptions.add(metadata.description ?? '');
    canonicals.add(metadata.canonical ?? '');
  }

  expect(titles.size).toBe(15);
  expect(descriptions.size).toBe(15);
  expect(canonicals.size).toBe(15);
  await context.close();
});

test('구조화 데이터는 실제 앱·게임·breadcrumb만 설명한다', async ({ page }) => {
  await page.goto('./');
  const rootGraph = await page
    .locator('script[type="application/ld+json"]')
    .evaluate(
      (script) => JSON.parse(script.textContent) as { '@graph': Record<string, unknown>[] },
    );
  expect(rootGraph['@graph'].some((entry) => entry['@type'] === 'WebSite')).toBe(true);
  const application = rootGraph['@graph'].find((entry) => entry['@type'] === 'WebApplication');
  expect(application).toMatchObject({
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
  });
  expect(application?.offers).toMatchObject({ price: '0', priceCurrency: 'KRW' });

  for (const game of games) {
    await page.goto(`./games/${game}/`);
    const graph = await page.locator('script[type="application/ld+json"]').evaluate((script) => {
      const data = JSON.parse(script.textContent) as { '@graph': Record<string, unknown>[] };
      return data['@graph'];
    });
    const types = graph.map((entry) => entry['@type']);
    expect(types, game).toEqual(expect.arrayContaining(['WebPage', 'VideoGame', 'BreadcrumbList']));
    const videoGame = graph.find((entry) => entry['@type'] === 'VideoGame');
    expect(videoGame?.numberOfPlayers, game).toMatchObject({ '@type': 'QuantitativeValue' });
  }
});

test('sitemap은 15개 canonical clean URL만 포함하고 /play/와 hash를 제외한다', async ({
  request,
}) => {
  const response = await request.get('./sitemap.xml');
  expect(response.status()).toBe(200);
  const source = await response.text();
  const urls = [...source.matchAll(/<loc>([^<]+)<\/loc>/gu)]
    .map((match) => match[1])
    .filter((url): url is string => Boolean(url));
  expect(urls).toHaveLength(15);
  expect(new Set(urls).size).toBe(15);
  expect(urls.some((url) => url.includes('#') || url.includes('/play/'))).toBe(false);
  expect(urls).toEqual(
    contentPaths.map((cleanPath) => new URL(cleanPath.replace(/^\//u, ''), expectedSiteUrl).href),
  );
});

test('콘텐츠 dateModified와 sitemap lastmod는 같은 실제 갱신일을 사용한다', async ({
  page,
  request,
}) => {
  const sitemap = await (await request.get('./sitemap.xml')).text();
  const lastModifiedByUrl = new Map(
    [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/gu)].map(
      (match) => [match[1] ?? '', match[2] ?? ''] as const,
    ),
  );
  for (const cleanPath of contentPaths.filter((path) => path !== '/')) {
    await page.goto(relativeUrl(cleanPath));
    const webPageModified = await page
      .locator('script[type="application/ld+json"]')
      .evaluate((script) => {
        const graph = JSON.parse(script.textContent) as { '@graph': Record<string, unknown>[] };
        return graph['@graph'].find((entry) => entry['@type'] === 'WebPage')?.dateModified;
      });
    const canonical = new URL(cleanPath.replace(/^\//u, ''), expectedSiteUrl).href;
    expect(webPageModified, cleanPath).toBe(lastModifiedByUrl.get(canonical));
  }
});

test('가이드 작성 정보와 About 제작 공개가 실제 근거로 연결된다', async ({ page }) => {
  for (const game of games) {
    await page.goto(`./games/${game}/`);
    await expect(
      page.locator('.guide-byline a[href*="/about/#operator-and-authorship"]'),
    ).toHaveCount(1);
  }
  await page.goto('./about/');
  await expect(page.locator('#operator-and-authorship')).toContainText('모여PLAY 프로젝트');
  await expect(page.locator('#production-and-assets')).toContainText(
    'AI-assisted image generation',
  );
  await expect(page.getByRole('link', { name: '이미지 자산 제작·검수 기록' })).toHaveAttribute(
    'href',
    /docs\/ASSET_PROVENANCE\.md$/u,
  );
});

test('hero와 게임 이미지가 생성 일러스트와 실제 screenshot을 구분한다', async ({ page }) => {
  await page.goto('./');
  const hero = page.locator('.hero-art img');
  await expect(hero).toHaveAttribute('width', '1440');
  await expect(hero).toHaveAttribute('height', '810');
  await expect(hero).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('img[src*="/assets/game-icons/"]').first()).toHaveAttribute('alt', '');

  await page.goto('./games/omok/');
  await expect(page.locator('.guide-icon img')).toHaveAttribute('alt', '');
  await expect(page.locator('.guide-screenshot')).toHaveAttribute('alt', /실제 게임 화면/u);
});

test('정적 홈과 가이드는 390x844 및 844x390에서 horizontal overflow가 없다', async ({ page }) => {
  for (const target of [
    { path: './', width: 390, height: 844 },
    { path: './games/omok/', width: 844, height: 390 },
  ]) {
    await page.setViewportSize({ width: target.width, height: target.height });
    await page.goto(target.path);
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.body, target.path).toBeLessThanOrEqual(1);
    expect(overflow.document, target.path).toBeLessThanOrEqual(1);
  }
});

test('콘텐츠 페이지의 모든 내부 문서 링크는 실제 200 응답을 반환한다', async ({
  page,
  request,
}) => {
  const internalUrls = new Set<string>();
  let previewOrigin = '';
  for (const cleanPath of contentPaths) {
    await page.goto(relativeUrl(cleanPath));
    previewOrigin ||= new URL(page.url()).origin;
    const links = await page
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
    for (const href of links) {
      const url = new URL(href);
      if (url.origin !== previewOrigin) continue;
      url.hash = '';
      internalUrls.add(url.href);
    }
  }
  for (const href of internalUrls) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test('/play/는 실행 전용 noindex 페이지이며 광고 콘텐츠 페이지로 노출되지 않는다', async ({
  page,
}) => {
  const response = await page.goto('./play/#lobby');
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('meta[name="google-adsense-account"]')).toHaveCount(0);
  await expect(page.locator('#game-grid article.game-card')).toHaveCount(8);
  await expect(page.locator('[data-adsense-slot], .adsbygoogle')).toHaveCount(0);
});

test('정적 clean URL은 serious/critical 접근성 위반이 없다', async ({ page }) => {
  for (const cleanPath of contentPaths) {
    await page.goto(relativeUrl(cleanPath));
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(severe, cleanPath).toEqual([]);
  }
});
