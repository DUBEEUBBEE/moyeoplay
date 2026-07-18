import type { GameDefinition } from '../core/game-controller';

function appendMeta(container: HTMLElement, label: string, value: string): void {
  const item = document.createElement('span');
  const key = document.createElement('small');
  key.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  item.append(key, content);
  container.append(item);
}

function sitePath(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export function createGameCard(game: GameDefinition, index: number): HTMLElement {
  const card = document.createElement('article');
  card.className = 'game-card';
  card.style.setProperty('--game-accent', game.accent);

  const top = document.createElement('span');
  top.className = 'game-card__top';
  const number = document.createElement('span');
  number.className = 'game-card__number';
  number.textContent = String(index + 1).padStart(2, '0');
  const badge = document.createElement('span');
  badge.className = 'game-card__badge';
  badge.textContent = game.eyebrow;
  top.append(number, badge);

  const art = document.createElement('span');
  art.className = 'game-card__art';
  art.setAttribute('aria-hidden', 'true');
  const picture = document.createElement('picture');
  picture.className = 'game-card__picture';
  const avif = document.createElement('source');
  avif.type = 'image/avif';
  avif.srcset = game.icon.avif;
  const webp = document.createElement('source');
  webp.type = 'image/webp';
  webp.srcset = game.icon.webp;
  const image = document.createElement('img');
  image.className = 'game-card__icon';
  image.alt = '';
  image.width = game.icon.width;
  image.height = game.icon.height;
  image.loading = 'lazy';
  image.decoding = 'async';
  const markLoaded = (): void => {
    if (image.naturalWidth > 0) art.dataset.iconLoaded = 'true';
  };
  image.addEventListener('load', markLoaded, { once: true });
  image.addEventListener('error', () => delete art.dataset.iconLoaded, { once: true });
  image.src = game.icon.png;
  picture.append(avif, webp, image);
  const glyph = document.createElement('span');
  glyph.className = 'game-card__glyph';
  glyph.textContent = game.symbol;
  const orbit = document.createElement('i');
  art.append(picture, glyph, orbit);
  if (image.complete) markLoaded();

  const title = document.createElement('h3');
  title.id = `game-card-${game.id}-title`;
  title.textContent = game.title;
  const description = document.createElement('p');
  description.textContent = game.description;
  const meta = document.createElement('span');
  meta.className = 'game-card__meta';
  appendMeta(meta, '장르', game.genre);
  appendMeta(meta, '인원', game.players);
  appendMeta(meta, '시간', game.duration);
  appendMeta(meta, '조작', game.controls);

  const actions = document.createElement('div');
  actions.className = 'game-card__actions';
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'game-card__start';
  startButton.dataset.gameId = game.id;
  startButton.setAttribute('aria-label', `${game.title} 시작`);
  startButton.append('게임 시작');
  const arrow = document.createElement('span');
  arrow.textContent = '→';
  arrow.setAttribute('aria-hidden', 'true');
  startButton.append(arrow);
  const guideLink = document.createElement('a');
  guideLink.className = 'game-card__guide';
  guideLink.href = sitePath(`games/${game.guideSlug}/`);
  guideLink.textContent = '게임 가이드';
  guideLink.setAttribute('aria-label', `${game.title} 게임 가이드`);
  actions.append(startButton, guideLink);

  card.append(top, art, title, description, meta, actions);
  return card;
}
