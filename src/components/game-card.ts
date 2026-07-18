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

export function createGameCard(game: GameDefinition, index: number): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'game-card';
  card.dataset.gameId = game.id;
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
  const glyph = document.createElement('span');
  glyph.className = 'game-card__glyph';
  glyph.textContent = game.symbol;
  const orbit = document.createElement('i');
  art.append(glyph, orbit);

  const title = document.createElement('h3');
  title.textContent = game.title;
  const description = document.createElement('p');
  description.textContent = game.description;
  const meta = document.createElement('span');
  meta.className = 'game-card__meta';
  appendMeta(meta, '장르', game.genre);
  appendMeta(meta, '인원', game.players);
  appendMeta(meta, '시간', game.duration);
  appendMeta(meta, '조작', game.controls);

  const action = document.createElement('span');
  action.className = 'game-card__action';
  action.textContent = '게임 열기';
  const arrow = document.createElement('b');
  arrow.textContent = '→';
  arrow.setAttribute('aria-hidden', 'true');
  action.append(arrow);

  card.append(top, art, title, description, meta, action);
  return card;
}
