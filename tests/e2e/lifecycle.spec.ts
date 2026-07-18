import { expect, test, type Page } from '@playwright/test';

interface ResourceProbeSnapshot {
  animationFrames: number;
  eventListeners: number;
  resizeObservers: number;
  timeouts: number;
}

type ResourceProbeWindow = Window &
  typeof globalThis & {
    __moyeoplayResourceProbe: () => ResourceProbeSnapshot;
  };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('20회 이상 게임 전환 뒤에도 단일 controller DOM만 남는다', async ({ page }) => {
  await page.addInitScript(() => {
    const animationFrames = new Set<number>();
    const timeouts = new Set<number>();
    let resizeObservers = 0;
    let eventListeners = 0;

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      let id = 0;
      id = nativeRequestAnimationFrame((timestamp) => {
        animationFrames.delete(id);
        callback(timestamp);
      });
      animationFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      animationFrames.delete(id);
      nativeCancelAnimationFrame(id);
    };

    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = (
      handler: TimerHandler,
      timeout?: number,
      ...arguments_: unknown[]
    ): number => {
      let id = 0;
      const trackedHandler =
        typeof handler === 'function'
          ? () => {
              timeouts.delete(id);
              Reflect.apply(handler, window, arguments_);
            }
          : handler;
      id = nativeSetTimeout(trackedHandler, timeout);
      timeouts.add(id);
      return id;
    };
    window.clearTimeout = (id?: number): void => {
      if (id !== undefined) timeouts.delete(id);
      nativeClearTimeout(id);
    };

    const NativeResizeObserver = window.ResizeObserver;
    const observedTargets = new WeakMap<ResizeObserver, Set<Element>>();
    window.ResizeObserver = class extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        observedTargets.set(this, new Set());
      }

      override observe(target: Element, options?: ResizeObserverOptions): void {
        const targets = observedTargets.get(this);
        if (targets && !targets.has(target)) {
          if (targets.size === 0) resizeObservers += 1;
          targets.add(target);
        }
        super.observe(target, options);
      }

      override unobserve(target: Element): void {
        const targets = observedTargets.get(this);
        if (targets?.delete(target) && targets.size === 0) resizeObservers -= 1;
        super.unobserve(target);
      }

      override disconnect(): void {
        const targets = observedTargets.get(this);
        if (targets && targets.size > 0) {
          targets.clear();
          resizeObservers -= 1;
        }
        super.disconnect();
      }
    };

    interface ListenerRecord {
      active: boolean;
      callback: EventListenerOrEventListenerObject;
      capture: boolean;
      target: EventTarget;
      type: string;
      wrapped: EventListener;
    }

    const listenerRecords = new WeakMap<EventTarget, ListenerRecord[]>();
    // The original methods are always invoked with their targets via `Reflect.apply` below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
    const captureFrom = (options?: boolean | AddEventListenerOptions): boolean =>
      typeof options === 'boolean' ? options : Boolean(options?.capture);
    const deactivate = (record: ListenerRecord): void => {
      if (!record.active) return;
      record.active = false;
      eventListeners -= 1;
      Reflect.apply(nativeRemoveEventListener, record.target, [
        record.type,
        record.wrapped,
        record.capture,
      ]);
      const records = listenerRecords.get(record.target);
      const index = records?.indexOf(record) ?? -1;
      if (records && index >= 0) records.splice(index, 1);
    };
    EventTarget.prototype.addEventListener = function (
      type: string,
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (!callback) {
        Reflect.apply(nativeAddEventListener, this, [type, callback, options]);
        return;
      }
      const capture = captureFrom(options);
      const records = listenerRecords.get(this) ?? [];
      if (
        records.some(
          (record) =>
            record.active &&
            record.type === type &&
            record.callback === callback &&
            record.capture === capture,
        )
      ) {
        return;
      }
      const signal = typeof options === 'object' ? options.signal : undefined;
      if (signal?.aborted) return;
      const once = typeof options === 'object' && Boolean(options.once);
      let record: ListenerRecord | null = null;
      const wrapped: EventListener = function (this: EventTarget, event: Event): void {
        if (once && record) deactivate(record);
        if (typeof callback === 'function') Reflect.apply(callback, this, [event]);
        else callback.handleEvent(event);
      };
      const nextRecord: ListenerRecord = {
        active: true,
        callback,
        capture,
        target: this,
        type,
        wrapped,
      };
      record = nextRecord;
      Reflect.apply(nativeAddEventListener, this, [type, wrapped, options]);
      records.push(nextRecord);
      listenerRecords.set(this, records);
      eventListeners += 1;
      if (signal) {
        Reflect.apply(nativeAddEventListener, signal, [
          'abort',
          () => deactivate(nextRecord),
          { once: true },
        ]);
      }
    };
    EventTarget.prototype.removeEventListener = function (
      type: string,
      callback: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ): void {
      const capture = captureFrom(options);
      const record = listenerRecords
        .get(this)
        ?.find(
          (candidate) =>
            candidate.active &&
            candidate.type === type &&
            candidate.callback === callback &&
            candidate.capture === capture,
        );
      if (record) {
        deactivate(record);
        return;
      }
      Reflect.apply(nativeRemoveEventListener, this, [type, callback, options]);
    };

    Object.defineProperty(window, '__moyeoplayResourceProbe', {
      configurable: true,
      value: () => ({
        animationFrames: animationFrames.size,
        eventListeners,
        resizeObservers,
        timeouts: timeouts.size,
      }),
    });
  });
  const errors = collectErrors(page);
  const sequence = [
    'omok',
    'pong',
    'volleyball',
    'pinball-drop',
    'ladder',
    'reaction-duel',
    'tap-battle',
    'roulette',
  ] as const;
  await page.goto('./#lobby');
  await page.waitForTimeout(100);
  const baseline = await page.evaluate(() =>
    (window as ResourceProbeWindow).__moyeoplayResourceProbe(),
  );
  const exerciseGames = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      const gameId = sequence[index % sequence.length] ?? 'pong';
      await page.goto(`./#game/${gameId}`);
      await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
      expect(await page.locator('#game-host > *').count()).toBe(1);
      await page.locator('#game-start').click();
      await expect(page.locator('#game-phase')).not.toHaveText('시작 대기');
      if (gameId === 'ladder') {
        await page.locator('[data-run-index="0"]').click();
        await expect(page.locator('.ladder-game')).toHaveAttribute('data-busy', 'true');
      }
      await page.waitForTimeout(30);
      expect(await page.locator('#game-host > *').count()).toBe(1);
    }
  };

  // Warm every lazy game chunk once so persistent module-preload listeners are
  // part of the comparison baseline rather than mistaken for controller leaks.
  await exerciseGames(sequence.length);
  await page.goto('./#lobby');
  await page.waitForTimeout(100);
  const warmed = await page.evaluate(() =>
    (window as ResourceProbeWindow).__moyeoplayResourceProbe(),
  );
  expect(warmed.animationFrames).toBeLessThanOrEqual(baseline.animationFrames);
  expect(warmed.resizeObservers).toBe(baseline.resizeObservers);
  expect(warmed.timeouts).toBeLessThanOrEqual(baseline.timeouts);

  await exerciseGames(24);
  await page.goto('./#lobby');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() =>
    (window as ResourceProbeWindow).__moyeoplayResourceProbe(),
  );
  expect(after.animationFrames).toBeLessThanOrEqual(warmed.animationFrames);
  expect(after.eventListeners).toBeLessThanOrEqual(warmed.eventListeners);
  expect(after.resizeObservers).toBe(warmed.resizeObservers);
  expect(after.timeouts).toBeLessThanOrEqual(warmed.timeouts);
  await expect(page.locator('#game-host')).toBeEmpty();
  await expect(page.locator('#game-host [data-game]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('visibility hidden은 진행 중 게임을 멈추고 복귀만으로 재개하지 않는다', async ({ page }) => {
  await page.goto('./#game/pong');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#game-phase')).toHaveText('일시정지');
  await expect(page.locator('#game-start')).toBeFocused();
});

test('reduced motion에서도 사다리 전체 공개 정보가 사라지지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#game/ladder');
  await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#game-start').click();
  await page.locator('[data-action="show-all"]').click();
  await expect(page.locator('[data-result-list] li')).toHaveCount(4);
  await expect(page.locator('#game-phase')).toHaveText('경기 종료');
});
