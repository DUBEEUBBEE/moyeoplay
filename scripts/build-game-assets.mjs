import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GAME_CONTENT } from '../site/site-content.mjs';
import { buildBrandAssets } from './build-brand-assets.mjs';

const SOURCE_DIRECTORY = path.resolve('design/game-icons/source');
const HERO_SOURCE = path.resolve('design/hero/source/moyeoplay-party-diorama.png');
const ICON_DIRECTORY = path.resolve('public/assets/game-icons');
const HERO_DIRECTORY = path.resolve('public/assets/hero');
const ICON_SIZE = 320;
const ICON_BUDGET_BYTES = 40 * 1024;
const HERO_WIDTH = 1440;
const HERO_BUDGET_BYTES = Object.freeze({
  avif: 180 * 1024,
  webp: 280 * 1024,
  jpg: 350 * 1024,
});

async function optimizeIcon(game) {
  const source = path.join(SOURCE_DIRECTORY, `${game.id}.png`);
  const pipeline = sharp(source).resize(ICON_SIZE, ICON_SIZE, {
    fit: 'contain',
    withoutEnlargement: true,
  });
  const pngPath = path.join(ICON_DIRECTORY, `${game.id}.png`);
  const webpPath = path.join(ICON_DIRECTORY, `${game.id}.webp`);
  const avifPath = path.join(ICON_DIRECTORY, `${game.id}.avif`);
  await Promise.all([
    pipeline.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(pngPath),
    pipeline.clone().webp({ quality: 86, alphaQuality: 100, effort: 6 }).toFile(webpPath),
    pipeline.clone().avif({ quality: 58, effort: 7, chromaSubsampling: '4:4:4' }).toFile(avifPath),
  ]);

  const [avifSize, webpSize, pngSize] = await Promise.all(
    [avifPath, webpPath, pngPath].map(async (file) => (await stat(file)).size),
  );
  if (avifSize > ICON_BUDGET_BYTES || webpSize > ICON_BUDGET_BYTES) {
    throw new Error(`${game.id} exceeds the 40KB AVIF/WebP budget.`);
  }
  return { id: game.id, avifSize, webpSize, pngSize };
}

async function optimizeHero() {
  const pipeline = sharp(HERO_SOURCE).resize({
    width: HERO_WIDTH,
    fit: 'inside',
    withoutEnlargement: true,
  });
  const outputPaths = {
    avif: path.join(HERO_DIRECTORY, 'party-diorama.avif'),
    webp: path.join(HERO_DIRECTORY, 'party-diorama.webp'),
    jpg: path.join(HERO_DIRECTORY, 'party-diorama.jpg'),
  };
  await Promise.all([
    pipeline
      .clone()
      .avif({ quality: 61, effort: 7, chromaSubsampling: '4:4:4' })
      .toFile(outputPaths.avif),
    pipeline.clone().webp({ quality: 84, effort: 6 }).toFile(outputPaths.webp),
    pipeline
      .clone()
      .jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toFile(outputPaths.jpg),
  ]);

  const sizes = Object.fromEntries(
    await Promise.all(
      Object.entries(outputPaths).map(async ([format, file]) => [format, (await stat(file)).size]),
    ),
  );
  for (const [format, size] of Object.entries(sizes)) {
    if (size > HERO_BUDGET_BYTES[format]) {
      throw new Error(
        `Hero ${format.toUpperCase()} exceeds its ${(HERO_BUDGET_BYTES[format] / 1024).toFixed(0)}KB budget.`,
      );
    }
  }
  return sizes;
}

await mkdir(ICON_DIRECTORY, { recursive: true });
await mkdir(HERO_DIRECTORY, { recursive: true });
const results = [];
for (const game of GAME_CONTENT) results.push(await optimizeIcon(game));
const heroSizes = await optimizeHero();
const brandSizes = await buildBrandAssets();

const totalModernBytes = results.reduce(
  (total, result) => total + Math.min(result.avifSize, result.webpSize),
  0,
);
for (const result of results) {
  console.log(
    `${result.id}: AVIF ${(result.avifSize / 1024).toFixed(1)}KB, WebP ${(result.webpSize / 1024).toFixed(1)}KB, PNG ${(result.pngSize / 1024).toFixed(1)}KB`,
  );
}
console.log(`Eight-icon modern-format budget: ${(totalModernBytes / 1024).toFixed(1)}KB.`);
console.log(
  `Hero: AVIF ${(heroSizes.avif / 1024).toFixed(1)}KB, WebP ${(heroSizes.webp / 1024).toFixed(1)}KB, JPG ${(heroSizes.jpg / 1024).toFixed(1)}KB.`,
);
console.log(`Root OG: ${(brandSizes.rootOgSize / 1024).toFixed(1)}KB.`);
