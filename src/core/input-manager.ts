export class InputManager {
  #controller = new AbortController();

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(
    target: Window | HTMLElement,
    type: string,
    listener: EventListener,
    options: AddEventListenerOptions = {},
  ): void {
    target.addEventListener(type, listener, { ...options, signal: this.signal });
  }

  reset(): void {
    this.#controller.abort();
    this.#controller = new AbortController();
  }

  destroy(): void {
    this.#controller.abort();
  }
}

export interface InputBinding {
  release(): void;
}

export interface PressAction {
  readonly button: HTMLButtonElement;
  readonly onPress: () => boolean | undefined;
}

export function bindActivationRepeatGuard(button: HTMLButtonElement, signal: AbortSignal): void {
  button.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
      }
    },
    { signal },
  );
}

export function bindHold(
  button: HTMLButtonElement,
  onChange: (pressed: boolean) => void,
  signal: AbortSignal,
): InputBinding {
  const pointers = new Set<number>();
  let keyboardHeld = false;
  let pressed = false;
  const sync = (): void => {
    const next = keyboardHeld || pointers.size > 0;
    if (next === pressed) return;
    pressed = next;
    button.dataset.pressed = String(next);
    onChange(next);
  };
  const releasePointer = (pointerId: number): void => {
    if (!pointers.delete(pointerId)) return;
    sync();
  };
  const releaseKeyboard = (): void => {
    if (!keyboardHeld) return;
    keyboardHeld = false;
    sync();
  };
  const releaseAll = (): void => {
    for (const pointerId of pointers) {
      try {
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already have ended or capture may be unsupported.
      }
    }
    pointers.clear();
    keyboardHeld = false;
    sync();
  };
  button.dataset.pressed = 'false';
  button.addEventListener(
    'pointerdown',
    (event) => {
      event.preventDefault();
      if (pointers.has(event.pointerId)) return;
      pointers.add(event.pointerId);
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an optional enhancement.
      }
      sync();
    },
    { signal },
  );
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(
      eventName,
      (event) => {
        releasePointer(event.pointerId);
      },
      { signal },
    );
  }
  button.addEventListener(
    'keydown',
    (event) => {
      if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return;
      event.preventDefault();
      keyboardHeld = true;
      sync();
    },
    { signal },
  );
  button.addEventListener(
    'keyup',
    (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      keyboardHeld = false;
      sync();
    },
    { signal },
  );
  // Moving focus to another control must not cancel an independent touch that
  // is still physically held on this button. Blur only ends keyboard holding;
  // pointer end/cancel and the global safety fallbacks own pointer cleanup.
  button.addEventListener('blur', releaseKeyboard, { signal });

  // Pointer capture can fail or be lost when the browser UI takes over. Window
  // fallbacks keep a held action from surviving outside its original button.
  window.addEventListener('pointerup', (event) => releasePointer(event.pointerId), {
    capture: true,
    signal,
  });
  window.addEventListener('pointercancel', (event) => releasePointer(event.pointerId), {
    capture: true,
    signal,
  });
  window.addEventListener('blur', releaseAll, { signal });
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll(), { signal });
  signal.addEventListener('abort', releaseAll, { once: true });

  return { release: releaseAll };
}

/**
 * Binds one-shot actions that should fire on pointerdown, while reserving native
 * zero-detail clicks for keyboard Enter/Space activation. Pointer IDs are shared
 * across the whole action group so one physical pointer cannot trigger both sides.
 */
export function bindPressActions(
  actions: readonly PressAction[],
  signal: AbortSignal,
): InputBinding {
  const activePointers = new Map<number, HTMLButtonElement>();

  const releasePointer = (pointerId: number): void => {
    const button = activePointers.get(pointerId);
    if (!button) return;
    activePointers.delete(pointerId);
    if (![...activePointers.values()].includes(button)) button.dataset.pressed = 'false';
  };

  const releaseAll = (): void => {
    const captures = [...activePointers.entries()];
    activePointers.clear();
    for (const [pointerId, button] of captures) {
      button.dataset.pressed = 'false';
      try {
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already have ended or capture may be unsupported.
      }
    }
  };

  for (const { button, onPress } of actions) {
    button.dataset.pressed = 'false';
    bindActivationRepeatGuard(button, signal);
    button.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        if (activePointers.has(event.pointerId)) return;
        if (onPress() === false) return;
        activePointers.set(event.pointerId, button);
        button.dataset.pressed = 'true';
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // Window-level release listeners remain as the fallback.
        }
      },
      { signal },
    );
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      button.addEventListener(eventName, (event) => releasePointer(event.pointerId), { signal });
    }
    button.addEventListener(
      'click',
      (event) => {
        // Pointer compatibility clicks have a non-zero detail and were already
        // handled on pointerdown. Native keyboard activation has detail === 0.
        if (event.detail !== 0) return;
        if (onPress() !== false) event.preventDefault();
      },
      { signal },
    );
  }

  window.addEventListener('pointerup', (event) => releasePointer(event.pointerId), {
    capture: true,
    signal,
  });
  window.addEventListener('pointercancel', (event) => releasePointer(event.pointerId), {
    capture: true,
    signal,
  });
  window.addEventListener('blur', releaseAll, { signal });
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll(), { signal });
  signal.addEventListener('abort', releaseAll, { once: true });

  return { release: releaseAll };
}
