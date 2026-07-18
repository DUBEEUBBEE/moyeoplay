import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

test('로비는 데스크톱과 모바일에서 오버플로 없이 로드된다', async ({ page }) => {
  const errors = collectPageErrors(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./#lobby');
    await expect(page.getByRole('heading', { name: /친구들이 모이면/ })).toBeVisible();
    await expect(page.locator('[data-game-id]')).toHaveCount(8);
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('모든 게임 카드가 열리고 로비로 돌아온다', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('./#lobby');
  for (const gameId of games) {
    await page.locator(`[data-game-id="${gameId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#game/${gameId}$`));
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('[data-action="lobby"]').last().click();
    await expect(page).toHaveURL(/#lobby$/);
  }
  expect(errors).toEqual([]);
});

test('SPA 화면 전환 뒤 키보드 포커스가 새 화면 제목으로 이동한다', async ({ page }) => {
  await page.goto('./#lobby');
  const omokCard = page.locator('[data-game-id="omok"]');
  await omokCard.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#stage-title')).toBeFocused();
  await page.getByRole('button', { name: '로비로 이동', exact: true }).press('Enter');
  await expect(page.locator('#hero-title')).toBeFocused();
});

test('모든 직접 hash URL에서 시작, 일시정지, 재시작을 사용할 수 있다', async ({ page }) => {
  const errors = collectPageErrors(page);
  for (const gameId of games) {
    await page.goto(`./#game/${gameId}`);
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#game-start').click();
    await expect(page.locator('#game-phase')).not.toHaveText('시작 대기');
    const phase = await page.locator('#game-phase').textContent();
    if (phase === '경기 중' || phase === '카운트다운') {
      await page.locator('#game-start').click();
      await expect(page.locator('#game-phase')).toHaveText('일시정지');
    }
    if (gameId === 'ladder') page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('[data-action="reset"]').click();
    await expect(page.locator('#game-phase')).toHaveText('시작 대기');
  }
  expect(errors).toEqual([]);
});

test('플레이어 이름과 사운드 설정은 새로고침 후 유지된다', async ({ page }) => {
  await page.goto('./#lobby');
  await page.locator('[data-action="settings"]').first().click();
  const dialog = page.getByRole('dialog', { name: '플레이 설정' });
  await dialog.locator('[name="player1"]').fill('민수');
  await dialog.locator('[name="player2"]').fill('지우');
  await dialog.locator('[name="sound"]').uncheck();
  await dialog.getByRole('button', { name: '설정 저장' }).click();
  await page.reload();
  await expect(page.locator('[data-player-name="1"]')).toHaveText('민수');
  await expect(page.locator('[data-player-name="2"]')).toHaveText('지우');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('data-muted', 'true');
});

test('게임 화면에서 바꾼 이름은 다음 시작 때 모듈 UI에도 반영된다', async ({ page }) => {
  const changeNames = async (playerOne: string, playerTwo: string): Promise<void> => {
    await page.locator('[data-action="settings"]').last().click();
    const dialog = page.getByRole('dialog', { name: '플레이 설정' });
    await dialog.locator('[name="player1"]').fill(playerOne);
    await dialog.locator('[name="player2"]').fill(playerTwo);
    await dialog.getByRole('button', { name: '설정 저장' }).click();
  };

  await page.goto('./#game/tap-battle');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await changeNames('민수', '지우');
  await page.locator('#game-start').click();
  await expect(page.locator('[data-zone-name="1"]')).toHaveText('민수');
  await expect(page.locator('[data-zone-name="2"]')).toHaveText('지우');

  await page.goto('./#game/reaction-duel');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await changeNames('하늘', '바다');
  await page.locator('#game-start').click();
  await expect(page.locator('[data-zone-name="1"]')).toHaveText('하늘');
  await expect(page.locator('[data-zone-name="2"]')).toHaveText('바다');

  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await changeNames('민트', '체리');
  await page.locator('#game-start').click();
  await expect(page.getByRole('button', { name: '민트 패들 위로' })).toBeVisible();
  await expect(page.getByRole('button', { name: '체리 패들 위로' })).toBeVisible();

  await page.goto('./#game/volleyball');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await changeNames('초록', '분홍');
  await page.locator('#game-start').click();
  await expect(page.getByRole('button', { name: '초록 왼쪽 이동' })).toBeVisible();
  await expect(page.getByRole('button', { name: '분홍 왼쪽 이동' })).toBeVisible();

  await page.goto('./#game/pinball-drop');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await changeNames('왼쪽', '오른쪽');
  await page.locator('#game-start').click();
  await expect(page.getByRole('button', { name: /왼쪽 부스터 사용/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /오른쪽 부스터 사용/ })).toBeVisible();
});

test('경기 중 규칙이나 설정을 열면 명시적으로 일시정지된다', async ({ page }) => {
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.locator('[data-action="rules"]').click();
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
  await page
    .getByRole('dialog', { name: '게임 규칙' })
    .getByRole('button', { name: '게임 규칙 닫기' })
    .click();
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
});

test('게임 안의 포커스 가능한 조작 버튼은 Space 키로 동작한다', async ({ page }) => {
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  const holdButton = page.getByRole('button', { name: /패들 위로/ }).first();
  await holdButton.focus();
  await page.keyboard.down('Space');
  await expect(holdButton).toHaveAttribute('data-pressed', 'true');
  await page.keyboard.up('Space');
  await expect(holdButton).toHaveAttribute('data-pressed', 'false');

  await page.goto('./#game/reaction-duel');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.getByRole('button', { name: '플레이어 1 반응 버튼' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#game-phase')).toHaveText('라운드 종료');
  await expect(page.locator('[data-round]')).toHaveText('ROUND 2');

  await page.goto('./#game/tap-battle');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  const tapZone = page.locator('.tap-battle__zone').first();
  await tapZone.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-count="1"]')).toHaveText('1');
});

test('게임 전환 후 이전 게임 DOM과 입력 대상이 남지 않는다', async ({ page }) => {
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.goto('./#game/omok');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#game-host canvas')).toHaveCount(1);
  await expect(page.locator('#game-host .pong-game')).toHaveCount(0);
  await page.keyboard.press('w');
  await expect(page.locator('#stage-title')).toHaveText('오목');
});

test('로비로 전환하면 이전 게임의 대기 중이거나 표시된 안내를 정리한다', async ({ page }) => {
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#app-announcer')).not.toHaveText('');
  await page.locator('#game-start').click();
  await page.goto('./#lobby');
  await expect(page.locator('#lobby-view')).toBeVisible();
  await page.waitForTimeout(60);
  await expect(page.locator('#app-announcer')).toHaveText('');
});

test('사다리 완료 뒤 공통 다시 하기는 새 사다리를 시작한다', async ({ page }) => {
  await page.goto('./#game/ladder');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.locator('[data-action="show-all"]').click();
  await expect(page.locator('#game-phase')).toHaveText('경기 종료');
  await page
    .getByRole('dialog', { name: '경기 결과' })
    .getByRole('button', { name: '경기 결과 닫기' })
    .click();
  await page.locator('#game-start').click();
  await expect(page.locator('#game-phase')).toHaveText('경기 중');
  await expect(page.locator('[data-action="show-all"]')).toBeEnabled();
  await expect(page.locator('[data-run-index].revealed')).toHaveCount(0);
});

test('잘못된 hash는 오류 없이 로비로 복귀한다', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('./#game/not-a-game');
  await expect(page).toHaveURL(/#lobby$/);
  await expect(page.locator('#lobby-view')).toBeVisible();
  expect(errors).toEqual([]);
});

test('로비와 게임 공통 화면에 심각한 axe 위반이 없다', async ({ page }) => {
  for (const path of ['./#lobby', './#game/omok']) {
    await page.goto(path);
    if (path.includes('/game/'))
      await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(serious).toEqual([]);
  }
});

test('모바일 터치 컨트롤은 390×844와 844×390 문서 너비 안에 있다', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const gameId of [
      'pong',
      'volleyball',
      'pinball-drop',
      'reaction-duel',
      'tap-battle',
    ] as const) {
      await page.goto(`./#game/${gameId}`);
      await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
      await expectNoHorizontalOverflow(page);
      const controlsFit = await page
        .locator(
          '#game-host :is(.touch-control, .touch-button, .boost-button, .tap-battle__zone, [data-reaction-zone])',
        )
        .evaluateAll((elements) =>
          elements.every((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= document.documentElement.scrollWidth + 1;
          }),
        );
      expect(controlsFit).toBe(true);
    }
  }
});

test('낮은 가로 화면의 one-screen 잘림 방지는 액션 게임에만 적용된다', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  for (const [gameId, finalControl] of [
    ['omok', '[data-role="undo"]'],
    ['ladder', '[data-action="copy"]'],
    ['roulette', '[data-spin]'],
  ] as const) {
    await page.goto(`./#game/${gameId}`);
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('body')).toHaveAttribute('data-one-screen-game', 'false');
    await expect(page.locator('.site-header')).toBeVisible();
    const layout = await page.evaluate(() => {
      const app = document.querySelector<HTMLElement>('.app-frame');
      const host = document.querySelector<HTMLElement>('#game-host');
      if (!app || !host) throw new Error('Game layout is unavailable.');
      return {
        bodyOverflow: getComputedStyle(document.body).overflow,
        appPosition: getComputedStyle(app).position,
        hostOverflow: getComputedStyle(host).overflow,
      };
    });
    expect(layout.bodyOverflow).not.toBe('hidden');
    expect(layout.appPosition).not.toBe('fixed');
    expect(layout.hostOverflow).not.toBe('hidden');
    const control = page.locator(finalControl);
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
  }
});

test('링크 공유 버튼은 현재 hash URL을 Web Share API에 전달한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        sessionStorage.setItem('moyeoplay-test-share-url', data.url ?? '');
        return Promise.resolve();
      },
    });
  });
  await page.goto('./#lobby');
  await page.getByRole('button', { name: '링크 공유' }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('moyeoplay-test-share-url')))
    .toMatch(/#lobby$/);
});
