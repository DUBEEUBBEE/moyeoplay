import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GAME_CONTENT } from '../site/site-content.mjs';

const SOURCE_DIRECTORY = path.resolve('design/game-icons/source');
const ICON_DIRECTORY = path.resolve('public/assets/game-icons');
const OG_DIRECTORY = path.resolve('public/assets/og');
const ICON_SIZE = 320;
const ICON_BUDGET_BYTES = 40 * 1024;

const ACCENTS = Object.freeze({
  omok: '#ffd447',
  pong: '#45e4e0',
  volleyball: '#ff5d9e',
  'pinball-drop': '#a675ff',
  ladder: '#58e6a9',
  'reaction-duel': '#ff8a4c',
  'tap-battle': '#6aa8ff',
  roulette: '#f4c56a',
});

function escapeSvg(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function splitKoreanLine(value, limit = 25) {
  if (value.length <= limit) return [value];
  const words = value.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > limit && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function ogBackground(game) {
  const accent = ACCENTS[game.id];
  const descriptionLines = splitKoreanLine(game.shortDescription, 28);
  return Buffer.from(`<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07111f"/><stop offset="1" stop-color="#102238"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".24"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <circle cx="980" cy="275" r="330" fill="url(#glow)"/>
    <path d="M0 548 C260 490 390 660 700 570 S1030 520 1200 570 V630 H0Z" fill="${accent}" opacity=".09"/>
    <rect x="64" y="58" width="52" height="52" rx="15" fill="#ffd447"/>
    <text x="90" y="96" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="900" fill="#151203">M</text>
    <text x="132" y="95" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="28" font-weight="900" fill="#f7f8fb">모여<tspan fill="#ffd447">PLAY</tspan></text>
    <text x="64" y="244" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="76" font-weight="900" fill="#f7f8fb">${escapeSvg(game.title)}</text>
    ${descriptionLines
      .map(
        (line, index) =>
          `<text x="66" y="${String(326 + index * 42)}" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="27" font-weight="600" fill="#c4cfdd">${escapeSvg(line)}</text>`,
      )
      .join('')}
    <text x="66" y="478" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="19" font-weight="800" letter-spacing="3" fill="${accent}">${escapeSvg(`${game.players} · ${game.genre}`)}</text>
    <rect x="64" y="520" width="258" height="2" fill="${accent}" opacity=".75"/>
    <text x="64" y="563" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="20" font-weight="700" fill="#8797aa">로그인 없이 한 기기에서 바로 플레이</text>
  </svg>`);
}

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

  const iconBuffer = await sharp(source)
    .resize(440, 440, { fit: 'contain', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(ogBackground(game))
    .composite([{ input: iconBuffer, left: 735, top: 92 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 92 })
    .toFile(path.join(OG_DIRECTORY, `${game.id}.png`));

  const [avifSize, webpSize, pngSize] = await Promise.all(
    [avifPath, webpPath, pngPath].map(async (file) => (await stat(file)).size),
  );
  if (avifSize > ICON_BUDGET_BYTES || webpSize > ICON_BUDGET_BYTES) {
    throw new Error(`${game.id} exceeds the 40KB AVIF/WebP budget.`);
  }
  return { id: game.id, avifSize, webpSize, pngSize };
}

await mkdir(ICON_DIRECTORY, { recursive: true });
await mkdir(OG_DIRECTORY, { recursive: true });
const results = [];
for (const game of GAME_CONTENT) results.push(await optimizeIcon(game));

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
