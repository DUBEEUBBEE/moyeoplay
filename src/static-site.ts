import './styles/tokens.css';
import './styles/base.css';
import './styles/static-site.css';
import './styles/clay-theme.css';
import {
  createDomAdsConsentAdapter,
  resolveAdsConsentAction,
  type AdsConsentState,
} from './ads-consent';

type AdQueue = Record<string, never>[];

declare global {
  interface Window {
    adsbygoogle?: AdQueue;
  }
}

const adSlots = Array.from(document.querySelectorAll<HTMLElement>('[data-adsense-slot]'));
let adScriptRequested = false;

function requestAdsAfterConsent(
  consentState: AdsConsentState,
  getCurrentConsentState: () => AdsConsentState,
): void {
  if (adScriptRequested || adSlots.length === 0) return;
  const firstSlot = adSlots[0];
  const clientId = firstSlot?.dataset.adsenseClient;
  const isTestMode = firstSlot?.dataset.adsenseTestMode === 'true';
  if (!clientId) return;

  const action = resolveAdsConsentAction(consentState, isTestMode);
  if (action === 'none') return;
  if (action === 'mark-test-ready') {
    for (const slot of adSlots) slot.dataset.adsenseConsentReady = 'true';
    return;
  }

  adScriptRequested = true;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  script.addEventListener(
    'load',
    () => {
      if (getCurrentConsentState() !== 'granted') return;
      window.adsbygoogle ??= [];
      for (const slot of adSlots) {
        window.adsbygoogle.push({});
        slot.dataset.adsenseRequested = 'true';
      }
    },
    { once: true },
  );
  document.head.append(script);
}

if (adSlots.length > 0) {
  const consentAdapter = createDomAdsConsentAdapter(window);
  const unsubscribe = consentAdapter.subscribe((state) => {
    for (const slot of adSlots) slot.dataset.adsenseConsentState = state;
    requestAdsAfterConsent(state, () => consentAdapter.getState());
  });
  window.addEventListener(
    'pagehide',
    () => {
      unsubscribe();
      consentAdapter.dispose();
    },
    { once: true },
  );
}

const backToTop = document.querySelector<HTMLButtonElement>('[data-back-to-top]');
backToTop?.addEventListener('click', () => {
  window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
});
