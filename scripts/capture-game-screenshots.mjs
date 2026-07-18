import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { GAME_CONTENT } from '../site/site-content.mjs';

const baseUrl = new URL(process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4173/moyeoplay/');
const outputDirectory = path.resolve('public/assets/screenshots');
const viewport = { width: 1280, height: 720 };
const seed = 0x4d4f5945;

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'ko-KR' });
  await context.addInitScript((initialSeed) => {
    let state = initialSeed >>> 0;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    Math.random = () => next() / 0x1_0000_0000;
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      configurable: true,
      value(array) {
        if (!array) throw new TypeError('Expected a typed array.');
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = next() & 0xff;
        return array;
      },
    });
  }, seed);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const game of GAME_CONTENT) {
    const target = new URL(`play/#game/${game.id}`, baseUrl).href;
    const response = await page.goto(target, { waitUntil: 'networkidle' });
    if (response && !response.ok()) {
      throw new Error(`${game.id} returned ${String(response.status())}.`);
    }
    await page.locator("#game-host[data-loading='false']").waitFor({ state: 'visible' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#game-start').click();
    await page.waitForTimeout(game.id === 'pong' || game.id === 'volleyball' ? 500 : 180);
    await page.evaluate(() => document.fonts.ready);
    const screenshot = await page.screenshot({ type: 'png', animations: 'disabled' });
    const output = path.join(outputDirectory, `${game.id}.webp`);
    await sharp(screenshot)
      .resize(viewport.width, viewport.height)
      .webp({ quality: 82, effort: 6 })
      .toFile(output);
    const size = (await stat(output)).size;
    console.log(`${game.id}: ${(size / 1024).toFixed(1)}KB (${viewport.width}x${viewport.height})`);
  }

  if (pageErrors.length > 0) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser.close();
}
