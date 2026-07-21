export interface SiteConfig {
  readonly siteUrl: string;
  readonly basePath: string;
  readonly customDomain: string;
  readonly outputDirectoryName: string;
  readonly outputDirectory: string;
  readonly generatedDirectory: string;
  readonly adsense: {
    readonly accountMetaEnabled: boolean;
    readonly adsEnabled: boolean;
    readonly testMode: boolean;
    readonly clientId: string;
    readonly publisherId: string;
    readonly contentSlotId: string;
    readonly cmpProviderName: string;
    readonly cmpSettingsUrl: string;
  };
  readonly publicContactEmail: string;
  readonly siteOperatorName: string;
}

export function resolveSiteConfig(env?: NodeJS.ProcessEnv): SiteConfig;

export const PROJECT_DEFAULTS: {
  readonly siteUrl: string;
  readonly basePath: string;
  readonly customDomain: string;
};
