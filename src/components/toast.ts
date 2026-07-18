export class Toast {
  readonly #element: HTMLElement;
  #timer = 0;

  constructor() {
    this.#element = document.createElement('div');
    this.#element.className = 'toast';
    this.#element.role = 'status';
    this.#element.setAttribute('aria-live', 'polite');
    this.#element.setAttribute('aria-atomic', 'true');
    document.body.append(this.#element);
  }

  show(message: string, duration = 2600): void {
    window.clearTimeout(this.#timer);
    this.#element.textContent = message;
    this.#element.dataset.visible = 'true';
    this.#timer = window.setTimeout(() => {
      this.#element.dataset.visible = 'false';
    }, duration);
  }

  destroy(): void {
    window.clearTimeout(this.#timer);
    this.#element.remove();
  }
}
