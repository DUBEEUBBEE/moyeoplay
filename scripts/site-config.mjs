import path from 'node:path';

const DEFAULT_SITE_URL = 'https://moyeoplay.studio/';
const DEFAULT_BASE_PATH = '/';
const DEFAULT_CUSTOM_DOMAIN = 'moyeoplay.studio';
const CLIENT_ID_PATTERN = /^ca-pub-(\d{16})$/;
const PUBLISHER_ID_PATTERN = /^pub-(\d{16})$/;
const SLOT_ID_PATTERN = /^\d{10,20}$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNSAFE_PUBLIC_TEXT_PATTERN = /[<>\r\n]/u;
const TEST_ID_DIGITS = new Set(['0000000000000000', '1234567890123456']);

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
  const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.username || url.password) {
    throw new Error('SITE_URL cannot contain credentials.');
  }
  if (url.protocol !== 'https:' && !isLocalHost) {
    throw new Error('SITE_URL must use HTTPS outside local development.');
  }
  if (url.port && !isLocalHost) {
    throw new Error('SITE_URL cannot use a non-default port outside local development.');
  }
  if (url.search || url.hash) throw new Error('SITE_URL cannot contain a query string or hash.');
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return url;
}

function validateOptional(value, pattern, name) {
  if (value && !pattern.test(value)) throw new Error(`${name} has an invalid format.`);
}

function readMigratedAdsEnabled(env) {
  const current = env.ADSENSE_ADS_ENABLED?.trim() || undefined;
  const legacy = env.ADSENSE_ENABLED?.trim() || undefined;
  if (current !== undefined && legacy !== undefined) {
    const currentValue = readBoolean(current, 'ADSENSE_ADS_ENABLED');
    const legacyValue = readBoolean(legacy, 'ADSENSE_ENABLED');
    if (currentValue !== legacyValue) {
      throw new Error('ADSENSE_ADS_ENABLED and deprecated ADSENSE_ENABLED cannot disagree.');
    }
    return currentValue;
  }
  return current !== undefined
    ? readBoolean(current, 'ADSENSE_ADS_ENABLED')
    : readBoolean(legacy, 'ADSENSE_ENABLED');
}

function normalizeOptionalHttpsUrl(value, name) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${name} must be a public HTTPS URL without credentials or a hash.`);
  }
  return url.href;
}

function validatePublicText(value, name) {
  if (value && (value.length > 120 || UNSAFE_PUBLIC_TEXT_PATTERN.test(value))) {
    throw new Error(`${name} must be at most 120 plain-text characters.`);
  }
}

export function resolveSiteConfig(env = process.env) {
  const usesDefaultProductionProfile =
    env.CUSTOM_DOMAIN === undefined &&
    env.SITE_URL === undefined &&
    env.PAGES_BASE_PATH === undefined;
  const customDomain =
    env.CUSTOM_DOMAIN?.trim().toLowerCase() ??
    (usesDefaultProductionProfile ? DEFAULT_CUSTOM_DOMAIN : '');
  if (customDomain && !DOMAIN_PATTERN.test(customDomain)) {
    throw new Error('CUSTOM_DOMAIN must be a hostname without a scheme, port, or path.');
  }

  const siteUrl = normalizeSiteUrl(
    env.SITE_URL?.trim() || (customDomain ? `https://${customDomain}/` : DEFAULT_SITE_URL),
  );
  const basePath = normalizeBasePath(
    env.PAGES_BASE_PATH?.trim() || (customDomain ? '/' : siteUrl.pathname || DEFAULT_BASE_PATH),
  );
  if (siteUrl.pathname !== basePath) {
    throw new Error('SITE_URL pathname and PAGES_BASE_PATH must match exactly.');
  }
  if (customDomain && (basePath !== '/' || siteUrl.hostname !== customDomain)) {
    throw new Error('CUSTOM_DOMAIN builds require a root SITE_URL and matching hostname.');
  }

  const outputDirectoryName = env.BUILD_OUT_DIR?.trim() || 'dist';
  if (!/^dist(?:-[a-z0-9][a-z0-9-]*)?$/iu.test(outputDirectoryName)) {
    throw new Error('BUILD_OUT_DIR must be "dist" or a safe "dist-<profile>" directory name.');
  }

  const accountMetaEnabled = readBoolean(
    env.ADSENSE_ACCOUNT_META_ENABLED,
    'ADSENSE_ACCOUNT_META_ENABLED',
  );
  const adsEnabled = readMigratedAdsEnabled(env);
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
  if (accountMetaEnabled && !clientDigits) {
    throw new Error('Enabled AdSense account metadata requires a valid ADSENSE_CLIENT_ID.');
  }
  if (adsEnabled && (!clientDigits || !publisherDigits || !adsenseContentSlotId)) {
    throw new Error(
      'Enabled AdSense ads require ADSENSE_CLIENT_ID, ADSENSE_PUBLISHER_ID, and ADSENSE_CONTENT_SLOT_ID.',
    );
  }
  if (adsEnabled && !customDomain && !adsenseTestMode) {
    throw new Error('AdSense ads can only be enabled on a configured custom root domain.');
  }
  if (adsenseTestMode && outputDirectoryName === 'dist') {
    throw new Error('ADSENSE_TEST_MODE must use a non-deploy BUILD_OUT_DIR.');
  }
  if (
    !adsenseTestMode &&
    (TEST_ID_DIGITS.has(clientDigits ?? '') ||
      TEST_ID_DIGITS.has(publisherDigits ?? '') ||
      adsenseContentSlotId === '1234567890')
  ) {
    throw new Error('Placeholder AdSense IDs cannot be used in a deployable build.');
  }
  if (!adsenseTestMode && /(?:^|\.)example$/iu.test(siteUrl.hostname)) {
    throw new Error('Reserved example domains cannot be used in a deployable build.');
  }

  const publicContactEmail = env.PUBLIC_CONTACT_EMAIL?.trim() ?? '';
  if (publicContactEmail && !EMAIL_PATTERN.test(publicContactEmail)) {
    throw new Error('PUBLIC_CONTACT_EMAIL has an invalid format.');
  }

  const siteOperatorName = env.SITE_OPERATOR_NAME?.trim() ?? '';
  validatePublicText(siteOperatorName, 'SITE_OPERATOR_NAME');

  const cmpProviderName = env.PUBLIC_CMP_PROVIDER_NAME?.trim() ?? '';
  const cmpSettingsUrl = normalizeOptionalHttpsUrl(
    env.PUBLIC_CMP_SETTINGS_URL?.trim() ?? '',
    'PUBLIC_CMP_SETTINGS_URL',
  );
  validatePublicText(cmpProviderName, 'PUBLIC_CMP_PROVIDER_NAME');
  if (Boolean(cmpProviderName) !== Boolean(cmpSettingsUrl)) {
    throw new Error('PUBLIC_CMP_PROVIDER_NAME and PUBLIC_CMP_SETTINGS_URL must be set together.');
  }
  if (adsEnabled && !adsenseTestMode && (!cmpProviderName || !cmpSettingsUrl)) {
    throw new Error(
      'Production AdSense ads require a configured certified CMP provider and settings URL.',
    );
  }

  return Object.freeze({
    siteUrl: siteUrl.href,
    basePath,
    customDomain,
    outputDirectoryName,
    outputDirectory: path.resolve(outputDirectoryName),
    generatedDirectory: path.resolve('.generated-pages'),
    adsense: Object.freeze({
      accountMetaEnabled,
      adsEnabled,
      testMode: adsenseTestMode,
      clientId: adsenseClientId,
      publisherId: adsensePublisherId,
      contentSlotId: adsenseContentSlotId,
      cmpProviderName,
      cmpSettingsUrl,
    }),
    publicContactEmail,
    siteOperatorName,
  });
}

export const PROJECT_DEFAULTS = Object.freeze({
  siteUrl: DEFAULT_SITE_URL,
  basePath: DEFAULT_BASE_PATH,
  customDomain: DEFAULT_CUSTOM_DOMAIN,
});
