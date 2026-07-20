export const ADS_CONSENT_STATE_EVENT = 'moyeoplay:ads-consent-state-changed';

// Compatibility signal for an external integration. Dispatching this event does not implement a CMP.
export const LEGACY_ADS_CONSENT_GRANTED_EVENT = 'moyeoplay:ads-consent-granted';

export type AdsConsentState =
  'unknown' | 'granted' | 'denied' | 'withdrawn' | 'unavailable' | 'error';

export type AdsConsentListener = (state: AdsConsentState) => void;

export interface AdsConsentAdapter {
  getState(): AdsConsentState;
  subscribe(listener: AdsConsentListener): () => void;
  dispose(): void;
}

export type AdsConsentAction = 'none' | 'mark-test-ready' | 'request-script';

export function resolveAdsConsentAction(
  state: AdsConsentState,
  testMode: boolean,
): AdsConsentAction {
  if (state !== 'granted') return 'none';
  return testMode ? 'mark-test-ready' : 'request-script';
}

function isAdsConsentState(value: unknown): value is AdsConsentState {
  return (
    value === 'unknown' ||
    value === 'granted' ||
    value === 'denied' ||
    value === 'withdrawn' ||
    value === 'unavailable' ||
    value === 'error'
  );
}

function stateFromEvent(event: Event): AdsConsentState | undefined {
  const detail = Reflect.get(event, 'detail') as unknown;
  if (isAdsConsentState(detail)) return detail;
  if (typeof detail !== 'object' || detail === null) return undefined;
  const state = Reflect.get(detail, 'state') as unknown;
  return isAdsConsentState(state) ? state : undefined;
}

export function createDomAdsConsentAdapter(target: EventTarget = window): AdsConsentAdapter {
  let state: AdsConsentState = 'unknown';
  let disposed = false;
  const listeners = new Set<AdsConsentListener>();

  const publish = (nextState: AdsConsentState): void => {
    if (disposed || nextState === state) return;
    state = nextState;
    for (const listener of [...listeners]) listener(state);
  };

  const handleStateChange = (event: Event): void => {
    const nextState = stateFromEvent(event);
    if (nextState) publish(nextState);
  };
  const handleLegacyGranted = (): void => {
    publish('granted');
  };

  target.addEventListener(ADS_CONSENT_STATE_EVENT, handleStateChange);
  target.addEventListener(LEGACY_ADS_CONSENT_GRANTED_EVENT, handleLegacyGranted);

  return {
    getState: () => state,
    subscribe: (listener) => {
      if (disposed) {
        listener('unavailable');
        return () => undefined;
      }
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      if (disposed) return;
      target.removeEventListener(ADS_CONSENT_STATE_EVENT, handleStateChange);
      target.removeEventListener(LEGACY_ADS_CONSENT_GRANTED_EVENT, handleLegacyGranted);
      publish('unavailable');
      disposed = true;
      listeners.clear();
    },
  };
}
