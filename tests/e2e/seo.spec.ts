import AxeBuilder from '@axe-core/playwright';
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
  let canonicalRoot = '';

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
    if (cleanPath === '/') canonicalRoot = metadata.canonical ?? '';
    const expectedCanonical = new URL(cleanPath.replace(/^\//u, ''), canonicalRoot).href;
    expect(metadata.canonical, cleanPath).toBe(expectedCanonical);
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
  page,
  request,
}) => {
  await page.goto('./');
  const canonicalRoot = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonicalRoot).toBeTruthy();
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
    contentPaths.map(
      (cleanPath) => new URL(cleanPath.replace(/^\//u, ''), canonicalRoot ?? '').href,
    ),
  );
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
