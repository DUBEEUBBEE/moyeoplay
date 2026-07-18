export interface FixedStepHandlers {
  update(stepSeconds: number): void;
  render(alpha: number): void;
}

export class FixedStepLoop {
  readonly #handlers: FixedStepHandlers;
  readonly #stepSeconds: number;
  readonly #maxDeltaSeconds: number;
  readonly #maxSubSteps: number;
  #frameId: number | null = null;
  #lastTime = 0;
  #accumulator = 0;
  #running = false;

  constructor(
    handlers: FixedStepHandlers,
    options: { stepSeconds?: number; maxDeltaSeconds?: number; maxSubSteps?: number } = {},
  ) {
    this.#handlers = handlers;
    this.#stepSeconds = options.stepSeconds ?? 1 / 120;
    this.#maxDeltaSeconds = options.maxDeltaSeconds ?? 0.1;
    this.#maxSubSteps = options.maxSubSteps ?? 12;
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    this.#frameId = requestAnimationFrame(this.#tick);
  }

  pause(): void {
    this.#running = false;
    if (this.#frameId !== null) cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
    this.#accumulator = 0;
  }

  resume(): void {
    this.start();
  }

  stop(): void {
    this.pause();
    this.#lastTime = 0;
  }

  #tick = (now: number): void => {
    if (!this.#running) return;
    const deltaSeconds = Math.min(
      Math.max((now - this.#lastTime) / 1000, 0),
      this.#maxDeltaSeconds,
    );
    this.#lastTime = now;
    this.#accumulator += deltaSeconds;

    let subSteps = 0;
    while (this.#accumulator >= this.#stepSeconds && subSteps < this.#maxSubSteps) {
      this.#handlers.update(this.#stepSeconds);
      this.#accumulator -= this.#stepSeconds;
      subSteps += 1;
    }
    if (subSteps === this.#maxSubSteps) this.#accumulator = 0;

    this.#handlers.render(this.#accumulator / this.#stepSeconds);
    this.#frameId = requestAnimationFrame(this.#tick);
  };
}
