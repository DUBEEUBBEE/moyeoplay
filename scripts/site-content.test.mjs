import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_CONTENT, PAGE_CONTENT, SITE_META } from '../site/site-content.mjs';

test('eight game guides have complete and unique search content', () => {
  assert.equal(GAME_CONTENT.length, 8);

  const ids = new Set(GAME_CONTENT.map((game) => game.id));
  const slugs = new Set(GAME_CONTENT.map((game) => game.slug));
  const titles = new Set(GAME_CONTENT.map((game) => game.seo.title));
  const descriptions = new Set(GAME_CONTENT.map((game) => game.seo.description));
  const headings = new Set(GAME_CONTENT.map((game) => game.seo.heading));

  assert.equal(ids.size, 8);
  assert.equal(slugs.size, 8);
  assert.equal(titles.size, 8);
  assert.equal(descriptions.size, 8);
  assert.equal(headings.size, 8);

  for (const game of GAME_CONTENT) {
    assert.match(game.seo.title, /\| 모여PLAY$/u, `${game.id} title`);
    assert.ok(game.seo.description.length >= 70, `${game.id} description`);
    assert.ok(game.seo.description.length <= 160, `${game.id} description`);
    assert.ok(game.seo.heading.length >= 10, `${game.id} heading`);
    assert.ok(game.seo.aliases.length >= 3, `${game.id} aliases`);
    assert.equal(new Set(game.seo.aliases).size, game.seo.aliases.length, `${game.id} aliases`);
    assert.equal(game.useCases.length, 3, `${game.id} use cases`);
    assert.equal(game.faq.length, 3, `${game.id} FAQ`);
    assert.ok(
      game.faq.every((item) => item.question && item.answer),
      `${game.id} FAQ content`,
    );
    assert.ok(
      game.related.every((id) => ids.has(id) && id !== game.id),
      `${game.id} related`,
    );
    assert.equal(game.updated, '2026-07-29', `${game.id} updated`);
  }
});

test('observed Search Console queries are represented by the matching guides', () => {
  const pinball = GAME_CONTENT.find((game) => game.id === 'pinball-drop');
  const roulette = GAME_CONTENT.find((game) => game.id === 'roulette');

  assert.ok(pinball?.seo.aliases.includes('공떨어지기 게임'));
  assert.ok(pinball?.faq.some((item) => item.question.includes('공떨어지기 게임')));
  assert.ok(roulette?.seo.aliases.includes('벌칙 룰렛'));
  assert.ok(roulette?.seo.aliases.includes('벌칙룰렛'));
});

test('changed discovery pages share a truthful modification date', () => {
  assert.equal(SITE_META.updated, '2026-07-29');
  assert.equal(PAGE_CONTENT.root.updated, '2026-07-29');
  assert.equal(PAGE_CONTENT['how-to-play'].updated, '2026-07-29');
  assert.equal(PAGE_CONTENT.fairness.updated, '2026-07-29');
});
