// The generic lets callers preserve the exact queried DOM element type after the runtime null check.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clearElement(element: HTMLElement): void {
  element.replaceChildren();
}

export function setText(element: Element, value: string | number): void {
  const next = String(value);
  if (element.textContent !== next) element.textContent = next;
}
