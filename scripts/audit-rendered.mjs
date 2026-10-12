import { chromium } from '@playwright/test';
import { EDITORIAL_GUIDES, GAME_CONTENT, PAGE_CONTENT } from '../site/site-content.mjs';

const site = new URL(process.env.E2E_LIVE_URL || 'https://moyeoplay.studio/');
const canonicalSite = new URL(process.env.AUDIT_CANONICAL_URL || site.href);
const expectedPaths = [
  site.pathname,
  ...GAME_CONTENT.map((game) => new URL(`games/${game.slug}/`, site).pathname),
  ...EDITORIAL_GUIDES.map((guide) => new URL(`guides/${guide.slug}/`, site).pathname),
  ...Object.values(PAGE_CONTENT)
    .filter((page) => page.slug)
    .map((page) => new URL(`${page.slug}/`, site).pathname),
];
const failures = [];
const report = {
  checkedAt: new Date().toISOString(),
  site: site.href,
  canonicalSite: canonicalSite.href,
  method:
    'Chromium lab observations with a fresh context per performance sample; no CPU/network throttling; viewport emulation is not physical device testing. Interaction samples are not field INP.',
  expectedRouteCount: expectedPaths.length,
  deployedRouteCount: 0,
  missingExpectedPaths: [],
  pages: [],
  performance: [],
  runtime: { errors: [], adRequests: 0 },
};
const sitemap = await globalThis.fetch(new URL('sitemap.xml', site), {
  signal: globalThis.AbortSignal.timeout(20_000),
});
if (sitemap.status !== 200) throw new Error('Sitemap unavailable');
const canonicalUrls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
  (match) => new URL(match[1]),
);
if (
  canonicalUrls.some(
    (url) => url.origin !== canonicalSite.origin || url.hash || url.pathname.includes('/play/'),
  )
)
  throw new Error('Sitemap contains an unexpected origin or non-content URL');
const urls = canonicalUrls.map((url) => new URL(url.pathname, site));
report.deployedRouteCount = urls.length;
report.missingExpectedPaths = expectedPaths.filter(
  (path) => !urls.some((url) => url.pathname === path),
);
if (report.missingExpectedPaths.length || urls.length !== expectedPaths.length)
  failures.push('Deployed sitemap does not yet match this checkout');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
function observe(page) {
  page.on('pageerror', (error) => report.runtime.errors.push(error.name));
  page.on('console', (message) => {
    if (message.type() === 'error') report.runtime.errors.push('console.error');
  });
  page.on('request', (request) => {
    if (/googlesyndication|doubleclick|googleadservices/iu.test(request.url()))
      report.runtime.adRequests += 1;
  });
}
const page = await context.newPage();
const mobile = await mobileContext.newPage();
observe(page);
observe(mobile);
const documentStates = new Map();
const internalLinks = new Set();
const fragmentLinks = [];
try {
  for (const url of urls) {
    const response = await page.goto(url.href, { waitUntil: 'load' });
    const source = await response.text();
    const raw = await page.evaluate((html) => {
      const doc = new globalThis.DOMParser().parseFromString(html, 'text/html');
      return {
        main: doc.querySelector('main')?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
        h1Count: doc.querySelectorAll('h1').length,
        canonicalCount: doc.head.querySelectorAll('link[rel="canonical"]').length,
        titleCount: doc.head.querySelectorAll('title').length,
        descriptionCount: doc.head.querySelectorAll('meta[name="description"]').length,
        ids: [...doc.querySelectorAll('[id]')].map((element) => element.id),
        links: [...doc.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')),
        images: [...doc.querySelectorAll('img')].map((image) => ({
          alt: image.hasAttribute('alt'),
          width: Number(image.getAttribute('width')),
          height: Number(image.getAttribute('height')),
          strategy: image.getAttribute('loading') || 'eager',
        })),
      };
    }, source);
    documentStates.set(url.href, raw);
    for (const href of raw.links) {
      const link = new URL(href, url);
      if (link.origin !== site.origin) continue;
      if (link.hash && !link.pathname.includes('/play/'))
        fragmentLinks.push({
          url: link.origin + link.pathname,
          id: decodeURIComponent(link.hash.slice(1)),
        });
      link.hash = '';
      internalLinks.add(link.href);
    }
    await page.locator('main img').evaluateAll((images) => {
      for (const image of images) image.loading = 'eager';
    });
    let imagesLoad = true;
    try {
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('main img')].every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
        undefined,
        { timeout: 10_000 },
      );
    } catch {
      imagesLoad = false;
    }
    const desktopText = await page.locator('main').textContent();
    const mobileResponse = await mobile.goto(url.href, { waitUntil: 'load' });
    const mobileText = await mobile.locator('main').textContent();
    const normalize = (text) => text.replace(/\s+/gu, ' ').trim();
    const mobileOverflow = await mobile.evaluate(
      () =>
        Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
        document.documentElement.clientWidth,
    );
    const result = {
      path: url.pathname,
      status: response.status(),
      mobileStatus: mobileResponse.status(),
      rawMainCharacters: raw.main.length,
      rawH1Count: raw.h1Count,
      rawMetadataUnique:
        raw.canonicalCount === 1 && raw.titleCount === 1 && raw.descriptionCount === 1,
      rawAndRenderedMatch: raw.main === normalize(desktopText),
      mobileAndDesktopMatch: normalize(mobileText) === normalize(desktopText),
      mobileOverflow,
      imageCount: raw.images.length,
      imagesLoad,
      imageAttributesValid: raw.images.every(
        (image) => image.alt && image.width > 0 && image.height > 0,
      ),
      lazyImageCount: raw.images.filter((image) => image.strategy === 'lazy').length,
    };
    report.pages.push(result);
    if (
      result.status !== 200 ||
      result.mobileStatus !== 200 ||
      result.rawH1Count !== 1 ||
      raw.main.length < 250 ||
      !result.rawMetadataUnique ||
      !result.rawAndRenderedMatch ||
      !result.mobileAndDesktopMatch ||
      mobileOverflow > 1 ||
      !imagesLoad ||
      !result.imageAttributesValid
    )
      failures.push(`Rendered content invariant failed: ${url.pathname}`);
  }
  for (const link of internalLinks) {
    if (documentStates.has(link)) continue;
    const result = await globalThis.fetch(link, {
      redirect: 'manual',
      signal: globalThis.AbortSignal.timeout(20_000),
    });
    if (result.status !== 200)
      failures.push(`Internal link returned ${result.status}: ${new URL(link).pathname}`);
  }
  for (const link of fragmentLinks) {
    if (!documentStates.get(link.url)?.ids.includes(link.id))
      failures.push(`Missing fragment: ${new URL(link.url).pathname}#${link.id}`);
  }
  report.internalLinkCount = internalLinks.size;
  report.fragmentLinkCount = fragmentLinks.length;

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const metricContext = await browser.newContext({ viewport });
    const metricPage = await metricContext.newPage();
    observe(metricPage);
    await metricPage.addInitScript(() => {
      const metrics = { lcpMs: 0, cls: 0, tbtMs: 0, interactions: [] };
      globalThis.__contentLabMetrics = metrics;
      const observeEntries = (type, callback, options = {}) => {
        if (!globalThis.PerformanceObserver.supportedEntryTypes.includes(type)) return;
        new globalThis.PerformanceObserver((list) => list.getEntries().forEach(callback)).observe({
          type,
          buffered: true,
          ...options,
        });
      };
      observeEntries('largest-contentful-paint', (entry) => {
        metrics.lcpMs = entry.startTime;
      });
      observeEntries('layout-shift', (entry) => {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      });
      observeEntries('longtask', (entry) => {
        metrics.tbtMs += Math.max(0, entry.duration - 50);
      });
      observeEntries(
        'event',
        (entry) => {
          if (entry.interactionId) metrics.interactions.push(entry.duration);
        },
        { durationThreshold: 16 },
      );
    });
    await metricPage.goto(site.href, { waitUntil: 'networkidle' });
    await metricPage.waitForTimeout(700);
    const beforeInput = await metricPage.evaluate(() => ({ ...globalThis.__contentLabMetrics }));
    await metricPage.getByRole('button', { name: '맨 위로' }).click();
    await metricPage.waitForTimeout(250);
    const sample = await metricPage.evaluate(() => {
      const metrics = globalThis.__contentLabMetrics;
      const resources = globalThis.performance.getEntriesByType('resource');
      const bytesFor = (type) =>
        resources
          .filter((entry) => entry.initiatorType === type)
          .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize), 0);
      return {
        jsBytes: bytesFor('script'),
        imageBytes: bytesFor('img'),
        interactionSampleCount: metrics.interactions.length,
        maxObservedInteractionMs: metrics.interactions.length
          ? Math.max(...metrics.interactions)
          : null,
      };
    });
    report.performance.push({
      path: site.pathname,
      viewport,
      lcpMs: beforeInput.lcpMs,
      cls: beforeInput.cls,
      tbtMs: beforeInput.tbtMs,
      ...sample,
      fieldINP: null,
    });
    await metricContext.close();
  }
} finally {
  await browser.close();
}
if (report.runtime.errors.length || report.runtime.adRequests)
  failures.push('Runtime errors or ad requests observed');
report.ok = failures.length === 0;
report.failures = failures;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
