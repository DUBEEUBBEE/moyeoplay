import { describe, expect, it, vi } from 'vitest';

import {
  MAX_ROULETTE_ITEM_CHARACTERS,
  MAX_ROULETTE_ITEMS,
  MIN_ROULETTE_ITEMS,
  ROULETTE_FULL_TURN,
  createRouletteSpinPlan,
  finalRotationForIndex,
  normalizeRouletteItems,
  rouletteIndexAtPointer,
  rouletteRotationAtProgress,
  selectRouletteIndex,
  truncateRouletteLabel,
} from './logic';

describe('roulette item handling', () => {
  it('trims entries, replaces blanks, and keeps markup-like input as plain data', () => {
    expect(normalizeRouletteItems(['  커피 사기  ', ' ', '<img src=x onerror=alert(1)>'])).toEqual([
      '커피 사기',
      '벌칙 2',
      '<img src=x onerror=alert(1)>',
    ]);
  });

  it('bounds very long editor and canvas labels by Unicode characters', () => {
    const longValue = '한'.repeat(MAX_ROULETTE_ITEM_CHARACTERS + 20);
    expect(Array.from(normalizeRouletteItems([longValue, 'ok'])[0] ?? '')).toHaveLength(
      MAX_ROULETTE_ITEM_CHARACTERS,
    );
    expect(truncateRouletteLabel('🎯🎯🎯🎯🎯', 4)).toBe('🎯🎯🎯…');
  });

  it('rejects unsupported item counts', () => {
    expect(() => normalizeRouletteItems(['only one'])).toThrow(RangeError);
    expect(() => normalizeRouletteItems(Array.from({ length: 13 }, () => 'item'))).toThrow(
      RangeError,
    );
  });

  it('normalizes the 12-item boundary with Korean, emoji, and blank entries', () => {
    const values = [
      '긴 한글 벌칙 '.repeat(20),
      '🎯🎉',
      '   ',
      ...Array.from({ length: 9 }, (_, index) => `항목 ${String(index + 4)}`),
    ];
    const normalized = normalizeRouletteItems(values);
    expect(normalized).toHaveLength(12);
    expect(Array.from(normalized[0] ?? '')).toHaveLength(MAX_ROULETTE_ITEM_CHARACTERS);
    expect(normalized[1]).toBe('🎯🎉');
    expect(normalized[2]).toBe('벌칙 3');
  });
});

describe('roulette selection and angle mapping', () => {
  it('uses the injected equal-index source exactly once before building a plan', () => {
    const source = vi.fn(() => 3);
    const plan = createRouletteSpinPlan(7, 0.42, source, 5);

    expect(source).toHaveBeenCalledOnce();
    expect(source).toHaveBeenCalledWith(7);
    expect(plan.targetIndex).toBe(3);
    expect(rouletteIndexAtPointer(plan.finalRotation, 7)).toBe(3);
  });

  it('lands the final angle exactly on every target for every supported size', () => {
    for (let count = MIN_ROULETTE_ITEMS; count <= MAX_ROULETTE_ITEMS; count += 1) {
      for (let target = 0; target < count; target += 1) {
        const current = 0.317 + target * 0.129;
        const final = finalRotationForIndex(current, target, count, 8);
        expect(final).toBeGreaterThanOrEqual(current + 8 * ROULETTE_FULL_TURN);
        expect(rouletteIndexAtPointer(final, count)).toBe(target);
      }
    }
  });

  it('assigns every valid index without reshaping the injected distribution', () => {
    for (let target = 0; target < 12; target += 1) {
      expect(selectRouletteIndex(12, () => target)).toBe(target);
    }
    expect(() => selectRouletteIndex(4, () => 4)).toThrow(RangeError);
  });

  it('pins animation endpoints to the plan rather than an approximate angle', () => {
    const plan = createRouletteSpinPlan(6, 1.2, () => 4, 4);
    expect(rouletteRotationAtProgress(plan, 0)).toBe(plan.startRotation);
    expect(rouletteRotationAtProgress(plan, 1)).toBe(plan.finalRotation);
    expect(rouletteIndexAtPointer(rouletteRotationAtProgress(plan, 1), 6)).toBe(4);
  });

  it('can settle on the exact result within one turn for reduced motion', () => {
    const plan = createRouletteSpinPlan(8, 0.7, () => 6, 0);
    expect(plan.finalRotation - plan.startRotation).toBeLessThan(ROULETTE_FULL_TURN);
    expect(rouletteIndexAtPointer(plan.finalRotation, 8)).toBe(6);
  });
});
