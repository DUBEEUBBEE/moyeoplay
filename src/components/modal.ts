const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let modalSequence = 0;

export class Modal {
  readonly element: HTMLDialogElement;
  readonly body: HTMLElement;
  #returnFocus: HTMLElement | null = null;

  constructor(title: string, className = '') {
    this.element = document.createElement('dialog');
    this.element.className = `modal ${className}`.trim();
    modalSequence += 1;
    this.element.setAttribute('aria-labelledby', `modal-${String(modalSequence)}`);

    const panel = document.createElement('div');
    panel.className = 'modal__panel';
    const header = document.createElement('header');
    header.className = 'modal__header';
    const heading = document.createElement('h2');
    heading.id = this.element.getAttribute('aria-labelledby') ?? '';
    heading.textContent = title;
    const closeButton = document.createElement('button');
    closeButton.className = 'icon-button';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', `${title} 닫기`);
    closeButton.textContent = '×';
    header.append(heading, closeButton);
    this.body = document.createElement('div');
    this.body.className = 'modal__body';
    panel.append(header, this.body);
    this.element.append(panel);

    closeButton.addEventListener('click', () => this.close());
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.close();
    });
    this.element.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.element.addEventListener('keydown', this.#trapFocus);
    this.element.addEventListener('close', () => {
      this.#returnFocus?.focus();
      this.#returnFocus = null;
    });
  }

  open(trigger?: HTMLElement): void {
    this.#returnFocus =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!this.element.isConnected) document.body.append(this.element);
    if (!this.element.open) this.element.showModal();
    queueMicrotask(() => this.element.querySelector<HTMLElement>(FOCUSABLE)?.focus());
  }

  close(): void {
    if (this.element.open) this.element.close();
  }

  destroy(): void {
    this.close();
    this.element.remove();
  }

  #trapFocus = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.offsetParent !== null,
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
