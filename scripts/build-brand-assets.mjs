import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { GAME_CONTENT } from '../site/site-content.mjs';

const PUBLIC_DIRECTORY = path.resolve('public');
const GAME_ICON_DIRECTORY = path.join(PUBLIC_DIRECTORY, 'assets/game-icons');
const GAME_OG_DIRECTORY = path.join(PUBLIC_DIRECTORY, 'assets/og');
const ROOT_OG_BUDGET_BYTES = 320 * 1024;
const GAME_OG_BUDGET_BYTES = 360 * 1024;

const ACCENTS = Object.freeze({
  omok: '#55b987',
  pong: '#3479ea',
  volleyball: '#f8bf36',
  'pinball-drop': '#a675ff',
  ladder: '#58b991',
  'reaction-duel': '#ff9f43',
  'tap-battle': '#5f8ee8',
  roulette: '#f56c60',
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

function gameOgBackground(game) {
  const accent = ACCENTS[game.id];
  const descriptionLines = splitKoreanLine(game.shortDescription, 28);
  return Buffer.from(`<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse"><stop stop-color="#fffdf8"/><stop offset="1" stop-color="#f1eadf"/></linearGradient>
      <linearGradient id="brand" x1="66" y1="54" x2="122" y2="116" gradientUnits="userSpaceOnUse"><stop stop-color="#4b8bf4"/><stop offset=".55" stop-color="#1f65d6"/><stop offset="1" stop-color="#164ea9"/></linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#564b3f" flood-opacity=".16"/></filter>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <circle cx="1120" cy="42" r="260" fill="${accent}" opacity=".16"/>
    <circle cx="70" cy="610" r="210" fill="#dfeaff" opacity=".8"/>
    <rect x="48" y="42" width="1104" height="546" rx="46" fill="#fffdf8" fill-opacity=".78" stroke="#e7dfd4" stroke-width="2"/>
    <rect x="68" y="58" width="58" height="58" rx="17" fill="url(#brand)"/>
    <path d="M81 101V73h8l8 11 8-11h8v28h-8V85l-8 12-8-12v16h-8Z" fill="#fffdf8"/>
    <text x="144" y="100" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="30" font-weight="900" fill="#211f1c">모여<tspan fill="#1f65d6">PLAY</tspan></text>
    <rect x="66" y="154" width="${String(Math.max(176, 34 + (game.players.length + game.genre.length) * 22))}" height="46" rx="23" fill="${accent}" fill-opacity=".18"/>
    <text x="88" y="185" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="19" font-weight="800" fill="#3d3934">${escapeSvg(`${game.players} · ${game.genre}`)}</text>
    <text x="66" y="292" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="78" font-weight="900" fill="#211f1c">${escapeSvg(game.title)}</text>
    ${descriptionLines.map((line, index) => `<text x="69" y="${String(365 + index * 42)}" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="27" font-weight="600" fill="#665f57">${escapeSvg(line)}</text>`).join('')}
    <rect x="68" y="492" width="300" height="52" rx="26" fill="#1f65d6"/>
    <text x="218" y="526" text-anchor="middle" font-family="Apple SD Gothic Neo,Noto Sans KR,sans-serif" font-size="20" font-weight="800" fill="#fffdf8">가이드 보고 바로 플레이</text>
    <g filter="url(#shadow)">
      <rect x="718" y="94" width="382" height="442" rx="56" fill="#ffffff" stroke="#ebe4da" stroke-width="3"/>
      <rect x="750" y="126" width="318" height="318" rx="52" fill="${accent}" fill-opacity=".16"/>
    </g>
    <circle cx="1070" cy="493" r="20" fill="${accent}" opacity=".7"/>
    <circle cx="735" cy="518" r="13" fill="#ffd447" opacity=".9"/>
  </svg>`);
}

async function renderPng(source, destination, size) {
  await sharp(source, { density: 256 })
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
    .toFile(destination);
}

export async function buildBrandAssets() {
  await mkdir(GAME_OG_DIRECTORY, { recursive: true });
  const favicon = path.join(PUBLIC_DIRECTORY, 'favicon.svg');
  const maskable = path.join(PUBLIC_DIRECTORY, 'icon-maskable.svg');
  await Promise.all([
    renderPng(favicon, path.join(PUBLIC_DIRECTORY, 'apple-touch-icon.png'), 180),
    renderPng(favicon, path.join(PUBLIC_DIRECTORY, 'icon-192.png'), 192),
    renderPng(favicon, path.join(PUBLIC_DIRECTORY, 'icon-512.png'), 512),
    renderPng(maskable, path.join(PUBLIC_DIRECTORY, 'icon-maskable-512.png'), 512),
  ]);

  const rootOgPath = path.join(PUBLIC_DIRECTORY, 'og-cover.png');
  await sharp(path.join(PUBLIC_DIRECTORY, 'og-cover.svg'), { density: 144 })
    .resize(1200, 630)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
    .toFile(rootOgPath);

  const gameOgSizes = {};
  for (const game of GAME_CONTENT) {
    const iconBuffer = await sharp(path.join(GAME_ICON_DIRECTORY, `${game.id}.png`))
      .resize(286, 286, { fit: 'contain', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const destination = path.join(GAME_OG_DIRECTORY, `${game.id}.png`);
    await sharp(gameOgBackground(game), { density: 144 })
      .resize(1200, 630)
      .composite([{ input: iconBuffer, left: 766, top: 142 }])
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
      .toFile(destination);
    const size = (await stat(destination)).size;
    if (size > GAME_OG_BUDGET_BYTES) {
      throw new Error(`${game.id} OG image exceeds the 360KB budget.`);
    }
    gameOgSizes[game.id] = size;
  }

  const rootOgSize = (await stat(rootOgPath)).size;
  if (rootOgSize > ROOT_OG_BUDGET_BYTES) {
    throw new Error('Root OG image exceeds the 320KB budget.');
  }
  return { rootOgSize, gameOgSizes };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const result = await buildBrandAssets();
  console.log(`Root OG: ${(result.rootOgSize / 1024).toFixed(1)}KB.`);
  for (const [game, size] of Object.entries(result.gameOgSizes)) {
    console.log(`${game} OG: ${(size / 1024).toFixed(1)}KB.`);
  }
}
