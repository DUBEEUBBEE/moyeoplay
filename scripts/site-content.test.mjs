import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EDITORIAL_GUIDES,
  GAME_CONTENT,
  GAME_EXPERIENCE,
  PAGE_CONTENT,
  SITE_META,
} from '../site/site-content.mjs';

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
    assert.equal(game.updated, '2026-08-10', `${game.id} updated`);
    const experience = GAME_EXPERIENCE[game.id];
    assert.equal(experience.walkthrough.length, 4, `${game.id} walkthrough`);
    assert.equal(experience.checks.length, 3, `${game.id} checks`);
    assert.match(experience.sourcePath, new RegExp(`src/games/${game.id}/logic\\.ts$`, 'u'));
    assert.match(experience.testPath, new RegExp(`src/games/${game.id}/logic\\.test\\.ts$`, 'u'));
  }
});

test('editorial guides are substantial, unique, and tied to actual games', () => {
  assert.equal(EDITORIAL_GUIDES.length, 4);
  const slugs = new Set(EDITORIAL_GUIDES.map((guide) => guide.slug));
  const titles = new Set(EDITORIAL_GUIDES.map((guide) => guide.title));
  const descriptions = new Set(EDITORIAL_GUIDES.map((guide) => guide.description));
  assert.equal(slugs.size, EDITORIAL_GUIDES.length);
  assert.equal(titles.size, EDITORIAL_GUIDES.length);
  assert.equal(descriptions.size, EDITORIAL_GUIDES.length);

  const gameIds = new Set(GAME_CONTENT.map((game) => game.id));
  for (const guide of EDITORIAL_GUIDES) {
    assert.match(guide.title, /\| 모여PLAY$/u, `${guide.slug} title`);
    assert.ok(guide.description.length >= 70, `${guide.slug} description`);
    assert.ok(guide.description.length <= 180, `${guide.slug} description`);
    assert.ok(guide.sections.length >= 7, `${guide.slug} sections`);
    assert.equal(guide.faq.length, 3, `${guide.slug} FAQ`);
    assert.ok(
      guide.relatedGames.every((id) => gameIds.has(id)),
      `${guide.slug} related games`,
    );
    assert.equal(guide.updated, '2026-08-10', `${guide.slug} updated`);
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
  assert.equal(SITE_META.updated, '2026-08-10');
  assert.equal(PAGE_CONTENT.root.updated, '2026-08-10');
  assert.equal(PAGE_CONTENT.guides.updated, '2026-08-10');
  assert.equal(PAGE_CONTENT['how-to-play'].updated, '2026-08-10');
  assert.equal(PAGE_CONTENT.fairness.updated, '2026-08-10');
});
