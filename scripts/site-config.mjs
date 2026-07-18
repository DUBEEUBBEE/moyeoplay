import path from 'node:path';

const DEFAULT_PROJECT_URL = 'https://dubeeubbee.github.io/moyeoplay/';
const DEFAULT_PROJECT_BASE = '/moyeoplay/';
const CLIENT_ID_PATTERN = /^ca-pub-(\d{16})$/;
const PUBLISHER_ID_PATTERN = /^pub-(\d{16})$/;
const SLOT_ID_PATTERN = /^\d{10,20}$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readBoolean(value, name, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be exactly "true" or "false".`);
}

function normalizeBasePath(value) {
  if (!value.startsWith('/')) throw new Error('PAGES_BASE_PATH must start with "/".');
  const normalized = value === '/' ? '/' : `/${value.replace(/^\/+|\/+$/g, '')}/`;
  if (normalized.includes('..') || normalized.includes('?') || normalized.includes('#')) {
    throw new Error('PAGES_BASE_PATH must be a plain absolute URL path.');
  }
  return normalized;
}

function normalizeSiteUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('SITE_URL must use HTTPS outside local development.');
  }
  if (url.search || url.hash) throw new Error('SITE_URL cannot contain a query string or hash.');
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return url;
}

function validateOptional(value, pattern, name) {
  if (value && !pattern.test(value)) throw new Error(`${name} has an invalid format.`);
}

export function resolveSiteConfig(env = process.env) {
  const customDomain = env.CUSTOM_DOMAIN?.trim().toLowerCase() ?? '';
  if (customDomain && !DOMAIN_PATTERN.test(customDomain)) {
    throw new Error('CUSTOM_DOMAIN must be a hostname without a scheme, port, or path.');
  }

  const siteUrl = normalizeSiteUrl(
    env.SITE_URL?.trim() || (customDomain ? `https://${customDomain}/` : DEFAULT_PROJECT_URL),
  );
  const basePath = normalizeBasePath(
    env.PAGES_BASE_PATH?.trim() || (customDomain ? '/' : siteUrl.pathname || DEFAULT_PROJECT_BASE),
  );
  if (siteUrl.pathname !== basePath) {
    throw new Error('SITE_URL pathname and PAGES_BASE_PATH must match exactly.');
  }
  if (customDomain && (basePath !== '/' || siteUrl.hostname !== customDomain)) {
    throw new Error('CUSTOM_DOMAIN builds require a root SITE_URL and matching hostname.');
  }

  const adsenseEnabled = readBoolean(env.ADSENSE_ENABLED, 'ADSENSE_ENABLED');
  const adsenseTestMode = readBoolean(env.ADSENSE_TEST_MODE, 'ADSENSE_TEST_MODE');
  const adsenseClientId = env.ADSENSE_CLIENT_ID?.trim() ?? '';
  const adsensePublisherId = env.ADSENSE_PUBLISHER_ID?.trim() ?? '';
  const adsenseContentSlotId = env.ADSENSE_CONTENT_SLOT_ID?.trim() ?? '';
  validateOptional(adsenseClientId, CLIENT_ID_PATTERN, 'ADSENSE_CLIENT_ID');
  validateOptional(adsensePublisherId, PUBLISHER_ID_PATTERN, 'ADSENSE_PUBLISHER_ID');
  validateOptional(adsenseContentSlotId, SLOT_ID_PATTERN, 'ADSENSE_CONTENT_SLOT_ID');

  const clientDigits = adsenseClientId.match(CLIENT_ID_PATTERN)?.[1];
  const publisherDigits = adsensePublisherId.match(PUBLISHER_ID_PATTERN)?.[1];
  if (clientDigits && publisherDigits && clientDigits !== publisherDigits) {
    throw new Error('AdSense client and publisher IDs must refer to the same publisher.');
  }
  if (adsenseEnabled && (!clientDigits || !publisherDigits || !adsenseContentSlotId)) {
    throw new Error(
      'Enabled AdSense requires ADSENSE_CLIENT_ID, ADSENSE_PUBLISHER_ID, and ADSENSE_CONTENT_SLOT_ID.',
    );
  }
  if (adsenseEnabled && !customDomain && !adsenseTestMode) {
    throw new Error('AdSense can only be enabled on a configured custom root domain.');
  }

  const outputDirectoryName = env.BUILD_OUT_DIR?.trim() || 'dist';
  if (!/^dist(?:-[a-z0-9][a-z0-9-]*)?$/iu.test(outputDirectoryName)) {
    throw new Error('BUILD_OUT_DIR must be "dist" or a safe "dist-<profile>" directory name.');
  }
  if (adsenseTestMode && outputDirectoryName === 'dist') {
    throw new Error('ADSENSE_TEST_MODE must use a non-deploy BUILD_OUT_DIR.');
  }

  const publicContactEmail = env.PUBLIC_CONTACT_EMAIL?.trim() ?? '';
  if (publicContactEmail && !EMAIL_PATTERN.test(publicContactEmail)) {
    throw new Error('PUBLIC_CONTACT_EMAIL has an invalid format.');
  }

  return Object.freeze({
    siteUrl: siteUrl.href,
    basePath,
    customDomain,
    outputDirectoryName,
    outputDirectory: path.resolve(outputDirectoryName),
    generatedDirectory: path.resolve('.generated-pages'),
    adsense: Object.freeze({
      enabled: adsenseEnabled,
      testMode: adsenseTestMode,
      clientId: adsenseClientId,
      publisherId: adsensePublisherId,
      contentSlotId: adsenseContentSlotId,
    }),
    publicContactEmail,
  });
}

export const PROJECT_DEFAULTS = Object.freeze({
  siteUrl: DEFAULT_PROJECT_URL,
  basePath: DEFAULT_PROJECT_BASE,
});
