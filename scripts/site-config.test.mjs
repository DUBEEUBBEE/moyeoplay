import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECT_DEFAULTS, resolveSiteConfig } from './site-config.mjs';

test('default profile targets the current project Pages path with ads disabled', () => {
  const config = resolveSiteConfig({});
  assert.equal(config.siteUrl, PROJECT_DEFAULTS.siteUrl);
  assert.equal(config.basePath, PROJECT_DEFAULTS.basePath);
  assert.equal(config.customDomain, '');
  assert.equal(config.adsense.enabled, false);
  assert.equal(config.adsense.clientId, '');
});

test('custom root profile accepts matched real-format IDs in isolated test output', () => {
  const config = resolveSiteConfig({
    SITE_URL: 'https://moyeoplay.example/',
    PAGES_BASE_PATH: '/',
    CUSTOM_DOMAIN: 'moyeoplay.example',
    BUILD_OUT_DIR: 'dist-root-test',
    ADSENSE_ENABLED: 'true',
    ADSENSE_TEST_MODE: 'true',
    ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
    ADSENSE_PUBLISHER_ID: 'pub-1234567890123456',
    ADSENSE_CONTENT_SLOT_ID: '1234567890',
    PUBLIC_CONTACT_EMAIL: 'contact@example.com',
  });
  assert.equal(config.basePath, '/');
  assert.equal(config.adsense.enabled, true);
  assert.equal(config.adsense.testMode, true);
  assert.equal(config.publicContactEmail, 'contact@example.com');
});

test('invalid or incomplete AdSense configuration fails without exposing IDs', () => {
  assert.throws(
    () => resolveSiteConfig({ ADSENSE_ENABLED: 'yes' }),
    /ADSENSE_ENABLED must be exactly/,
  );
  assert.throws(
    () =>
      resolveSiteConfig({
        ADSENSE_ENABLED: 'true',
        ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
      }),
    /Enabled AdSense requires/,
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
        SITE_URL: 'https://moyeoplay.example/',
        PAGES_BASE_PATH: '/',
        CUSTOM_DOMAIN: 'moyeoplay.example',
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
