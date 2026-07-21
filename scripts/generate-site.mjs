import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_CONTENT, PAGE_CONTENT, SITE_META } from '../site/site-content.mjs';
import { resolveSiteConfig } from './site-config.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = resolveSiteConfig();
const generatedRoot = config.generatedDirectory;
const gameById = new Map(GAME_CONTENT.map((game) => [game.id, game]));

const GAME_SEO_TITLES = Object.freeze({
  omok: '웹 오목 2인용 — 규칙·조작·바로 플레이 | 모여PLAY',
  pong: '2인용 웹 탁구 — 키보드·모바일 대전 | 모여PLAY',
  volleyball: '통통 배구 — 2인용 점프 액션 | 모여PLAY',
  'pinball-drop': '핀볼 늦게 떨어지기 — 대칭 보드 대결 | 모여PLAY',
  ladder: '사다리 타기 — 2~8명 공정한 결과 추첨 | 모여PLAY',
  'reaction-duel': '반응속도 대결 — 2인용 웹 반응 테스트 | 모여PLAY',
  'tap-battle': '탭 배틀 — 2인용 연타 대결 | 모여PLAY',
  roulette: '벌칙 룰렛 — 같은 확률의 파티 추첨 | 모여PLAY',
});

const GAME_ACCENTS = Object.freeze({
  omok: '#ffd447',
  pong: '#45e4e0',
  volleyball: '#ff5d9e',
  'pinball-drop': '#a675ff',
  ladder: '#58e6a9',
  'reaction-duel': '#ff9f43',
  'tap-battle': '#5aa9ff',
  roulette: '#f4b942',
});

const GAME_PLAYER_COUNTS = Object.freeze({
  omok: { value: 2 },
  pong: { value: 2 },
  volleyball: { value: 2 },
  'pinball-drop': { value: 2 },
  ladder: { minValue: 2, maxValue: 8 },
  'reaction-duel': { value: 2 },
  'tap-battle': { value: 2 },
  roulette: { minValue: 2, maxValue: 12 },
});

const NAV_ITEMS = Object.freeze([
  { key: 'home', label: '홈', path: '/', icon: 'home' },
  { key: 'games', label: '게임', path: '/#games', icon: 'game', mobileSecondary: true },
  { key: 'about', label: '소개', path: '/about/', icon: 'about' },
  { key: 'fairness', label: '공정성', path: '/fairness/', icon: 'fairness' },
  {
    key: 'how-to-play',
    label: '도움말',
    path: '/how-to-play/',
    icon: 'help',
    mobileSecondary: true,
  },
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function sitePath(relativePath = '') {
  if (relativePath.startsWith('#')) return relativePath;
  const clean = relativePath.replace(/^\/+/, '');
  return clean ? `${config.basePath}${clean}` : config.basePath;
}

function absoluteUrl(relativePath = '') {
  return new URL(relativePath.replace(/^\/+/, ''), config.siteUrl).href;
}

function moduleHref(outputFile, sourceFile) {
  const relative = path
    .relative(path.dirname(outputFile), path.join(REPOSITORY_ROOT, sourceFile))
    .split(path.sep)
    .join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function renderHead({
  title,
  description,
  canonicalPath,
  ogImagePath = 'og-cover.png',
  imageAlt = `${title} 미리보기`,
  ogType = 'website',
  robots = 'index,follow,max-image-preview:large',
  structuredData,
  themeColor = '#f7f3eb',
  colorScheme = 'light',
}) {
  const canonical = absoluteUrl(canonicalPath);
  const image = absoluteUrl(ogImagePath);
  const accountMeta =
    config.adsense.accountMetaEnabled && !robots.includes('noindex')
      ? `\n    <meta name="google-adsense-account" content="${escapeHtml(config.adsense.clientId)}" />`
      : '';
  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="${escapeHtml(themeColor)}" />
    <meta name="color-scheme" content="${escapeHtml(colorScheme)}" />
    <meta name="robots" content="${escapeHtml(robots)}" />
    <meta name="description" content="${escapeHtml(description)}" />${accountMeta}
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="${escapeHtml(ogType)}" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:site_name" content="모여PLAY" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />
    <link rel="icon" href="${escapeHtml(sitePath('favicon.svg'))}" type="image/svg+xml" sizes="any" />
    <link rel="apple-touch-icon" href="${escapeHtml(sitePath('apple-touch-icon.png'))}" sizes="180x180" />
    <link rel="manifest" href="${escapeHtml(sitePath('manifest.webmanifest'))}" />
    <title>${escapeHtml(title)}</title>${
      structuredData
        ? `\n    <script type="application/ld+json">${jsonForScript(structuredData)}</script>`
        : ''
    }`;
}

function renderNavIcon(icon) {
  if (icon === 'home') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9.5 19.5v-6h5v6"/></svg>';
  }
  if (icon === 'game') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8.5 8h7a4 4 0 0 1 3.8 2.8l1.5 4.7a2.6 2.6 0 0 1-4.3 2.7l-1.7-1.5H9.2l-1.7 1.5a2.6 2.6 0 0 1-4.3-2.7l1.5-4.7A4 4 0 0 1 8.5 8ZM8 11v4m-2-2h4m6-1h.01M18 14h.01"/></svg>';
  }
  if (icon === 'about') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.8-4.3 3-6.5 6.5-6.5s5.7 2.2 6.5 6.5"/></svg>';
  }
  if (icon === 'fairness') {
    return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v17M6 6h12M6 6l-3 6h6L6 6Zm12 0-3 6h6l-3-6ZM8 20h8"/></svg>';
  }
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4.9c0 1.7-2.2 2-2.2 3.5M12 17h.01"/></svg>';
}

function renderHeader(activeNav) {
  return `<header class="content-header">
      <a class="content-brand" href="${sitePath()}" aria-label="모여PLAY 홈">
        <span class="content-brand__mark" aria-hidden="true">M</span>
        <strong>모여<span>PLAY</span></strong>
      </a>
      <nav class="content-nav" aria-label="주요 메뉴">
        ${NAV_ITEMS.map((item) => {
          const isActive = item.key === activeNav;
          const className = item.mobileSecondary ? ' class="content-nav__mobile-secondary"' : '';
          return `<a${className} href="${sitePath(item.path)}"${isActive ? ' aria-current="page"' : ''}>${renderNavIcon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`;
        }).join('')}
        <a class="content-nav__play" href="${sitePath('play/#lobby')}">바로 플레이</a>
      </nav>
    </header>`;
}

function renderFooter() {
  return `<footer class="content-footer">
      <div><strong>모여PLAY</strong><p>게임 설정과 최근 전적은 운영 서버에 업로드하지 않고 현재 브라우저에 저장합니다.</p></div>
      <nav class="content-footer__nav" aria-label="정책 및 안내">
        <a href="${sitePath()}">게임</a>
        <a href="${sitePath('about/')}">소개</a>
        <a href="${sitePath('how-to-play/')}">사용법</a>
        <a href="${sitePath('fairness/')}">공정성</a>
        <a href="${sitePath('privacy/')}">개인정보</a>
        <a href="${sitePath('terms/')}">이용약관</a>
        <a href="${sitePath('contact/')}">문의</a>
        <a href="${escapeHtml(SITE_META.repositoryUrl)}" rel="noopener noreferrer">GitHub</a>
        <button type="button" data-back-to-top>맨 위로</button>
      </nav>
    </footer>`;
}

function renderBreadcrumb(items) {
  return `<nav class="breadcrumb" aria-label="현재 위치"><ol>${items
    .map((item, index) => {
      const isLast = index === items.length - 1;
      return `<li>${
        isLast
          ? `<span aria-current="page">${escapeHtml(item.label)}</span>`
          : `<a href="${sitePath(item.path)}">${escapeHtml(item.label)}</a>`
      }</li>`;
    })
    .join('')}</ol></nav>`;
}

function renderAdSlot() {
  if (!config.adsense.adsEnabled) return '';
  return `<aside class="ad-slot" aria-label="광고" data-adsense-slot data-adsense-client="${escapeHtml(config.adsense.clientId)}" data-adsense-test-mode="${String(config.adsense.testMode)}">
      <span class="ad-slot__label">광고 · Advertisement</span>
      <ins class="adsbygoogle" data-ad-client="${escapeHtml(config.adsense.clientId)}" data-ad-slot="${escapeHtml(config.adsense.contentSlotId)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <noscript>광고는 동의와 JavaScript가 모두 준비된 경우에만 요청됩니다.</noscript>
    </aside>`;
}

function renderLayout({ outputFile, head, activeNav, body, inlineHeadScript = '' }) {
  return `<!doctype html>
<html lang="ko">
  <head>${head}${inlineHeadScript}</head>
  <body class="content-body">
    <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <div class="ambient ambient--one" aria-hidden="true"></div>
    <div class="ambient ambient--two" aria-hidden="true"></div>
    <div class="content-site">
      ${renderHeader(activeNav)}
      <main class="content-main" id="main-content">${body}</main>
      ${renderFooter()}
    </div>
    <script type="module" src="${moduleHref(outputFile, 'src/static-site.ts')}"></script>
  </body>
</html>
`;
}

function renderHeroPicture() {
  const prefix = 'assets/hero/party-diorama';
  return `<picture class="hero-art__picture">
      <source type="image/avif" srcset="${sitePath(`${prefix}.avif`)}" />
      <source type="image/webp" srcset="${sitePath(`${prefix}.webp`)}" />
      <img src="${sitePath(`${prefix}.jpg`)}" width="1440" height="810" loading="eager" fetchpriority="high" decoding="async" alt="오목판, 탁구, 배구와 룰렛을 점토로 표현한 모여PLAY 게임 디오라마" />
    </picture>`;
}

function renderPicture(game, className = '') {
  const prefix = `assets/game-icons/${game.id}`;
  return `<picture${className ? ` class="${className}"` : ''}>
      <source type="image/avif" srcset="${sitePath(`${prefix}.avif`)}" />
      <source type="image/webp" srcset="${sitePath(`${prefix}.webp`)}" />
      <img src="${sitePath(`${prefix}.png`)}" width="320" height="320" loading="lazy" decoding="async" alt="" />
    </picture>`;
}

function renderStaticGameCard(game) {
  return `<article class="static-game-card" style="--game-accent: ${escapeHtml(GAME_ACCENTS[game.id])}">
      ${renderPicture(game)}
      <p class="content-kicker">${escapeHtml(game.players)} · ${escapeHtml(game.duration)}</p>
      <h3>${escapeHtml(game.title)}</h3>
      <p>${escapeHtml(game.shortDescription)}</p>
      <div class="static-game-card__links">
        <a href="${sitePath(`play/#game/${game.id}`)}">게임 시작</a>
        <a href="${sitePath(`games/${game.slug}/`)}">가이드</a>
      </div>
    </article>`;
}

function renderItems(items) {
  return `<div class="feature-grid">${items
    .map(
      (item) =>
        `<article class="feature-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></article>`,
    )
    .join('')}</div>`;
}

function renderSection(section) {
  const paragraphs = section.paragraphs
    ? section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
    : '';
  const list = section.steps
    ? `<ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
    : '';
  const items = section.items ? renderItems(section.items) : '';
  const note = section.note
    ? `<aside class="article-callout"><strong>알아두기</strong><p>${escapeHtml(section.note)}</p></aside>`
    : '';
  const link = section.link
    ? `<p><a class="content-button" href="${sitePath(section.link.href)}">${escapeHtml(section.link.label)}</a></p>`
    : '';
  const links = section.links
    ? `<ul class="content-link-list">${section.links
        .map((item) => {
          const href = item.external ? item.href : sitePath(item.href);
          const rel = item.external ? ' rel="noopener noreferrer"' : '';
          return `<li><a href="${escapeHtml(href)}"${rel}>${escapeHtml(item.label)}</a></li>`;
        })
        .join('')}</ul>`
    : '';
  return `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(section.title)}</h2>${paragraphs}${list}${items}${note}${link}${links}</section>`;
}

function rootStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${config.siteUrl}#website`,
        url: config.siteUrl,
        name: SITE_META.name,
        description: PAGE_CONTENT.root.description,
        inLanguage: 'ko-KR',
      },
      {
        '@type': 'WebApplication',
        '@id': `${config.siteUrl}#application`,
        name: SITE_META.name,
        url: absoluteUrl('play/'),
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        browserRequirements: 'JavaScript와 최신 브라우저 필요',
        isAccessibleForFree: true,
        inLanguage: 'ko-KR',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      },
    ],
  };
}

function renderRoot(outputFile) {
  const page = PAGE_CONTENT.root;
  const legacyScript = `
    <script>
      (() => {
        const hash = window.location.hash;
        const gameHash = new RegExp('^#game/(?:${GAME_CONTENT.map((game) => game.id).join('|')})$');
        if (hash === '#lobby' || gameHash.test(hash)) {
          window.location.replace(${JSON.stringify(sitePath('play/'))} + hash);
        }
      })();
    </script>`;
  const sections = page.sections.map(renderSection).join('');
  const headingParts = page.heading.split(', ');
  const headingLead = headingParts[0] ?? page.heading;
  const headingAccent = headingParts.slice(1).join(', ');
  const body = `<section class="landing-hero">
      <div class="landing-hero__copy">
        <p class="content-kicker">${escapeHtml(page.eyebrow)}</p>
        <h1><span>${escapeHtml(headingLead)}</span>${headingAccent ? `<em>${escapeHtml(headingAccent)}!</em>` : ''}</h1>
        <p class="content-lead">${escapeHtml(page.lead)}</p>
        <div class="content-actions">
          <a class="content-button content-button--primary" href="${sitePath('play/#lobby')}"><span class="content-button__play" aria-hidden="true">▶</span>게임 시작</a>
          <a class="content-button" href="#games">8가지 게임 보기</a>
        </div>
      </div>
      <div class="hero-art">${renderHeroPicture()}</div>
    </section>
    <section class="section-block" id="games"><h2>8가지 게임 가이드</h2><p class="section-intro">제목과 규칙을 먼저 살펴보거나 바로 게임을 열 수 있습니다. 모든 링크는 JavaScript 없이도 이동합니다.</p><div class="static-game-grid">${GAME_CONTENT.map(renderStaticGameCard).join('')}</div></section>
    <div class="article-body">${sections}</div>
    ${renderAdSlot()}`;
  return renderLayout({
    outputFile,
    activeNav: 'home',
    inlineHeadScript: legacyScript,
    head: renderHead({
      title: '모여PLAY — 설치 없이 함께 즐기는 8가지 파티 게임',
      description: page.description,
      canonicalPath: '',
      structuredData: rootStructuredData(),
    }),
    body,
  });
}

function guideStructuredData(game) {
  const url = absoluteUrl(`games/${game.slug}/`);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: GAME_SEO_TITLES[game.id],
        description: game.shortDescription,
        inLanguage: 'ko-KR',
        dateModified: game.updated,
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: { '@id': `${url}#game` },
      },
      {
        '@type': 'VideoGame',
        '@id': `${url}#game`,
        name: game.title,
        description: game.longDescription,
        url,
        gamePlatform: 'Web browser',
        numberOfPlayers: {
          '@type': 'QuantitativeValue',
          ...GAME_PLAYER_COUNTS[game.id],
        },
        playMode: 'MultiPlayer',
        inLanguage: 'ko-KR',
        isAccessibleForFree: true,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: config.siteUrl },
          { '@type': 'ListItem', position: 2, name: '게임', item: `${config.siteUrl}#games` },
          { '@type': 'ListItem', position: 3, name: game.title, item: url },
        ],
      },
    ],
  };
}

function renderStringList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderRelatedCard(game) {
  return `<article class="feature-card"><strong>${escapeHtml(game.title)}</strong><p>${escapeHtml(game.shortDescription)}</p><a class="content-button" href="${sitePath(`games/${game.slug}/`)}">가이드 보기</a></article>`;
}

function renderGuide(game, outputFile) {
  const related = game.related.map((id) => gameById.get(id)).filter(Boolean);
  const body = `${renderBreadcrumb([
    { label: '홈', path: '/' },
    { label: '게임', path: '/#games' },
    { label: game.title, path: `/games/${game.slug}/` },
  ])}
    <section class="guide-hero">
      <div>
        <p class="content-kicker">${escapeHtml(game.genre)} · ${escapeHtml(game.players)}</p>
        <h1>${escapeHtml(game.title)} 게임 가이드</h1>
        <p class="content-lead">${escapeHtml(game.longDescription)}</p>
        <div class="content-actions"><a class="content-button content-button--primary" href="${sitePath(`play/#game/${game.id}`)}">${escapeHtml(game.title)} 바로 플레이</a><a class="content-button" href="${sitePath('fairness/')}">공정성 원칙</a></div>
      </div>
      <div class="guide-icon" style="--accent: ${escapeHtml(GAME_ACCENTS[game.id])}">${renderPicture(game)}</div>
    </section>
    <div class="guide-facts">
      <article class="fact-card"><strong>인원</strong><p>${escapeHtml(game.players)}</p></article>
      <article class="fact-card"><strong>예상 시간</strong><p>${escapeHtml(game.duration)}</p></article>
      <article class="fact-card"><strong>장르</strong><p>${escapeHtml(game.genre)}</p></article>
      <article class="fact-card"><strong>지원 기기</strong><p>데스크톱·모바일 웹</p></article>
    </div>
    <img class="guide-screenshot" src="${sitePath(`assets/screenshots/${game.id}.webp`)}" width="1280" height="720" loading="lazy" decoding="async" alt="${escapeHtml(`${game.title} 실제 게임 화면`)}" />
    <div class="article-body">
      <section><h2>이 게임이 잘 맞는 상황</h2><p>${escapeHtml(game.bestFor)}</p></section>
      <section><h2>시작 전 준비</h2>${renderStringList(game.setup)}</section>
      <section><h2>규칙과 승리 조건</h2>${renderStringList(game.rules)}<div class="article-callout"><strong>승리 조건</strong><p>${escapeHtml(game.winCondition)}</p></div></section>
      <section><h2>조작 방법</h2><h3>데스크톱</h3>${renderStringList(game.controls.desktop)}<h3>모바일</h3>${renderStringList(game.controls.mobile)}</section>
      <section><h2>공정성</h2>${renderStringList(game.fairness)}<p><a class="content-button" href="${sitePath('fairness/')}">전체 공정성 설명 보기</a></p></section>
      ${renderAdSlot()}
      <section><h2>실수하기 쉬운 점과 팁</h2>${renderStringList(game.tips)}</section>
      <section><h2>접근성과 화면 방향</h2>${renderStringList(game.accessibility)}</section>
      <section><h2>관련 게임</h2><div class="related-grid">${related.map(renderRelatedCard).join('')}</div></section>
      <section><h2>바로 한 판 시작하기</h2><p>${escapeHtml(game.shortDescription)}</p><a class="content-button content-button--primary" href="${sitePath(`play/#game/${game.id}`)}">${escapeHtml(game.title)} 열기</a></section>
      <section class="guide-byline" aria-label="문서 작성 정보"><h2>문서 정보</h2><p>작성·운영: <a href="${sitePath('about/#operator-and-authorship')}">${escapeHtml(config.siteOperatorName || '모여PLAY 프로젝트')}</a></p><p>최초 작성: <time datetime="${escapeHtml(SITE_META.created)}">${escapeHtml(SITE_META.created)}</time> · 최종 수정: <time datetime="${escapeHtml(game.updated)}">${escapeHtml(game.updated)}</time></p><p><a href="${escapeHtml(SITE_META.repositoryUrl)}" rel="noopener noreferrer">공개 저장소에서 구현과 변경 이력 보기</a></p></section>
    </div>`;
  return renderLayout({
    outputFile,
    activeNav: 'games',
    head: renderHead({
      title: GAME_SEO_TITLES[game.id],
      description: game.shortDescription,
      canonicalPath: `games/${game.slug}/`,
      ogImagePath: `assets/og/${game.id}.png`,
      imageAlt: `${game.title} — 모여PLAY 게임 가이드 미리보기`,
      ogType: 'article',
      structuredData: guideStructuredData(game),
    }),
    body,
  });
}

function pageStructuredData(page) {
  const url = absoluteUrl(page.path);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: `${page.title} | 모여PLAY`,
        description: page.description,
        inLanguage: 'ko-KR',
        dateModified: page.updated,
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: config.siteUrl },
          { '@type': 'ListItem', position: 2, name: page.title, item: url },
        ],
      },
    ],
  };
}

function renderContactChannels(page) {
  const email = config.publicContactEmail
    ? `<article class="feature-card"><strong>${escapeHtml(page.channels.email.label)}</strong><p>공개 문의 주소: <a href="mailto:${escapeHtml(config.publicContactEmail)}">${escapeHtml(config.publicContactEmail)}</a></p><a class="content-button" href="mailto:${escapeHtml(config.publicContactEmail)}">이메일 보내기</a></article>`
    : '';
  const fallback = page.channels.fallback;
  const repository = page.channels.repository;
  const readinessNote = config.publicContactEmail
    ? ''
    : '<aside class="article-callout"><strong>공개 이메일 미설정</strong><p>현재 문의는 GitHub Issues를 사용합니다. AdSense 신청 전 실제 도메인에서 운영하는 공개 연락처 설정이 권장되며, 가짜 주소는 표시하지 않습니다.</p></aside>';
  return `<section><h2>문의 채널</h2>${readinessNote}<div class="feature-grid">${email}<article class="feature-card"><strong>${escapeHtml(fallback.label)}</strong><p>${escapeHtml(fallback.description)}</p><a class="content-button" href="${escapeHtml(fallback.href)}" rel="noopener noreferrer">GitHub Issues 열기</a></article><article class="feature-card"><strong>${escapeHtml(repository.label)}</strong><p>${escapeHtml(repository.description)}</p><a class="content-button" href="${escapeHtml(repository.href)}" rel="noopener noreferrer">저장소 열기</a></article></div></section>`;
}

function privacyAdProfileDisclosure() {
  if (config.adsense.adsEnabled) {
    const mode = config.adsense.testMode ? 'ads-enabled-test' : 'ads-enabled';
    const detail = config.adsense.testMode
      ? '이 격리 테스트 빌드에는 광고 영역이 있지만 Google 광고 스크립트와 외부 요청은 만들지 않습니다.'
      : '이 빌드에는 광고 영역이 있지만, 실제 CMP adapter가 동의 상태를 granted로 전달하기 전에는 Google 광고 스크립트나 요청을 만들지 않습니다.';
    return `<aside class="article-callout" data-privacy-ad-profile="${mode}"><strong>이 빌드의 광고 처리</strong><p>${detail}</p></aside>`;
  }
  if (config.adsense.accountMetaEnabled) {
    return '<aside class="article-callout" data-privacy-ad-profile="account-meta-only"><strong>AdSense 계정 확인 메타만 사용 중</strong><p>색인 가능한 페이지에는 사이트 소유권 확인용 계정 메타가 있지만 광고 영역, Google 광고 스크립트와 광고 요청은 없습니다.</p></aside>';
  }
  return '<aside class="article-callout" data-privacy-ad-profile="off"><strong>광고 꺼짐</strong><p>현재 빌드는 AdSense 계정 확인 메타, 광고 영역, Google 광고 스크립트와 광고 요청을 만들지 않습니다.</p></aside>';
}

function privacyAdvertisingSection(section) {
  const paragraphs = config.adsense.adsEnabled
    ? [
        '이 빌드에는 홈 콘텐츠 하단과 8개 게임 가이드 본문의 수동 반응형 광고 영역이 활성화되어 있습니다. /play/와 소개·사용법·공정성·개인정보·이용약관·문의 페이지에는 광고 영역을 두지 않습니다.',
        'Google과 승인된 광고 파트너는 광고 제공·측정·부정행위 방지·사용자 선택에 따른 개인화를 위해 쿠키, 웹 비콘 또는 유사 기술, IP 주소, 페이지 URL, 브라우저·기기 정보를 처리할 수 있습니다. 비개인화 광고도 모든 기술적 처리가 사라진다는 뜻은 아닙니다.',
        'moyeoplay:ads-consent-granted와 상태 이벤트는 CMP 자체가 아니라 연결 adapter의 신호입니다. 동의 전, 거부, 철회 또는 CMP 오류 상태에서는 새 광고 요청을 허용하지 않으며, 실제 CMP가 선택·거부·철회 UI와 적용 지역의 요구사항을 담당해야 합니다.',
      ]
    : [
        config.adsense.accountMetaEnabled
          ? '현재 빌드는 AdSense 사이트 소유권 확인용 계정 메타만 사용하며 광고 게재는 활성화하지 않습니다. 메타만으로 광고 영역, Google 광고 스크립트 또는 광고 요청을 만들지 않습니다.'
          : '현재 빌드에서 AdSense 사이트 확인과 광고 게재는 모두 비활성화되어 있습니다. 이 사실이 호스팅 인프라의 기술 로그나 외부 문의 플랫폼의 데이터 처리까지 없다는 뜻은 아닙니다.',
        '향후 광고를 활성화하면 Google과 승인된 광고 파트너가 광고 제공·측정·부정행위 방지·사용자 선택에 따른 개인화를 위해 쿠키, 웹 비콘 또는 유사 기술, IP 주소, 페이지 URL, 브라우저·기기 정보를 처리할 수 있습니다.',
        '광고를 켜기 전 실제 Google 인증 CMP를 연결하고 동의, 거부, 설정 변경과 철회 경로를 제공해야 합니다.',
      ];
  if (config.adsense.cmpProviderName) {
    paragraphs.push(
      `이 빌드에 공개된 CMP는 ${config.adsense.cmpProviderName}입니다. 실제 동의 선택과 철회는 아래 설정 링크에서 관리합니다.`,
    );
  }
  return {
    ...section,
    paragraphs,
    links: config.adsense.cmpProviderName
      ? [
          ...section.links,
          {
            label: `${config.adsense.cmpProviderName} 개인정보 설정`,
            href: config.adsense.cmpSettingsUrl,
            external: true,
          },
        ]
      : section.links,
  };
}

function renderContentPage(page, outputFile) {
  const contact = page.slug === 'contact' ? renderContactChannels(page) : '';
  const privacyDisclosure = page.slug === 'privacy' ? privacyAdProfileDisclosure() : '';
  const operatorDisclosure =
    page.slug === 'about'
      ? `<aside class="article-callout"><strong>공개 운영·제작 주체</strong><p>${
          config.siteOperatorName
            ? escapeHtml(config.siteOperatorName)
            : 'SITE_OPERATOR_NAME이 아직 설정되지 않아 개인 또는 법인 이름을 임의로 표시하지 않습니다. 현재 작성 주체는 모여PLAY 프로젝트로 공개합니다.'
        }</p></aside>`
      : '';
  const sections = page.sections
    .map((section) => {
      if (page.slug === 'privacy' && section.id === 'ads-and-measurement') {
        return privacyAdvertisingSection(section);
      }
      return section;
    })
    .map(renderSection)
    .join('');
  const body = `${renderBreadcrumb([
    { label: '홈', path: '/' },
    { label: page.title, path: page.path },
  ])}
    <header class="article-hero"><p class="content-kicker">모여PLAY 안내</p><h1>${escapeHtml(page.heading)}</h1><p class="content-lead">${escapeHtml(page.lead)}</p></header>
    <div class="article-body">${privacyDisclosure}${operatorDisclosure}${contact}${sections}${page.effective ? `<p>시행일: <time datetime="${escapeHtml(page.effective)}">${escapeHtml(page.effective)}</time></p>` : ''}<p>최종 갱신: <time datetime="${escapeHtml(page.updated)}">${escapeHtml(page.updated)}</time></p></div>`;
  return renderLayout({
    outputFile,
    activeNav: page.slug,
    head: renderHead({
      title: `${page.title} | 모여PLAY`,
      description: page.description,
      canonicalPath: page.path,
      structuredData: pageStructuredData(page),
    }),
    body,
  });
}

function renderPlay(outputFile) {
  const title = '모여PLAY 게임 로비 — 8가지 로컬 파티 게임';
  const description =
    '오목, 탁구, 배구, 핀볼, 사다리, 반응속도, 탭 배틀, 룰렛을 한 기기에서 바로 실행하세요.';
  return `<!doctype html>
<html lang="ko">
  <head>${renderHead({
    title,
    description,
    canonicalPath: 'play/',
    robots: 'noindex,follow',
  })}</head>
  <body class="play-app" data-view="lobby">
    <div id="app"></div>
    <noscript><p>게임 실행에는 JavaScript가 필요합니다. <a href="${sitePath()}">정적 게임 안내로 돌아가기</a></p></noscript>
    <script type="module" src="${moduleHref(outputFile, 'src/main.ts')}"></script>
  </body>
</html>
`;
}

async function writeGenerated(relativePath, source) {
  const target = path.join(generatedRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source, 'utf8');
}

function sitemapSource() {
  const entries = [
    { path: '', updated: PAGE_CONTENT.root.updated },
    ...GAME_CONTENT.map((game) => ({ path: `games/${game.slug}/`, updated: game.updated })),
    ...Object.entries(PAGE_CONTENT)
      .filter(([key]) => key !== 'root')
      .map(([, page]) => ({ path: page.path, updated: page.updated })),
  ];
  const unique = new Set(entries.map((entry) => absoluteUrl(entry.path)));
  if (unique.size !== 15 || entries.length !== 15) {
    throw new Error('Sitemap must contain exactly 15 unique indexable clean URLs.');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(absoluteUrl(entry.path))}</loc><lastmod>${escapeXml(entry.updated)}</lastmod></url>`,
    )
    .join('\n')}\n</urlset>\n`;
}

async function generate() {
  await rm(generatedRoot, { recursive: true, force: true });
  await mkdir(generatedRoot, { recursive: true });

  const rootFile = path.join(generatedRoot, 'index.html');
  const playFile = path.join(generatedRoot, 'play/index.html');
  await writeGenerated('index.html', renderRoot(rootFile));
  await writeGenerated('play/index.html', renderPlay(playFile));

  for (const game of GAME_CONTENT) {
    const relativePath = `games/${game.slug}/index.html`;
    await writeGenerated(relativePath, renderGuide(game, path.join(generatedRoot, relativePath)));
  }
  for (const [, page] of Object.entries(PAGE_CONTENT).filter(([key]) => key !== 'root')) {
    const relativePath = `${page.slug}/index.html`;
    await writeGenerated(
      relativePath,
      renderContentPage(page, path.join(generatedRoot, relativePath)),
    );
  }

  await writeGenerated('sitemap.xml', sitemapSource());
  if (config.basePath === '/') {
    await writeGenerated(
      'robots.txt',
      `User-agent: *\nAllow: /\nSitemap: ${absoluteUrl('sitemap.xml')}\n`,
    );
    if (config.adsense.publisherId) {
      await writeGenerated(
        'ads.txt',
        `google.com, ${config.adsense.publisherId}, DIRECT, f08c47fec0942fa0\n`,
      );
    }
  }
  if (config.customDomain) await writeGenerated('CNAME', `${config.customDomain}\n`);

  console.log(
    `Generated 16 HTML entries for ${config.siteUrl} (${config.basePath}) with AdSense account metadata ${config.adsense.accountMetaEnabled ? 'enabled' : 'disabled'} and ads ${config.adsense.adsEnabled ? 'enabled' : 'disabled'}.`,
  );
}

await generate();
