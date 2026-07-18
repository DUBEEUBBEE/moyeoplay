import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { resolveSiteConfig } from './scripts/site-config.mjs';

const CLEAN_PAGE_PATHS = [
  'index.html',
  'play/index.html',
  'games/omok/index.html',
  'games/pong/index.html',
  'games/volleyball/index.html',
  'games/pinball-drop/index.html',
  'games/ladder/index.html',
  'games/reaction-duel/index.html',
  'games/tap-battle/index.html',
  'games/roulette/index.html',
  'about/index.html',
  'how-to-play/index.html',
  'fairness/index.html',
  'privacy/index.html',
  'terms/index.html',
  'contact/index.html',
] as const;

const GENERATED_ROOT_ASSETS = ['sitemap.xml', 'robots.txt', 'CNAME', 'ads.txt'] as const;

function generatedAssetsPlugin(generatedDirectory: string): Plugin {
  return {
    name: 'moyeoplay-generated-root-assets',
    async generateBundle() {
      for (const fileName of GENERATED_ROOT_ASSETS) {
        const sourcePath = path.join(generatedDirectory, fileName);
        if (!existsSync(sourcePath)) continue;
        this.emitFile({ type: 'asset', fileName, source: await readFile(sourcePath, 'utf8') });
      }
    },
  };
}

function profileManifestPlugin(outputDirectory: string, basePath: string): Plugin {
  return {
    name: 'moyeoplay-profile-manifest',
    async closeBundle() {
      const template = JSON.parse(
        await readFile(path.resolve('public/manifest.webmanifest'), 'utf8'),
      ) as {
        id: string;
        start_url: string;
        scope: string;
        icons: { src: string }[];
      };
      template.id = basePath;
      template.start_url = `${basePath}play/#lobby`;
      template.scope = basePath;
      template.icons = template.icons.map((icon) => ({
        ...icon,
        src: `${basePath}${icon.src.replace(/^\/+/, '')}`,
      }));
      await writeFile(
        path.join(outputDirectory, 'manifest.webmanifest'),
        `${JSON.stringify(template, null, 2)}\n`,
        'utf8',
      );
    },
  };
}

const config = resolveSiteConfig();
const htmlInputs = Object.fromEntries(
  CLEAN_PAGE_PATHS.map((relativePath) => [
    relativePath.replace(/\/index\.html$/, '').replace(/\.html$/, '') || 'home',
    path.join(config.generatedDirectory, relativePath),
  ]),
);

export default defineConfig({
  root: config.generatedDirectory,
  base: config.basePath,
  publicDir: path.resolve('public'),
  appType: 'mpa',
  plugins: [
    generatedAssetsPlugin(config.generatedDirectory),
    profileManifestPlugin(config.outputDirectory, config.basePath),
  ],
  server: {
    fs: { allow: [path.resolve('.')] },
  },
  build: {
    outDir: config.outputDirectory,
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: { input: htmlInputs },
  },
});
