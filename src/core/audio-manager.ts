import type { GameAudio } from './game-controller';

export class AudioManager implements GameAudio {
  #context: AudioContext | null = null;
  #enabled = true;
  #volume = 0.65;

  configure(enabled: boolean, volume: number): void {
    this.#enabled = enabled;
    this.#volume = Math.max(0, Math.min(1, volume));
  }

  async unlock(): Promise<void> {
    const context = this.#ensureContext();
    if (context?.state === 'suspended') await context.resume();
  }

  hit(strength = 0.5): void {
    this.#tone(220 + strength * 180, 0.045, 'square', 0.035);
  }

  score(player: 1 | 2 = 1): void {
    this.#tone(player === 1 ? 560 : 690, 0.1, 'triangle', 0.055);
  }

  countdown(value: number): void {
    this.#tone(value > 0 ? 360 + value * 80 : 760, value > 0 ? 0.07 : 0.13, 'sine', 0.045);
  }

  win(): void {
    this.#tone(523.25, 0.12, 'triangle', 0.055, 0);
    this.#tone(659.25, 0.12, 'triangle', 0.055, 0.11);
    this.#tone(783.99, 0.22, 'triangle', 0.06, 0.22);
  }

  destroy(): void {
    void this.#context?.close();
    this.#context = null;
  }

  #ensureContext(): AudioContext | null {
    if (!this.#enabled || this.#volume === 0) return null;
    const candidate: unknown = Reflect.get(window, 'AudioContext');
    if (typeof candidate !== 'function') return null;
    const AudioContextConstructor = candidate as typeof AudioContext;
    this.#context ??= new AudioContextConstructor();
    return this.#context;
  }

  #tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    delay = 0,
  ): void {
    const context = this.#ensureContext();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(gainValue * this.#volume, 0.0002),
      start + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
