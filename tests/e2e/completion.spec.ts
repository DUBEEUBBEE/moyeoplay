import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

type GameId =
  | 'omok'
  | 'pong'
  | 'volleyball'
  | 'pinball-drop'
  | 'ladder'
  | 'reaction-duel'
  | 'tap-battle'
  | 'roulette';

type ExpectedWinner = 0 | 1 | 2 | 'either';

interface StoredSession {
  readonly versusWins: readonly [number, number];
  readonly recent: readonly {
    readonly gameId: string;
    readonly winner: number;
    readonly score?: readonly [number, number];
  }[];
}

const SHORT_TITLES: Record<GameId, string> = {
  omok: '오목',
  pong: '탁구',
  volleyball: '배구',
  'pinball-drop': '핀볼',
  ladder: '사다리',
  'reaction-duel': '반응속도',
  'tap-battle': '탭 배틀',
  roulette: '룰렛',
};

async function openGame(page: Page, gameId: GameId): Promise<void> {
  await page.goto(`./#game/${gameId}`);
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(serious).toEqual([]);
}

async function advanceUntil(
  page: Page,
  condition: () => Promise<boolean>,
  maximumMilliseconds: number,
  stepMilliseconds = 250,
): Promise<void> {
  for (let elapsed = 0; elapsed <= maximumMilliseconds; elapsed += stepMilliseconds) {
    if (await condition()) return;
    await page.clock.runFor(stepMilliseconds);
  }
  throw new Error(`Condition did not become true within ${String(maximumMilliseconds)}ms`);
}

async function expectCompletedSession(
  page: Page,
  gameId: GameId,
  expectedWinner: ExpectedWinner,
): Promise<void> {
  const resultDialog = page.getByRole('dialog', { name: '경기 결과' });
  await expect(resultDialog).toBeVisible();
  await expect(page.locator('#game-phase')).toHaveText('경기 종료');
  await expectNoSeriousAxeViolations(page);

  await resultDialog.getByRole('button', { name: '로비로 이동' }).click();
  await expect(page).toHaveURL(/#lobby$/);
  const recentItem = page.locator('#recent-list li').first();
  await expect(recentItem.locator('strong')).toHaveText(SHORT_TITLES[gameId]);

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('moyeoplay:session');
    if (!raw) throw new Error('Completed game did not persist a session record.');
    return JSON.parse(raw) as StoredSession;
  });
  const latest = stored.recent[0];
  expect(latest?.gameId).toBe(gameId);

  if (expectedWinner === 'either') {
    expect([1, 2]).toContain(latest?.winner);
    expect(stored.versusWins[0] + stored.versusWins[1]).toBe(1);
  } else {
    expect(latest?.winner).toBe(expectedWinner);
    expect(stored.versusWins).toEqual(
      expectedWinner === 1 ? [1, 0] : expectedWinner === 2 ? [0, 1] : [0, 0],
    );
  }
}

async function placeOmokStone(page: Page, row: number, column: number): Promise<void> {
  await page.locator('[data-role="row-select"]').selectOption(String(row));
  await page.locator('[data-role="column-select"]').selectOption(String(column));
  await page.locator('[data-role="place-coordinate"]').click();
}

async function pressPointer(locator: Locator, pointerId: number): Promise<void> {
  await locator.dispatchEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === 1,
  });
  await locator.dispatchEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
    isPrimary: pointerId === 1,
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('오목은 단판의 실제 5목으로 완료되고 결과와 세션을 기록한다', async ({ page }) => {
  await openGame(page, 'omok');
  await page.locator('[data-role="best-of"]').selectOption('1');
  await page.locator('#game-start').click();
  await page.getByText('키보드 좌표로 착수').click();

  for (const [row, column] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
    [1, 2],
    [0, 3],
    [1, 3],
    [0, 4],
  ] as const) {
    await placeOmokStone(page, row, column);
  }

  await expectCompletedSession(page, 'omok', 1);
});

test('네온 탁구는 5점 매치를 실제 프레임으로 완료하고 세션을 기록한다', async ({ page }) => {
  test.setTimeout(45_000);
  await openGame(page, 'pong');
  await page.getByRole('combobox', { name: '탁구 선취점' }).selectOption('5');
  await page.locator('#game-start').click();
  await page.keyboard.down('s');
  await page.keyboard.down('ArrowDown');

  const dialog = page.getByRole('dialog', { name: '경기 결과' });
  await advanceUntil(page, () => dialog.isVisible(), 70_000);
  await page.keyboard.up('s');
  await page.keyboard.up('ArrowDown');
  await expectCompletedSession(page, 'pong', 'either');
});

test('통통 배구는 5점 매치를 실제 프레임으로 완료하고 세션을 기록한다', async ({ page }) => {
  test.setTimeout(45_000);
  await openGame(page, 'volleyball');
  await page.getByRole('combobox', { name: '배구 선취점' }).selectOption('5');
  await page.locator('#game-start').click();
  await page.keyboard.down('a');
  await page.keyboard.down('ArrowRight');

  const dialog = page.getByRole('dialog', { name: '경기 결과' });
  await advanceUntil(page, () => dialog.isVisible(), 80_000);
  await page.keyboard.up('a');
  await page.keyboard.up('ArrowRight');
  await expectCompletedSession(page, 'volleyball', 'either');
});

test('핀볼은 부스터를 사용한 2선승 매치를 완료하고 세션을 기록한다', async ({ page }) => {
  test.setTimeout(45_000);
  await openGame(page, 'pinball-drop');
  await page.locator('#game-start').click();
  const boost = page.locator('.pinball-boost').first();
  const dialog = page.getByRole('dialog', { name: '경기 결과' });

  for (let elapsed = 0; elapsed <= 100_000; elapsed += 100) {
    if (await dialog.isVisible()) break;
    if (
      (await page.locator('#game-phase').textContent()) === '경기 중' &&
      (await boost.isEnabled())
    ) {
      await page.keyboard.press('a');
    }
    await page.clock.runFor(100);
  }
  await expect(dialog).toBeVisible();
  await expectCompletedSession(page, 'pinball-drop', 'either');
});

test('사다리는 전체 실제 경로를 공개해 완료되고 비대결 세션을 기록한다', async ({ page }) => {
  await openGame(page, 'ladder');
  await page.locator('#game-start').click();
  await page.locator('[data-action="show-all"]').click();
  await expect(page.locator('[data-result-list] li')).toHaveCount(4);
  await expectCompletedSession(page, 'ladder', 0);
});

test('반응속도 대결은 3번의 실제 부정 출발 판정으로 완료되고 세션을 기록한다', async ({ page }) => {
  await openGame(page, 'reaction-duel');
  for (let round = 1; round <= 3; round += 1) {
    await page.locator('#game-start').click();
    await expect(page.locator('#game-phase')).toHaveText('카운트다운');
    await pressPointer(page.locator('[data-reaction-zone="2"]'), 600 + round);
    await expect(page.locator('[data-score="1"]')).toHaveText(String(round));
  }
  await expectCompletedSession(page, 'reaction-duel', 1);
});

test('탭 배틀은 5초 실제 타이머를 완료하고 결과와 세션을 기록한다', async ({ page }) => {
  await openGame(page, 'tap-battle');
  await page.locator('[data-duration]').selectOption('5');
  await page.locator('#game-start').click();
  await page.keyboard.press('f');
  await page.clock.runFor(5_100);
  await expect(page.locator('[data-result-title]')).toContainText('PLAYER 1 승리');
  await expectCompletedSession(page, 'tap-battle', 1);
});

test('룰렛은 선택된 칸에 실제로 정착해 완료되고 비대결 세션을 기록한다', async ({ page }) => {
  await openGame(page, 'roulette');
  await page.locator('#game-start').click();
  await page.clock.runFor(700);
  await expect(page.locator('[data-result-text]')).not.toHaveText('');
  await expectCompletedSession(page, 'roulette', 0);
});
