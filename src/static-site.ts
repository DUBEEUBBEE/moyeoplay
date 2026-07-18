import './styles/tokens.css';
import './styles/base.css';
import './styles/static-site.css';

type AdQueue = Record<string, never>[];

declare global {
  interface Window {
    adsbygoogle?: AdQueue;
  }
}

const adSlots = Array.from(document.querySelectorAll<HTMLElement>('[data-adsense-slot]'));
let adScriptRequested = false;

function requestAdsAfterConsent(): void {
  if (adScriptRequested || adSlots.length === 0) return;
  adScriptRequested = true;
  const firstSlot = adSlots[0];
  const clientId = firstSlot?.dataset.adsenseClient;
  const isTestMode = firstSlot?.dataset.adsenseTestMode === 'true';
  if (!clientId) return;

  if (isTestMode) {
    for (const slot of adSlots) slot.dataset.adsenseConsentReady = 'true';
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  script.addEventListener(
    'load',
    () => {
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
  window.addEventListener('moyeoplay:ads-consent-granted', requestAdsAfterConsent, { once: true });
}

const backToTop = document.querySelector<HTMLButtonElement>('[data-back-to-top]');
backToTop?.addEventListener('click', () => {
  window.scrollTo({
    top: 0,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
});
