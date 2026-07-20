import { describe, expect, it, vi } from 'vitest';
import {
  ADS_CONSENT_STATE_EVENT,
  LEGACY_ADS_CONSENT_GRANTED_EVENT,
  createDomAdsConsentAdapter,
  resolveAdsConsentAction,
  type AdsConsentState,
} from './ads-consent';

function dispatchState(target: EventTarget, state: unknown): void {
  target.dispatchEvent(new CustomEvent(ADS_CONSENT_STATE_EVENT, { detail: { state } }));
}

describe('DOM AdSense consent adapter', () => {
  it('starts unknown, publishes explicit states, and supports subscription cleanup', () => {
    const target = new EventTarget();
    const adapter = createDomAdsConsentAdapter(target);
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    expect(adapter.getState()).toBe('unknown');
    expect(listener).toHaveBeenLastCalledWith('unknown');

    dispatchState(target, 'denied');
    expect(adapter.getState()).toBe('denied');
    expect(listener).toHaveBeenLastCalledWith('denied');

    unsubscribe();
    dispatchState(target, 'withdrawn');
    expect(adapter.getState()).toBe('withdrawn');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed state events', () => {
    const target = new EventTarget();
    const adapter = createDomAdsConsentAdapter(target);

    dispatchState(target, 'accepted');
    target.dispatchEvent(new CustomEvent(ADS_CONSENT_STATE_EVENT, { detail: null }));
    target.dispatchEvent(new Event(ADS_CONSENT_STATE_EVENT));

    expect(adapter.getState()).toBe('unknown');
  });

  it('keeps the old granted event as a legacy integration signal', () => {
    const target = new EventTarget();
    const adapter = createDomAdsConsentAdapter(target);

    target.dispatchEvent(new Event(LEGACY_ADS_CONSENT_GRANTED_EVENT));

    expect(adapter.getState()).toBe('granted');
  });

  it('disposes DOM listeners and leaves the adapter unavailable', () => {
    const target = new EventTarget();
    const adapter = createDomAdsConsentAdapter(target);
    const listener = vi.fn();
    adapter.subscribe(listener);

    adapter.dispose();
    dispatchState(target, 'granted');

    expect(adapter.getState()).toBe('unavailable');
    expect(listener).toHaveBeenLastCalledWith('unavailable');
  });
});

describe('AdSense request decision', () => {
  it.each<AdsConsentState>(['unknown', 'denied', 'withdrawn', 'unavailable', 'error'])(
    'keeps script and ad requests disabled for %s',
    (state) => {
      expect(resolveAdsConsentAction(state, false)).toBe('none');
      expect(resolveAdsConsentAction(state, true)).toBe('none');
    },
  );

  it('marks granted test mode ready without allowing an external request', () => {
    expect(resolveAdsConsentAction('granted', true)).toBe('mark-test-ready');
  });

  it('allows the production loader only for an explicit granted state', () => {
    expect(resolveAdsConsentAction('granted', false)).toBe('request-script');
  });
});
