import { expect, test, type Page } from '@playwright/test';

type ClipboardWindow = Window &
  typeof globalThis & {
    __ladderCopiedText?: string;
  };

const TEST_NAMES = ['가람', '나래', '다온', '라온'] as const;
const TEST_OUTCOMES = ['결과-ALPHA', '결과-BRAVO', '결과-CHARLIE', '결과-DELTA'] as const;

async function openLadder(page: Page): Promise<void> {
  await page.goto('./#game/ladder');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.ladder-game')).toHaveAttribute('data-round-state', 'editing');
}

async function fillFourEntries(page: Page): Promise<void> {
  const root = page.locator('.ladder-game');
  for (let index = 0; index < TEST_NAMES.length; index += 1) {
    await root
      .locator(`[data-kind="name"][data-index="${String(index)}"]`)
      .fill(TEST_NAMES[index] ?? '');
    await root
      .locator(`[data-kind="outcome"][data-index="${String(index)}"]`)
      .fill(TEST_OUTCOMES[index] ?? '');
  }
}

async function commitAndRevealOne(page: Page): Promise<void> {
  const root = page.locator('.ladder-game');
  await fillFourEntries(page);
  await root.locator('[data-action="generate"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'committed');
  await root.locator('[data-run-index="0"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'revealing');
  await expect(root.locator('[data-result-list] li')).toHaveCount(1);
}

async function closeResultDialog(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: '경기 결과' })
    .getByRole('button', { name: '경기 결과 닫기' })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('생성 직후와 부분 공개에서는 설정·전체 결과·생성 ID가 봉인된다', async ({ page }) => {
  await openLadder(page);
  await fillFourEntries(page);
  const root = page.locator('.ladder-game');
  const canvas = root.locator('canvas');

  await root.locator('[data-action="generate"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'committed');
  for (const input of await root.locator('input').all()) await expect(input).toBeDisabled();
  await expect(root.locator('[data-action="decrease"]')).toBeDisabled();
  await expect(root.locator('[data-action="increase"]')).toBeDisabled();
  await expect(root.locator('[data-action="shuffle"]')).toBeDisabled();
  await expect(root.locator('[data-action="generate"]')).toBeDisabled();
  await expect(root.locator('[data-action="copy"]')).toBeDisabled();
  await expect(root.locator('[data-audit]')).toBeHidden();
  await expect(root.locator('[data-round-id]')).toHaveText('');
  await expect(canvas).not.toHaveAttribute('aria-label', /ALPHA|BRAVO|CHARLIE|DELTA/);

  const committedText = (await root.textContent()) ?? '';
  for (const outcome of TEST_OUTCOMES) expect(committedText).not.toContain(outcome);

  await root.locator('[data-run-index="0"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'revealing');
  await expect(root.locator('[data-result-list] li')).toHaveCount(1);
  await expect(root.locator('[data-action="copy"]')).toBeDisabled();
  await expect(page.locator('[data-action="reset"]')).toBeDisabled();
  await expect(root.locator('[data-audit]')).toBeHidden();
  await expect(root.locator('[data-round-id]')).toHaveText('');

  const partialText = (await root.textContent()) ?? '';
  const exposedOutcomes = TEST_OUTCOMES.filter((outcome) => partialText.includes(outcome));
  expect(exposedOutcomes).toHaveLength(1);
  const runLabels = await root.locator('[data-run-index]').allTextContents();
  expect(runLabels.filter((label) => label.includes('→'))).toHaveLength(1);
  await expect(canvas).not.toHaveAttribute('aria-label', /ALPHA|BRAVO|CHARLIE|DELTA/);

  await root.locator('[data-run-index="1"]').click();
  await expect(root.locator('[data-result-list] li')).toHaveCount(2);
  const twicePartialText = (await root.textContent()) ?? '';
  expect(TEST_OUTCOMES.filter((outcome) => twicePartialText.includes(outcome))).toHaveLength(2);
  await expect(root.locator('[data-action="copy"]')).toBeDisabled();
  await expect(root.locator('[data-round-id]')).toHaveText('');
});

test('설정 다시 편집 취소는 확정 라운드를 유지하고 승인은 완전히 폐기한다', async ({ page }) => {
  await openLadder(page);
  await commitAndRevealOne(page);
  const root = page.locator('.ladder-game');
  const revealedText = await root.locator('[data-result-list] li').innerText();

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('지금까지 공개한 결과');
    void dialog.dismiss();
  });
  await root.locator('[data-action="edit"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'revealing');
  expect(await root.locator('[data-result-list] li').innerText()).toBe(revealedText);
  for (const input of await root.locator('input').all()) await expect(input).toBeDisabled();
  await expect(root.locator('[data-action="copy"]')).toBeDisabled();

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('지금까지 공개한 결과');
    void dialog.accept();
  });
  await root.locator('[data-action="edit"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'editing');
  for (const input of await root.locator('input').all()) await expect(input).toBeEnabled();
  await expect(root.locator('[data-action="generate"]')).toBeEnabled();
  await expect(root.locator('[data-action="show-all"]')).toBeDisabled();
  await expect(root.locator('[data-action="copy"]')).toBeDisabled();
  await expect(root.locator('[data-run-index]')).toHaveCount(4);
  for (const runButton of await root.locator('[data-run-index]').all()) {
    await expect(runButton).toBeDisabled();
    await expect(runButton).not.toContainText('→');
  }
  await expect(root.locator('[data-results]')).toBeHidden();
  await expect(root.locator('[data-audit]')).toBeHidden();
  await expect(root.locator('[data-round-id]')).toHaveText('');
  await expect(root.locator('canvas')).toHaveAttribute(
    'aria-label',
    '사다리가 아직 생성되지 않았습니다',
  );
});

test('확정 직후 공통 다시 시작도 확인 없이 snapshot을 폐기하지 않는다', async ({ page }) => {
  await openLadder(page);
  await fillFourEntries(page);
  const root = page.locator('.ladder-game');
  await root.locator('[data-action="generate"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'committed');
  await expect(page.locator('#game-phase')).toHaveText('경기 중');

  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.locator('[data-action="reset"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'committed');
  await expect(page.locator('#game-phase')).toHaveText('경기 중');
  for (const input of await root.locator('input').all()) await expect(input).toBeDisabled();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('[data-action="reset"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'editing');
  await expect(page.locator('#game-phase')).toHaveText('시작 대기');
  for (const input of await root.locator('input').all()) await expect(input).toBeEnabled();
});

test('전체 공개 뒤 화면의 모든 결과만 정확히 복사하고 생성 ID를 공개한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          (window as ClipboardWindow).__ladderCopiedText = value;
          return Promise.resolve();
        },
      },
    });
  });
  await openLadder(page);
  await fillFourEntries(page);
  const root = page.locator('.ladder-game');

  await root.locator('[data-action="generate"]').click();
  await root.locator('[data-action="show-all"]').click();
  await expect(root).toHaveAttribute('data-round-state', 'completed');
  await closeResultDialog(page);
  await expect(root.locator('[data-result-list] li')).toHaveCount(4);
  await expect(root.locator('[data-action="copy"]')).toBeEnabled();
  await expect(root.locator('[data-audit]')).toBeVisible();
  await expect(root.locator('[data-round-id]')).not.toHaveText('');

  const displayed = await root
    .locator('[data-result-list] li')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).innerText.replace(/\s+/g, ' ').trim()),
    );
  await root.locator('[data-action="copy"]').click();
  const copied = await page.evaluate(() => (window as ClipboardWindow).__ladderCopiedText ?? '');
  expect(copied.split('\n').map((line) => line.replace(/\s+/g, ' ').trim())).toEqual(displayed);
});

test('Clipboard API와 기존 복사가 모두 실패해도 결과를 직접 선택할 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
    Object.defineProperty(Document.prototype, 'execCommand', {
      configurable: true,
      value: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });
  await openLadder(page);
  const root = page.locator('.ladder-game');
  await root.locator('[data-action="generate"]').click();
  await root.locator('[data-action="show-all"]').click();
  await closeResultDialog(page);
  await root.locator('[data-action="copy"]').click();
  await expect(root.locator('[data-status]')).toContainText('직접 선택');
  await expect(root.locator('[data-result-list]')).toBeFocused();
  await expect(root.locator('textarea[aria-hidden="true"]')).toHaveCount(0);
});

test('참가자 2명과 8명 경계에서도 확정과 전체 공개가 완료된다', async ({ page }) => {
  for (const count of [2, 8]) {
    await openLadder(page);
    const root = page.locator('.ladder-game');
    const delta = count - 4;
    const action = delta < 0 ? 'decrease' : 'increase';
    for (let index = 0; index < Math.abs(delta); index += 1) {
      await root.locator(`[data-action="${action}"]`).click();
    }
    await expect(root.locator('[data-count]')).toHaveText(`${String(count)}명`);
    await root.locator('[data-action="generate"]').click();
    await expect(root.locator('[data-run-index]')).toHaveCount(count);
    await root.locator('[data-action="show-all"]').click();
    await expect(root).toHaveAttribute('data-round-state', 'completed');
    await closeResultDialog(page);
    await expect(root.locator('[data-result-list] li')).toHaveCount(count);
    await expect(root.locator('[data-action="copy"]')).toBeEnabled();
    await page.goto('./#lobby');
  }
});
