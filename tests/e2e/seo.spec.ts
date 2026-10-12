import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const e2eMode = processEnv.E2E_MODE ?? 'dev';
const expectedSiteUrl =
  processEnv.SITE_URL ??
  (e2eMode === 'prod' ? 'https://moyeoplay.studio/' : 'http://127.0.0.1:5173/');
const expectedNaverVerification = '050d11bd1415bffdff627eb871a17814f1770115';

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
const contentPaths = [
  '/',
  ...games.map((game) => `/games/${game}/`),
  '/guides/',
  ...editorialGuides.map((guide) => `/guides/${guide}/`),
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

test('24개 clean URL은 JavaScript 없이 고유 콘텐츠와 SEO 데이터를 제공한다', async ({
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
        canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
        descriptionCount: document.querySelectorAll('meta[name="description"]').length,
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
    expect(metadata.canonicalCount, cleanPath).toBe(1);
    expect(metadata.descriptionCount, cleanPath).toBe(1);
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
          : cleanPath === '/guides/' || cleanPath.startsWith('/guides/')
            ? ['가이드']
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

  expect(titles.size).toBe(contentPaths.length);
  expect(descriptions.size).toBe(contentPaths.length);
  expect(canonicals.size).toBe(contentPaths.length);
  await context.close();
});

test('네이버 소유권 확인 태그는 루트 홈페이지에만 존재한다', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('meta[name="naver-site-verification"]')).toHaveAttribute(
    'content',
    expectedNaverVerification,
  );
  await expect(page.locator('meta[name="naver-site-verification"]')).toHaveCount(1);

  await page.goto('./play/');
  await expect(page.locator('meta[name="naver-site-verification"]')).toHaveCount(0);
});

test('구조화 데이터는 실제 사이트·게임·breadcrumb만 설명한다', async ({ page }) => {
  await page.goto('./');
  const rootGraph = await page
    .locator('script[type="application/ld+json"]')
    .evaluate(
      (script) => JSON.parse(script.textContent) as { '@graph': Record<string, unknown>[] },
    );
  expect(rootGraph['@graph']).toHaveLength(1);
  expect(rootGraph['@graph'][0]).toMatchObject({
    '@type': 'WebSite',
    name: '모여PLAY',
    url: expectedSiteUrl,
    inLanguage: 'ko-KR',
  });
  expect(
    rootGraph['@graph'].some(
      (entry) => entry['@type'] === 'WebApplication' || entry['@type'] === 'SoftwareApplication',
    ),
  ).toBe(false);

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
    expect(videoGame?.alternateName, game).toEqual(
      expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String)]),
    );
    expect(videoGame?.image, game).toBe(`${expectedSiteUrl}assets/og/${game}.png`);
    expect(videoGame?.genre, game).toEqual(expect.any(String));
    expect(videoGame?.dateModified, game).toBe('2026-10-12');
  }
});

test('검색 의도별 탐색과 게임별 FAQ가 설명형 내부 링크로 연결된다', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('[data-game-discovery]')).toHaveCount(1);
  await expect(page.locator('[data-game-discovery]')).toContainText('1~4분 초단기 승부');
  const rootCardLinkLabels = await page.locator('.static-game-card__links a').allTextContents();
  expect(rootCardLinkLabels).toHaveLength(16);
  expect(rootCardLinkLabels).not.toContain('게임 시작');
  expect(rootCardLinkLabels).not.toContain('가이드');

  for (const game of games) {
    await page.goto(`./games/${game}/`);
    const description =
      (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(description.length, game).toBeGreaterThanOrEqual(70);
    await expect(page.locator('[data-game-use-cases] li')).toHaveCount(3);
    await expect(page.locator('[data-game-experience] li')).toHaveCount(7);
    await expect(page.locator('[data-game-experience] a')).toHaveCount(2);
    await expect(page.locator('[data-game-faq] details')).toHaveCount(3);
    await expect(page.locator('[data-game-faq] summary').first()).not.toBeEmpty();
    const disclosureMarker = await page
      .locator('[data-game-faq] summary')
      .first()
      .evaluate((element) => getComputedStyle(element, '::after').content);
    expect(disclosureMarker, game).not.toBe('none');
    if (game === 'pinball-drop') {
      await expect(page.locator('[data-game-faq]')).toContainText('공떨어지기 게임');
    }
  }

  for (const path of ['./how-to-play/', './fairness/']) {
    await page.goto(path);
    const hrefs = await page
      .locator('[data-game-guide-directory] a[href*="/games/"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
    expect(new Set(hrefs).size, path).toBe(8);
  }

  await page.goto('./guides/');
  await expect(page.locator('[data-editorial-guide-directory] .editorial-guide-card')).toHaveCount(
    editorialGuides.length,
  );
  await expect(page.locator('[data-game-guide-directory] a[href*="/games/"]')).toHaveCount(12);

  for (const guide of editorialGuides) {
    await page.goto(`./guides/${guide}/`);
    expect(
      await page.locator('.editorial-article > section').count(),
      guide,
    ).toBeGreaterThanOrEqual(10);
    await expect(page.locator('[data-game-faq] details')).toHaveCount(3);
    expect(await page.locator('.content-table').count(), guide).toBeGreaterThan(0);
    await expect(page.locator('.guide-byline')).toContainText('직접 구현한 게임 규칙');
  }
});

test('sitemap은 24개 canonical clean URL만 포함하고 /play/와 hash를 제외한다', async ({
  request,
}) => {
  const response = await request.get('./sitemap.xml');
  expect(response.status()).toBe(200);
  const source = await response.text();
  const urls = [...source.matchAll(/<loc>([^<]+)<\/loc>/gu)]
    .map((match) => match[1])
    .filter((url): url is string => Boolean(url));
  expect(urls).toHaveLength(contentPaths.length);
  expect(new Set(urls).size).toBe(contentPaths.length);
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
        return graph['@graph'].find(
          (entry) => entry['@type'] === 'WebPage' || entry['@type'] === 'Article',
        )?.dateModified;
      });
    const canonical = new URL(cleanPath.replace(/^\//u, ''), expectedSiteUrl).href;
    expect(webPageModified, cleanPath).toBe(lastModifiedByUrl.get(canonical));
  }

  // Content left unchanged by this review retains its previous modification date.
  expect(lastModifiedByUrl.get(`${expectedSiteUrl}terms/`)).toBe('2026-07-19');
  expect(lastModifiedByUrl.get(`${expectedSiteUrl}how-to-play/`)).toBe('2026-08-10');
  expect(lastModifiedByUrl.get(`${expectedSiteUrl}about/`)).toBe('2026-10-12');
  expect(lastModifiedByUrl.get(`${expectedSiteUrl}contact/`)).toBe('2026-10-12');
});

test('가이드 작성 정보와 About·Contact 신뢰 안내가 방문자용 문구로 연결된다', async ({ page }) => {
  for (const game of games) {
    await page.goto(`./games/${game}/`);
    await expect(
      page.locator('.guide-byline a[href*="/about/#operator-and-authorship"]'),
    ).toHaveCount(1);
  }
  await page.goto('./about/');
  const aboutMain = page.locator('main');
  await expect(aboutMain).toContainText('모여PLAY 프로젝트');
  await expect(aboutMain).not.toContainText('SITE_OPERATOR_NAME');
  await expect(page.locator('#production-and-assets')).toContainText(
    'AI-assisted image generation',
  );
  await expect(page.getByRole('link', { name: '이미지 자산 제작·검수 기록' })).toHaveAttribute(
    'href',
    /docs\/ASSET_PROVENANCE\.md$/u,
  );

  await page.goto('./contact/');
  const contactMain = page.locator('main');
  await expect(contactMain).toContainText('문의 방법');
  await expect(contactMain).toContainText('GitHub Issues에서 접수합니다');
  await expect(contactMain).not.toContainText('PUBLIC_CONTACT_EMAIL');
  await expect(contactMain).not.toContainText('공개 이메일 미설정');
  await expect(contactMain).not.toContainText('AdSense 신청 전');
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

test('24개 문서의 본문·이미지와 네 화면 크기의 콘텐츠가 일치한다', async ({ page }) => {
  test.setTimeout(120_000);
  for (const cleanPath of contentPaths) {
    let expectedText = '';
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(relativeUrl(cleanPath));
      const text = (await page.locator('main').textContent())?.replace(/\s+/gu, ' ').trim() ?? '';
      expectedText ||= text;
      expect(text, `${cleanPath} ${String(viewport.width)}`).toBe(expectedText);
      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.body, cleanPath).toBeLessThanOrEqual(1);
      expect(overflow.document, cleanPath).toBeLessThanOrEqual(1);
    }
    // Exercise every lazy image too; an off-screen broken screenshot is still a content defect.
    await page.locator('main img').evaluateAll((images) => {
      for (const image of images) (image as HTMLImageElement).loading = 'eager';
    });
    await expect
      .poll(
        async () =>
          page
            .locator('main img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
              ),
            ),
        { message: `${cleanPath} images must decode` },
      )
      .toBe(true);
  }
});

test('실전 문서의 작성일·수정일·자료 출처와 목차를 실제 본문에서 확인한다', async ({ page }) => {
  for (const [index, guide] of editorialGuides.entries()) {
    await page.goto(`./guides/${guide}/`);
    const dates = await page
      .locator('.guide-byline time')
      .evaluateAll((times) => times.map((time) => time.getAttribute('datetime')));
    expect(dates, guide).toEqual([index < 4 ? '2026-08-10' : '2026-10-12', '2026-10-12']);
    const articleDates = await page
      .locator('script[type="application/ld+json"]')
      .evaluate((script) => {
        const data = JSON.parse(script.textContent) as {
          '@graph': { '@type': string; datePublished?: string; dateModified?: string }[];
        };
        const article = data['@graph'].find((entry) => entry['@type'] === 'Article');
        return [article?.datePublished, article?.dateModified];
      });
    expect(articleDates, guide).toEqual(dates);
    expect(await page.locator('[data-guide-sources] a').count(), guide).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.editorial-hero a[href*="/play/#game/"]')).toHaveCount(1);
    const contentsLink = page
      .getByRole('navigation', { name: '이 글의 목차' })
      .getByRole('link')
      .last();
    // Put the link on screen before focusing it so focus-scroll cannot race fragment-scroll.
    await contentsLink.scrollIntoViewIfNeeded();
    await contentsLink.focus();
    await expect(contentsLink).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#guide-sources$/u);
    await expect(page.locator('#guide-sources')).toBeInViewport();
  }
  for (const game of games) {
    await page.goto(`./games/${game}/`);
    await expect(page.locator('[data-game-practice] .content-table tbody tr')).toHaveCount(3);
    await expect(page.locator('[data-related-guides] a').first()).toHaveAttribute(
      'href',
      /\/guides\//u,
    );
    await expect(page.locator('.guide-media figcaption')).not.toBeEmpty();
  }
});

test('네 화면 크기에서 목차로 이동한 제목이 고정 헤더에 가리지 않는다', async ({ page }) => {
  // Assert the final layout rather than an intermediate frame of smooth scrolling.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./guides/local-multiplayer-input-check/');
    const link = page.locator('.article-contents a[href="#keyboard"]');
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#keyboard$/u);
    await expect(page.locator('#keyboard h2')).toBeInViewport();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const heading = document.querySelector('#keyboard h2')?.getBoundingClientRect();
          const header = document.querySelector('.content-header')?.getBoundingClientRect();
          return heading && header ? heading.top - header.bottom : -1;
        }),
      )
      .toBeGreaterThanOrEqual(0);
  }
});

test('콘텐츠 페이지의 모든 내부 문서 링크는 실제 200 응답을 반환한다', async ({
  page,
  request,
}) => {
  const internalUrls = new Set<string>();
  const fragmentUrls = new Set<string>();
  const documentIds = new Map<string, Set<string>>();
  let previewOrigin = '';
  for (const cleanPath of contentPaths) {
    await page.goto(relativeUrl(cleanPath));
    previewOrigin ||= new URL(page.url()).origin;
    documentIds.set(
      page.url(),
      new Set(await page.locator('[id]').evaluateAll((elements) => elements.map((el) => el.id))),
    );
    const links = await page
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
    for (const href of links) {
      const url = new URL(href);
      if (url.origin !== previewOrigin) continue;
      if (url.hash && !url.pathname.includes('/play/')) fragmentUrls.add(url.href);
      url.hash = '';
      internalUrls.add(url.href);
    }
  }
  for (const href of internalUrls) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
  for (const href of fragmentUrls) {
    const url = new URL(href);
    const fragmentId = decodeURIComponent(url.hash.slice(1));
    url.hash = '';
    // Check every target against its rendered document once, rather than loading it per fragment.
    expect(documentIds.get(url.href)?.has(fragmentId), href).toBe(true);
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
  test.setTimeout(120_000);
  for (const cleanPath of contentPaths) {
    await page.goto(relativeUrl(cleanPath));
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(severe, cleanPath).toEqual([]);
  }
});
