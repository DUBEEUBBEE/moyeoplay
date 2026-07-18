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

export function bindHold(
  button: HTMLButtonElement,
  onChange: (pressed: boolean) => void,
  signal: AbortSignal,
): void {
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
  button.addEventListener(
    'pointerdown',
    (event) => {
      event.preventDefault();
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
        pointers.delete(event.pointerId);
        sync();
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
  button.addEventListener(
    'blur',
    () => {
      keyboardHeld = false;
      sync();
    },
    { signal },
  );
}
