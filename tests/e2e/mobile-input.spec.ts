import { expect, test, type Locator, type Page } from '@playwright/test';

const ACTION_GAMES = ['pong', 'volleyball', 'pinball-drop', 'reaction-duel', 'tap-battle'] as const;
type ActionGame = (typeof ACTION_GAMES)[number];

const GAME_ROOT: Record<ActionGame | 'omok', string> = {
  pong: '.pong-game',
  volleyball: '.volleyball-game',
  'pinball-drop': '.pinball-game',
  'reaction-duel': '.reaction-game',
  'tap-battle': '.tap-battle',
  omok: '.omok-game',
};

const PRIMARY_SURFACE: Record<ActionGame, string> = {
  pong: '.pong-game canvas',
  volleyball: '.volleyball-game canvas',
  'pinball-drop': '.pinball-game canvas',
  'reaction-duel': '.reaction-arena',
  'tap-battle': '.tap-battle__arena',
};

const PLAYER_CONTROLS: Record<ActionGame, readonly [string, string]> = {
  pong: [
    '.pong-game .touch-control-group:first-child',
    '.pong-game .touch-control-group:last-child',
  ],
  volleyball: [
    '.volleyball-game .touch-control-group:first-child',
    '.volleyball-game .touch-control-group:last-child',
  ],
  'pinball-drop': [
    '.pinball-game .touch-controls > button:first-child',
    '.pinball-game .touch-controls > button:last-child',
  ],
  'reaction-duel': ['[data-reaction-zone="1"]', '[data-reaction-zone="2"]'],
  'tap-battle': ['[data-zone="1"]', '[data-zone="2"]'],
};

async function openGame(page: Page, game: ActionGame | 'omok'): Promise<void> {
  await page.goto(`./play/#game/${game}`);
  await expect(page.locator(GAME_ROOT[game])).toBeVisible();
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
}

async function dispatchPointer(
  locator: Locator,
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
  pointerId: number,
): Promise<void> {
  await locator.dispatchEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === 1,
  });
}

async function simulateRepeatedKeyboardActivation(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    const button = element as HTMLButtonElement;
    const repeat = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
      key: 'Enter',
      repeat: true,
    });
    if (button.dispatchEvent(repeat)) button.click();
  });
}

async function colorCentroid(
  canvas: Locator,
  color: readonly [number, number, number],
): Promise<{ x: number; y: number }> {
  return canvas.evaluate((element, target) => {
    const drawingSurface = element as HTMLCanvasElement;
    const context = drawingSurface.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    const { data, width, height } = context.getImageData(
      0,
      0,
      drawingSurface.width,
      drawingSurface.height,
    );
    let count = 0;
    let xTotal = 0;
    let yTotal = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (
          data[offset] === target[0] &&
          data[offset + 1] === target[1] &&
          data[offset + 2] === target[2] &&
          data[offset + 3] === 255
        ) {
          count += 1;
          xTotal += x;
          yTotal += y;
        }
      }
    }
    if (count === 0) throw new Error(`Target color ${target.join(',')} was not rendered.`);
    return { x: xTotal / count, y: yTotal / count };
  }, color);
}

test('가로폰 액션 게임은 visual viewport와 safe area 안에 한 화면으로 들어온다', async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const viewport of [
    { width: 568, height: 320 },
    { width: 667, height: 375 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const game of ACTION_GAMES) {
      await openGame(page, game);
      const safeArea = { top: 6, right: 18, bottom: 12, left: 24 };
      await page.evaluate((safe) => {
        const style = document.documentElement.style;
        style.setProperty('--game-safe-top', `${String(safe.top)}px`);
        style.setProperty('--game-safe-right', `${String(safe.right)}px`);
        style.setProperty('--game-safe-bottom', `${String(safe.bottom)}px`);
        style.setProperty('--game-safe-left', `${String(safe.left)}px`);
      }, safeArea);

      const selectors = [
        PRIMARY_SURFACE[game],
        ...PLAYER_CONTROLS[game],
        '.game-hud [data-action="lobby"]',
        '.game-hud [data-action="rules"]',
        '#game-start',
        '.game-hud [data-action="reset"]',
        '.game-hud [data-action="settings"]',
      ];
      if (game === 'pong' || game === 'volleyball' || game === 'pinball-drop') {
        selectors.push('.game-local-score');
      }
      const result = await page.evaluate(
        ({ targets, safe }) => {
          const viewport = window.visualViewport;
          const bounds = {
            top: (viewport?.offsetTop ?? 0) + safe.top,
            right:
              (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - safe.right,
            bottom:
              (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - safe.bottom,
            left: (viewport?.offsetLeft ?? 0) + safe.left,
          };
          const rectangles = targets.map((selector) => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`Missing one-screen target: ${selector}`);
            const rect = element.getBoundingClientRect();
            return {
              selector,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            };
          });
          const touchButtons = [...document.querySelectorAll<HTMLElement>('#game-host button')]
            .map((button) => button.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0);
          return {
            bounds,
            rectangles,
            touchButtons,
            documentWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            documentHeight: document.documentElement.scrollHeight,
            clientHeight: document.documentElement.clientHeight,
          };
        },
        { targets: selectors, safe: safeArea },
      );

      expect(result.documentWidth).toBeLessThanOrEqual(result.clientWidth + 1);
      expect(result.documentHeight).toBeLessThanOrEqual(result.clientHeight + 1);
      for (const rect of result.rectangles) {
        expect(rect.left, `${game} ${rect.selector} left`).toBeGreaterThanOrEqual(
          result.bounds.left - 1,
        );
        expect(rect.right, `${game} ${rect.selector} right`).toBeLessThanOrEqual(
          result.bounds.right + 1,
        );
        expect(rect.top, `${game} ${rect.selector} top`).toBeGreaterThanOrEqual(
          result.bounds.top - 1,
        );
        expect(rect.bottom, `${game} ${rect.selector} bottom`).toBeLessThanOrEqual(
          result.bounds.bottom + 1,
        );
      }
      expect(result.rectangles[0]?.width).toBeGreaterThanOrEqual(120);
      expect(result.rectangles[0]?.height).toBeGreaterThanOrEqual(100);
      for (const rect of result.touchButtons) {
        expect(rect.width, `${game} touch width`).toBeGreaterThanOrEqual(43.5);
        expect(rect.height, `${game} touch height`).toBeGreaterThanOrEqual(43.5);
      }
      if (game === 'reaction-duel') {
        const size = await page
          .locator('.reaction-round')
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(size).toBeGreaterThanOrEqual(11);
      }
      if (game === 'tap-battle') {
        for (const selector of [
          '.tap-battle__clock span',
          '.tap-battle__zone > span:nth-of-type(2)',
        ]) {
          const size = await page
            .locator(selector)
            .first()
            .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
          expect(size).toBeGreaterThanOrEqual(11);
        }
      }
    }
  }
});

test('visual viewport이 이동해도 게임 HUD는 보이는 영역 안에 남는다', async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, {
      height: 280,
      width: 548,
      offsetTop: 20,
      offsetLeft: 10,
      pageTop: 20,
      pageLeft: 10,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
  });
  await page.setViewportSize({ width: 568, height: 320 });
  await openGame(page, 'pong');
  const bounds = await page.locator('.game-view').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(20);
  expect(bounds.left).toBeGreaterThanOrEqual(10);
  expect(bounds.right).toBeLessThanOrEqual(558);
  expect(bounds.bottom).toBeLessThanOrEqual(300);
});

test('확대로 visual viewport가 극단적으로 작아지면 잘림 대신 스크롤로 전환한다', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, {
      height: 160,
      width: 284,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 2,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
  });
  await page.setViewportSize({ width: 568, height: 320 });
  await openGame(page, 'pong');
  await expect(page.locator('html')).toHaveAttribute('data-visual-viewport-fallback', 'true');
  const layout = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app-frame');
    if (!app) throw new Error('App frame is unavailable.');
    return {
      bodyOverflow: getComputedStyle(document.body).overflow,
      appPosition: getComputedStyle(app).position,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.bodyOverflow).toBe('auto');
  expect(layout.appPosition).toBe('static');
  expect(layout.scrollHeight).toBeGreaterThan(160);
  expect(layout.scrollWidth).toBeGreaterThanOrEqual(284);
});

test('지원 viewport에서 액션 게임 터치 버튼은 44px이고 가로 overflow가 없다', async ({ page }) => {
  test.setTimeout(60_000);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const game of ACTION_GAMES) {
      await openGame(page, game);
      const dimensions = await page.evaluate(() => {
        const buttons = [
          ...document.querySelectorAll<HTMLElement>('.game-hud button, #game-host button'),
        ]
          .map((button) => button.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        return {
          buttons,
          documentWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      for (const rect of dimensions.buttons) {
        expect(
          rect.width,
          `${game} ${String(viewport.width)}px touch width`,
        ).toBeGreaterThanOrEqual(43.5);
        expect(
          rect.height,
          `${game} ${String(viewport.width)}px touch height`,
        ).toBeGreaterThanOrEqual(43.5);
      }
    }
  }
});

test('탁구와 배구는 양쪽 pointer hold를 동시에 처리하고 모든 종료 경로에서 해제한다', async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const game of ['pong', 'volleyball'] as const) {
    await openGame(page, game);
    await page.locator('#game-start').click();
    await expect(page.locator('#game-phase')).toHaveText('경기 중', { timeout: 15_000 });
    const first = page.locator(`${PLAYER_CONTROLS[game][0]} button`).first();
    const second = page.locator(`${PLAYER_CONTROLS[game][1]} button`).nth(1);
    const canvas = page.locator(`${GAME_ROOT[game]} canvas`);
    const firstBefore = await colorCentroid(canvas, [69, 228, 224]);
    const secondBefore = await colorCentroid(canvas, [255, 93, 158]);
    await first.focus();
    await dispatchPointer(first, 'pointerdown', 101);
    await second.focus();
    await expect(first).toHaveAttribute('data-pressed', 'true');
    await dispatchPointer(second, 'pointerdown', 202);
    await expect(first).toHaveAttribute('data-pressed', 'true');
    await expect(second).toHaveAttribute('data-pressed', 'true');

    // A matching global key may overlap a still-held touch. Releasing the key
    // must not overwrite the independent pointer source before the next frame.
    await page.evaluate(
      (code) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code }));
        window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code }));
      },
      game === 'pong' ? 'KeyW' : 'KeyA',
    );
    await expect(first).toHaveAttribute('data-pressed', 'true');
    await expect
      .poll(
        async () => {
          const firstAfterKeyRelease = await colorCentroid(canvas, [69, 228, 224]);
          const secondAfter = await colorCentroid(canvas, [255, 93, 158]);
          return game === 'pong'
            ? firstAfterKeyRelease.y < firstBefore.y - 4 && secondAfter.y > secondBefore.y + 4
            : firstAfterKeyRelease.x < firstBefore.x - 4 && secondAfter.y < secondBefore.y - 4;
        },
        {
          message: `${game} should move both held players after the overlapping key is released`,
          timeout: 3_000,
        },
      )
      .toBe(true);

    await dispatchPointer(first, 'lostpointercapture', 101);
    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent('pointercancel', { bubbles: true, pointerId: 202, pointerType: 'touch' }),
      );
    });
    await expect(first).toHaveAttribute('data-pressed', 'false');
    await expect(second).toHaveAttribute('data-pressed', 'false');

    await dispatchPointer(first, 'pointerdown', 303);
    await dispatchPointer(second, 'pointerdown', 404);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(first).toHaveAttribute('data-pressed', 'false');
    await expect(second).toHaveAttribute('data-pressed', 'false');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await dispatchPointer(first, 'pointerdown', 505);
    await page.locator('[data-action="reset"]').click();
    await expect(first).toHaveAttribute('data-pressed', 'false');

    await dispatchPointer(first, 'pointerdown', 606);
    await page.goto('./play/#lobby');
    await openGame(page, game);
    await expect(page.locator(`${PLAYER_CONTROLS[game][0]} button`).first()).toHaveAttribute(
      'data-pressed',
      'false',
    );
  }
});

test('핀볼 부스터는 양쪽 pointerdown을 즉시 한 번씩 처리하고 후속 click을 무시한다', async ({
  page,
}) => {
  test.setTimeout(15_000);
  await openGame(page, 'pinball-drop');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('경기 중', { timeout: 6_000 });
  const buttons = page.locator('.pinball-game .touch-controls > button');
  const first = buttons.nth(0);
  const second = buttons.nth(1);

  await page.evaluate(() => {
    const [left, right] = [
      ...document.querySelectorAll<HTMLButtonElement>('.pinball-game .touch-control'),
    ];
    left?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 11,
        pointerType: 'touch',
      }),
    );
    right?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 22,
        pointerType: 'touch',
      }),
    );
  });
  await expect(first).toContainText('×2');
  await expect(second).toContainText('×2');

  await dispatchPointer(first, 'pointerup', 11);
  await dispatchPointer(second, 'pointerup', 22);
  await expect(first).toBeEnabled({ timeout: 2_000 });
  await expect(second).toBeEnabled({ timeout: 2_000 });
  await simulateRepeatedKeyboardActivation(second);
  await expect(second).toContainText('×2');
  await first.dispatchEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  await expect(first).toContainText('×2');
  await expect(second).toContainText('×2');

  await dispatchPointer(first, 'pointerdown', 33);
  await expect(first).toContainText('×1');
  await expect(first).toHaveAttribute('data-pressed', 'true');
  await dispatchPointer(first, 'pointercancel', 33);
  await expect(first).toHaveAttribute('data-pressed', 'false');
  await first.dispatchEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  await expect(first).toContainText('×1');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(first).toHaveAttribute('data-pressed', 'false');
  await expect(second).toHaveAttribute('data-pressed', 'false');
});

test('탭 배틀은 동시 pointer와 빠른 연타 수를 정확히 세고 정리한다', async ({ page }) => {
  await openGame(page, 'tap-battle');
  await page.locator('#game-start').click();
  const first = page.locator('[data-zone="1"]');
  const second = page.locator('[data-zone="2"]');

  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'KeyF', key: 'f', repeat: true }),
    );
  });
  await expect(page.locator('[data-count="1"]')).toHaveText('0');

  await dispatchPointer(first, 'pointerdown', 1);
  await dispatchPointer(second, 'pointerdown', 2);
  await dispatchPointer(first, 'pointerdown', 1);
  await first.dispatchEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  await expect(page.locator('[data-count="1"]')).toHaveText('1');
  await expect(page.locator('[data-count="2"]')).toHaveText('1');
  await simulateRepeatedKeyboardActivation(first);
  await expect(page.locator('[data-count="1"]')).toHaveText('1');
  await dispatchPointer(first, 'pointerup', 1);
  await dispatchPointer(second, 'pointerup', 2);

  await page.evaluate(() => {
    const zones = [...document.querySelectorAll<HTMLButtonElement>('.tap-battle__zone')];
    for (let index = 0; index < 40; index += 1) {
      for (const [playerIndex, zone] of zones.entries()) {
        const pointerId = 100 + index * 2 + playerIndex;
        zone.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: 'touch',
          }),
        );
        zone.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, pointerId, pointerType: 'touch' }),
        );
      }
    }
  });
  await expect(page.locator('[data-count="1"]')).toHaveText('41');
  await expect(page.locator('[data-count="2"]')).toHaveText('41');

  await dispatchPointer(first, 'pointerdown', 501);
  await dispatchPointer(second, 'pointerdown', 502);
  await page.locator('#game-start').click();
  await expect(first).toHaveAttribute('data-pressed', 'false');
  await expect(second).toHaveAttribute('data-pressed', 'false');

  await page.locator('#game-start').click();
  await dispatchPointer(first, 'pointerdown', 601);
  await page.locator('[data-action="reset"]').click();
  await expect(first).toHaveAttribute('data-pressed', 'false');

  await page.locator('#game-start').click();
  await dispatchPointer(first, 'pointerdown', 701);
  await page.goto('./play/#lobby');
  await openGame(page, 'tap-battle');
  await expect(page.locator('[data-zone="1"]')).not.toHaveAttribute('data-pressed', 'true');
});

test('반응속도 대결은 양쪽 pointer를 동시 처리하고 종료 경로에서 정리한다', async ({ page }) => {
  test.setTimeout(30_000);
  await openGame(page, 'reaction-duel');
  const first = page.locator('[data-reaction-zone="1"]');
  const second = page.locator('[data-reaction-zone="2"]');

  await dispatchPointer(first, 'pointerdown', 701);
  await dispatchPointer(second, 'pointerdown', 701);
  await expect(first).toHaveAttribute('data-pressed', 'true');
  await expect(second).toHaveAttribute('data-pressed', 'false');
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointercancel', { bubbles: true, pointerId: 701, pointerType: 'touch' }),
    );
  });
  await expect(first).toHaveAttribute('data-pressed', 'false');

  await dispatchPointer(first, 'pointerdown', 702);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(first).toHaveAttribute('data-pressed', 'false');

  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('카운트다운');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
  await dispatchPointer(first, 'pointerdown', 750);
  await expect(first).toHaveAttribute('data-pressed', 'true');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('카운트다운');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
  await expect(first).toHaveAttribute('data-pressed', 'false');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('카운트다운');
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'KeyF', key: 'f', repeat: true }),
    );
  });
  await expect(page.locator('#game-phase')).toHaveText('카운트다운');
  await expect(page.locator('[data-score="1"]')).toHaveText('0');
  await expect(page.locator('[data-score="2"]')).toHaveText('0');
  await expect(page.locator('#game-phase')).toHaveText('경기 중', { timeout: 5_000 });
  await first.dispatchEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  await page.waitForTimeout(50);
  await expect(page.locator('#game-phase')).toHaveText('경기 중');
  await expect(page.locator('[data-score="1"]')).toHaveText('0');
  await expect(page.locator('[data-score="2"]')).toHaveText('0');
  await page.evaluate(() => {
    const zones = [...document.querySelectorAll<HTMLButtonElement>('[data-reaction-zone]')];
    zones[0]?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 801,
        pointerType: 'touch',
      }),
    );
    zones[1]?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 802,
        pointerType: 'touch',
      }),
    );
  });

  await expect(page.locator('[data-message]')).toContainText('8ms 이하여서 동점');
  await expect(page.locator('[data-score="1"]')).toHaveText('0');
  await expect(page.locator('[data-score="2"]')).toHaveText('0');
  await expect(first).toHaveAttribute('data-pressed', 'false');
  await expect(second).toHaveAttribute('data-pressed', 'false');

  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('경기 중', { timeout: 5_000 });
  await page.evaluate(() => {
    const zone = document.querySelector<HTMLButtonElement>('[data-reaction-zone="1"]');
    zone?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 901,
        pointerType: 'touch',
      }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'KeyJ', key: 'j' }));
  });
  await expect(page.locator('[data-message]')).toContainText('8ms 이하여서 동점');

  await dispatchPointer(first, 'pointerdown', 1001);
  await page.locator('[data-action="reset"]').click();
  await expect(first).toHaveAttribute('data-pressed', 'false');
  await dispatchPointer(first, 'pointerdown', 1002);
  await page.goto('./play/#lobby');
  await openGame(page, 'reaction-duel');
  await expect(page.locator('[data-reaction-zone="1"]')).toHaveAttribute('data-pressed', 'false');
});

async function clickOmokCell(page: Page, row: number, col: number): Promise<void> {
  const box = await page.locator('.omok-canvas').boundingBox();
  if (!box) throw new Error('Omok canvas is not visible.');
  const logical = (index: number): number => 50 + index * ((720 - 100) / 14);
  await page.mouse.click(
    box.x + (logical(col) / 720) * box.width,
    box.y + (logical(row) / 720) * box.height,
  );
}

test('오목은 모바일 선택·확정·취소와 데스크톱 빠른 착수를 구분한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page, 'omok');
  await expect(page.locator('.omok-rule-badge')).toHaveText('자유룰 · 5개 이상 연결');
  await expect(page.locator('.omok-canvas')).not.toHaveAttribute('role', 'application');
  await page.locator('#game-start').click();

  await clickOmokCell(page, 7, 7);
  await expect(page.locator('[data-role="move-count"]')).toHaveText('0수');
  await expect(page.locator('[data-role="placement-controls"]')).toBeVisible();
  await expect(page.locator('[data-role="pending-coordinate"]')).toHaveText('H8');
  await page.locator('[data-role="confirm-placement"]').click();
  await expect(page.locator('[data-role="move-count"]')).toHaveText('1수');

  await clickOmokCell(page, 7, 7);
  await expect(page.locator('[data-role="confirm-placement"]')).toBeDisabled();
  await page.locator('[data-role="cancel-placement"]').click();
  await expect(page.locator('[data-role="placement-controls"]')).toBeHidden();
  await expect(page.locator('[data-role="move-count"]')).toHaveText('1수');

  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page, 'omok');
  await page.locator('#game-start').click();
  await clickOmokCell(page, 7, 7);
  const stillCoarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (stillCoarse) {
    await expect(page.locator('[data-role="move-count"]')).toHaveText('0수');
    await page.locator('[data-role="confirm-placement"]').click();
  }
  await expect(page.locator('[data-role="move-count"]')).toHaveText('1수');
  await expect(page.locator('[data-role="placement-controls"]')).toBeHidden();
});

test('오목은 키보드 착수, 확인형 무르기, 다음 라운드를 지원한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page, 'omok');
  await page.locator('#game-start').click();
  const canvas = page.locator('.omok-canvas');
  await canvas.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-role="move-count"]')).toHaveText('1수');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('[data-role="undo"]').click();
  await expect(page.locator('[data-role="move-count"]')).toHaveText('1수');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-role="undo"]').click();
  await expect(page.locator('[data-role="move-count"]')).toHaveText('0수');

  await canvas.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  for (let column = 1; column <= 4; column += 1) {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#game-phase')).toHaveText('라운드 종료');
  await expect(page.locator('[data-role="status"]')).toContainText('A1부터 E1까지');
  const nextRound = page.locator('[data-role="next-round"]');
  await nextRound.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-phase')).toHaveText('경기 중');
  await expect(page.locator('[data-role="move-count"]')).toHaveText('0수');
});
