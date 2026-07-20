import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECT_DEFAULTS, resolveSiteConfig } from './site-config.mjs';

test('default profile targets the production custom domain with ads disabled', () => {
  const config = resolveSiteConfig({});
  assert.equal(config.siteUrl, PROJECT_DEFAULTS.siteUrl);
  assert.equal(config.basePath, PROJECT_DEFAULTS.basePath);
  assert.equal(config.customDomain, PROJECT_DEFAULTS.customDomain);
  assert.equal(config.adsense.accountMetaEnabled, false);
  assert.equal(config.adsense.adsEnabled, false);
  assert.equal(config.adsense.clientId, '');
});

test('custom root profile accepts separate metadata and ads flags in isolated test output', () => {
  const config = resolveSiteConfig({
    SITE_URL: 'https://moyeoplay.studio/',
    PAGES_BASE_PATH: '/',
    CUSTOM_DOMAIN: 'moyeoplay.studio',
    BUILD_OUT_DIR: 'dist-root-test',
    ADSENSE_ACCOUNT_META_ENABLED: 'true',
    ADSENSE_ADS_ENABLED: 'true',
    ADSENSE_TEST_MODE: 'true',
    ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
    ADSENSE_PUBLISHER_ID: 'pub-1234567890123456',
    ADSENSE_CONTENT_SLOT_ID: '1234567890',
    PUBLIC_CONTACT_EMAIL: 'contact@example.com',
  });
  assert.equal(config.basePath, '/');
  assert.equal(config.adsense.accountMetaEnabled, true);
  assert.equal(config.adsense.adsEnabled, true);
  assert.equal(config.adsense.testMode, true);
  assert.equal(config.publicContactEmail, 'contact@example.com');
});

test('invalid, conflicting, or incomplete AdSense configuration fails without exposing IDs', () => {
  assert.throws(
    () => resolveSiteConfig({ ADSENSE_ADS_ENABLED: 'yes' }),
    /ADSENSE_ADS_ENABLED must be exactly/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        ADSENSE_ADS_ENABLED: 'true',
        ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
      }),
    /Enabled AdSense ads require/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        ADSENSE_ACCOUNT_META_ENABLED: 'true',
      }),
    /account metadata requires/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        ADSENSE_ADS_ENABLED: 'true',
        ADSENSE_ENABLED: 'false',
      }),
    /cannot disagree/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
        ADSENSE_PUBLISHER_ID: 'pub-6543210987654321',
      }),
    /same publisher/,
  );
});

test('deprecated ADSENSE_ENABLED remains a compatible alias', () => {
  const config = resolveSiteConfig({
    SITE_URL: 'https://moyeoplay.studio/',
    PAGES_BASE_PATH: '/',
    CUSTOM_DOMAIN: 'moyeoplay.studio',
    BUILD_OUT_DIR: 'dist-legacy-test',
    ADSENSE_ENABLED: 'true',
    ADSENSE_TEST_MODE: 'true',
    ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
    ADSENSE_PUBLISHER_ID: 'pub-1234567890123456',
    ADSENSE_CONTENT_SLOT_ID: '1234567890',
  });
  assert.equal(config.adsense.adsEnabled, true);

  const modernConfigWithEmptyLegacyValue = resolveSiteConfig({
    SITE_URL: 'https://moyeoplay.studio/',
    PAGES_BASE_PATH: '/',
    CUSTOM_DOMAIN: 'moyeoplay.studio',
    BUILD_OUT_DIR: 'dist-modern-test',
    ADSENSE_ADS_ENABLED: 'true',
    ADSENSE_ENABLED: '',
    ADSENSE_TEST_MODE: 'true',
    ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
    ADSENSE_PUBLISHER_ID: 'pub-1234567890123456',
    ADSENSE_CONTENT_SLOT_ID: '1234567890',
  });
  assert.equal(modernConfigWithEmptyLegacyValue.adsense.adsEnabled, true);
});

test('deployable profiles reject placeholders and incomplete CMP disclosure', () => {
  assert.throws(
    () =>
      resolveSiteConfig({
        SITE_URL: 'https://moyeoplay.example/',
        PAGES_BASE_PATH: '/',
        CUSTOM_DOMAIN: 'moyeoplay.example',
      }),
    /Reserved example domains/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        ADSENSE_ACCOUNT_META_ENABLED: 'true',
        ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
      }),
    /Placeholder AdSense IDs/,
  );
  assert.throws(
    () => resolveSiteConfig({ PUBLIC_CMP_PROVIDER_NAME: 'Example CMP' }),
    /must be set together/,
  );
});

test('host profile invariants reject path drift and deployable mock output', () => {
  assert.throws(
    () =>
      resolveSiteConfig({
        SITE_URL: 'https://dubeeubbee.github.io/moyeoplay/',
        PAGES_BASE_PATH: '/',
      }),
    /pathname and PAGES_BASE_PATH/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        SITE_URL: 'https://user:secret@moyeoplay.studio/',
        PAGES_BASE_PATH: '/',
        CUSTOM_DOMAIN: 'moyeoplay.studio',
      }),
    /cannot contain credentials/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        SITE_URL: 'https://moyeoplay.studio:8443/',
        PAGES_BASE_PATH: '/',
        CUSTOM_DOMAIN: 'moyeoplay.studio',
      }),
    /non-default port/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        SITE_URL: 'https://moyeoplay.studio/',
        PAGES_BASE_PATH: '/',
        CUSTOM_DOMAIN: 'moyeoplay.studio',
        ADSENSE_TEST_MODE: 'true',
      }),
    /non-deploy BUILD_OUT_DIR/,
  );
  for (const unsafeOutput of ['.', './', 'src', 'public', '../dist', '/tmp/dist']) {
    assert.throws(
      () => resolveSiteConfig({ BUILD_OUT_DIR: unsafeOutput }),
      /safe "dist-<profile>"/,
      unsafeOutput,
    );
  }
});
