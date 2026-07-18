import { expect, test } from '@playwright/test';

test('정적 루트의 LCP·CLS·TBT 대체 지표와 전송 budget을 수집한다', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium PerformanceObserver budget으로 한 번만 수집');

  await page.addInitScript(() => {
    const metrics = { cls: 0, lcp: 0, tbt: 0 };
    Reflect.set(window, '__moyeoplayPerformanceMetrics', metrics);

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!Reflect.get(entry, 'hadRecentInput')) {
          metrics.cls += Number(Reflect.get(entry, 'value') ?? 0);
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.tbt += Math.max(0, entry.duration - 50);
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto('./', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const budget = await page.evaluate(() => {
    const metrics = Reflect.get(window, '__moyeoplayPerformanceMetrics') as {
      cls: number;
      lcp: number;
      tbt: number;
    };
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const bytes = (entry: PerformanceResourceTiming): number =>
      entry.transferSize || entry.encodedBodySize;
    return {
      ...metrics,
      jsBytes: resources
        .filter((entry) => entry.initiatorType === 'script')
        .reduce((sum, entry) => sum + bytes(entry), 0),
      imageBytes: resources
        .filter((entry) => entry.initiatorType === 'img')
        .reduce((sum, entry) => sum + bytes(entry), 0),
    };
  });

  console.log(`MOYEOPLAY_PERFORMANCE_BUDGET ${JSON.stringify(budget)}`);
  expect(budget.lcp).toBeGreaterThan(0);
  expect(budget.lcp).toBeLessThan(3_500);
  expect(budget.cls).toBeLessThan(0.1);
  expect(budget.tbt).toBeLessThan(300);
  expect(budget.jsBytes).toBeLessThan(400 * 1024);
  expect(budget.imageBytes).toBeLessThan(500 * 1024);
});
