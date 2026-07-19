import { AudioManager } from '../core/audio-manager';
import type {
  GameDefinition,
  GameId,
  GamePhase,
  GameResult,
  MiniGameController,
} from '../core/game-controller';
import { clearElement, queryRequired, setText } from '../core/dom';
import { secureRandomIndex } from '../core/seeded-random';
import { createGameCard } from '../components/game-card';
import { Modal } from '../components/modal';
import { Toast } from '../components/toast';
import { GAME_DEFINITIONS, getGameDefinition, loadGameForRetry } from './game-registry';
import { navigateToGame, navigateToLobby, parseHash } from './router';
import { SessionStore, type SessionState } from './session-store';
import { SettingsStore, type SettingsState } from './settings-store';

const TWO_PLAYER_GAMES = new Set<GameId>([
  'omok',
  'pong',
  'volleyball',
  'pinball-drop',
  'reaction-duel',
  'tap-battle',
]);
const ONE_SCREEN_GAMES = new Set<GameId>([
  'pong',
  'volleyball',
  'pinball-drop',
  'reaction-duel',
  'tap-battle',
]);

const PHASE_LABELS: Record<GamePhase, string> = {
  idle: '시작 대기',
  countdown: '카운트다운',
  playing: '경기 중',
  paused: '일시정지',
  roundOver: '라운드 종료',
  matchOver: '경기 종료',
};

function sitePath(path = ''): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

function cleanAbsoluteSiteUrl(path = ''): string {
  const url = new URL(sitePath(path), window.location.origin);
  url.search = '';
  url.hash = '';
  return url.href;
}

export class AppShell {
  readonly #root: HTMLElement;
  readonly #settings = new SettingsStore();
  readonly #session = new SessionStore();
  readonly #audio = new AudioManager();
  readonly #toast = new Toast();
  readonly #rulesModal = new Modal('게임 규칙');
  readonly #settingsModal = new Modal('플레이 설정', 'settings-modal');
  readonly #resultModal = new Modal('경기 결과', 'result-modal');
  readonly #abort = new AbortController();
  #controller: MiniGameController | null = null;
  #currentGame: GameDefinition | null = null;
  #phase: GamePhase = 'idle';
  #loadToken = 0;
  #settingsState: SettingsState = this.#settings.value;
  #wasAutoPaused = false;
  #scrollToGamesOnLobby = false;
  #hasRouted = false;
  #failedGameId: GameId | null = null;
  #retryRequiresReload = false;
  #announceTimer: number | null = null;

  readonly #lobby: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #gameHost: HTMLElement;
  readonly #gameGrid: HTMLElement;
  readonly #liveRegion: HTMLElement;
  readonly #stageTitle: HTMLElement;
  readonly #stageEyebrow: HTMLElement;
  readonly #phaseLabel: HTMLElement;
  readonly #startButton: HTMLButtonElement;
  readonly #fullscreenButton: HTMLButtonElement;
  readonly #orientationNotice: HTMLElement;
  readonly #scoreP1: HTMLElement;
  readonly #scoreP2: HTMLElement;
  readonly #recentList: HTMLElement;
  readonly #soundButton: HTMLButtonElement;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#renderShell();
    this.#lobby = queryRequired(root, '#lobby-view');
    this.#stage = queryRequired(root, '#game-view');
    this.#gameHost = queryRequired(root, '#game-host');
    this.#gameGrid = queryRequired(root, '#game-grid');
    this.#liveRegion = queryRequired(root, '#app-announcer');
    this.#stageTitle = queryRequired(root, '#stage-title');
    this.#stageEyebrow = queryRequired(root, '#stage-eyebrow');
    this.#phaseLabel = queryRequired(root, '#game-phase');
    this.#startButton = queryRequired(root, '#game-start');
    this.#fullscreenButton = queryRequired(root, '#game-fullscreen');
    this.#orientationNotice = queryRequired(root, '#orientation-notice');
    this.#scoreP1 = queryRequired(root, '#session-p1-score');
    this.#scoreP2 = queryRequired(root, '#session-p2-score');
    this.#recentList = queryRequired(root, '#recent-list');
    this.#soundButton = queryRequired(root, '#sound-toggle');

    this.#renderCards();
    this.#buildSettingsModal();
    this.#bindEvents();
    this.#syncViewportHeight();
    this.#settings.subscribe((state) => this.#applySettings(state));
    this.#session.subscribe((state) => this.#renderSession(state));
    this.#fullscreenButton.hidden = !document.fullscreenEnabled;

    if (!location.hash)
      history.replaceState(null, '', `${location.pathname}${location.search}#lobby`);
    void this.#route();
  }

  destroy(): void {
    this.#abort.abort();
    delete document.body.dataset.oneScreenGame;
    for (const property of [
      '--app-viewport-height',
      '--app-viewport-width',
      '--app-viewport-offset-top',
      '--app-viewport-offset-left',
    ]) {
      document.documentElement.style.removeProperty(property);
    }
    delete document.documentElement.dataset.visualViewportFallback;
    this.#destroyController();
    this.#audio.destroy();
    this.#toast.destroy();
    this.#rulesModal.destroy();
    this.#settingsModal.destroy();
    this.#resultModal.destroy();
  }

  #renderShell(): void {
    this.#root.innerHTML = `
      <a class="skip-link" href="#main-content" data-action="skip">본문으로 건너뛰기</a>
      <div class="ambient ambient--one" aria-hidden="true"></div>
      <div class="ambient ambient--two" aria-hidden="true"></div>
      <div class="app-frame">
        <header class="site-header">
          <button class="brand" type="button" data-action="lobby">
            <span class="brand__mark" aria-hidden="true"><i></i><i></i><b>M</b></span>
            <span><strong>모여<span>PLAY</span></strong><small>모이면 바로 한 판</small></span>
            <span class="visually-hidden">로비로 이동</span>
          </button>
          <nav class="app-nav" aria-label="주요 화면">
            <button class="app-nav__item" type="button" data-action="lobby">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9.5 19.5v-6h5v6"/></svg>
              <span>홈</span>
            </button>
            <button class="app-nav__item" type="button" data-action="scroll-games">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8.5 8h7a4 4 0 0 1 3.8 2.8l1.5 4.7a2.6 2.6 0 0 1-4.3 2.7l-1.7-1.5H9.2l-1.7 1.5a2.6 2.6 0 0 1-4.3-2.7l1.5-4.7A4 4 0 0 1 8.5 8ZM8 11v4m-2-2h4m6-1h.01M18 14h.01"/></svg>
              <span>게임</span>
            </button>
            <a class="app-nav__item" href="${sitePath('how-to-play/')}">
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4.9c0 1.7-2.2 2-2.2 3.5M12 17h.01"/></svg>
              <span>도움말</span>
            </a>
          </nav>
          <div class="header-actions">
            <button class="icon-button" id="sound-toggle" type="button" aria-label="사운드 끄기" title="사운드 켜기/끄기">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4Zm12.4-.9a4 4 0 0 1 0 5.8M18.8 6.7a7.5 7.5 0 0 1 0 10.6"/></svg>
            </button>
            <button class="header-button" type="button" data-action="settings" aria-label="플레이 설정">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7-3.2 2-1.5-2-3.4-2.5 1a8 8 0 0 0-1.8-1L14.3 4h-4.6l-.4 3.1a8 8 0 0 0-1.8 1L5 7.1l-2 3.4L5 12a8 8 0 0 0 0 2L3 15.5l2 3.4 2.5-1a8 8 0 0 0 1.8 1l.4 3.1h4.6l.4-3.1a8 8 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5a8 8 0 0 0 0-2Z"/></svg>
              <span>설정</span>
            </button>
          </div>
        </header>

        <main id="main-content" tabindex="-1">
          <section class="lobby" id="lobby-view" aria-labelledby="hero-title">
            <div class="hero">
              <div class="hero__copy">
                <p class="eyebrow"><span>LOCAL PARTY ARCADE</span> 한 화면, 여덟 가지 승부</p>
                <h1 id="hero-title" tabindex="-1">친구들이 모이면<br /><em>바로 한 판!</em></h1>
                <p class="hero__description">오목부터 순발력 대결, 공정한 룰렛까지. 가입도 설치도 없이 이 화면을 가운데 두고 바로 시작하세요.</p>
                <p class="privacy-pill"><span aria-hidden="true"></span> 로그인 없음 · 게임 설정과 전적은 브라우저 저장</p>
                <div class="hero__actions">
                  <button class="primary-button primary-button--hero" type="button" data-action="scroll-games"><span class="primary-button__play" aria-hidden="true">▶</span>게임 시작</button>
                  <button class="secondary-button" type="button" data-action="random">랜덤 선택</button>
                  <button class="secondary-button" type="button" data-action="share">링크 공유</button>
                </div>
                <ul class="trust-list" aria-label="서비스 특징">
                  <li><strong>2번</strong><span>이내로 게임 시작</span></li>
                  <li><strong>8개</strong><span>완성된 로컬 게임</span></li>
                  <li><strong>로컬</strong><span>설정 · 최근 전적 브라우저 저장</span></li>
                </ul>
              </div>
              <picture class="hero-visual" aria-hidden="true">
                <source type="image/avif" srcset="${sitePath('assets/hero/party-diorama.avif')}" />
                <source type="image/webp" srcset="${sitePath('assets/hero/party-diorama.webp')}" />
                <img src="${sitePath('assets/hero/party-diorama.jpg')}" width="1440" height="810" loading="eager" fetchpriority="high" decoding="async" alt="" />
              </picture>
            </div>

            <aside class="session-card" aria-labelledby="session-title">
              <div class="session-card__top">
                <div><p class="eyebrow">CURRENT SESSION</p><h2 id="session-title">오늘의 전적</h2></div>
                <button class="text-button" type="button" data-action="clear-session">초기화</button>
              </div>
              <div class="session-score" aria-label="2인 게임 누적 승수">
                <div><span class="player-dot player-dot--one" aria-hidden="true"></span><small data-player-name="1">PLAYER 1</small><strong id="session-p1-score">0</strong><span>승</span></div>
                <b aria-hidden="true">:</b>
                <div><span class="player-dot player-dot--two" aria-hidden="true"></span><small data-player-name="2">PLAYER 2</small><strong id="session-p2-score">0</strong><span>승</span></div>
              </div>
              <div class="recent-block">
                <h3>최근 플레이</h3>
                <ol id="recent-list"><li class="empty-state">아직 기록이 없습니다. 첫 승부를 시작해 보세요.</li></ol>
              </div>
            </aside>

            <section class="game-section" id="games" aria-labelledby="games-title">
              <div class="section-heading">
                <div><p class="eyebrow">CHOOSE A GAME</p><h2 id="games-title" tabindex="-1">지금 분위기에 맞는 한 판</h2></div>
                <p>카드를 열고 시작을 누르면 끝. 키보드와 멀티터치를 함께 지원합니다.</p>
              </div>
              <div class="game-grid" id="game-grid"></div>
            </section>

            <section class="play-steps" aria-labelledby="play-steps-title">
              <div class="play-steps__heading">
                <p class="eyebrow">HOW TO PLAY</p>
                <h2 id="play-steps-title">세 단계면 바로 시작</h2>
              </div>
              <ol>
                <li><span aria-hidden="true">01</span><div><strong>게임을 고르세요</strong><p>카드에서 게임 시작을 누르거나 랜덤 선택을 사용하세요.</p></div></li>
                <li><span aria-hidden="true">02</span><div><strong>한 기기를 가운데 두세요</strong><p>양쪽 터치 영역 또는 키보드를 각 플레이어가 함께 사용합니다.</p></div></li>
                <li><span aria-hidden="true">03</span><div><strong>시작을 누르고 승부하세요</strong><p>규칙을 확인한 뒤 플레이하고, 결과는 오늘의 전적에 자동 기록됩니다.</p></div></li>
              </ol>
            </section>

            <section class="promise-panel" aria-label="모여PLAY 데이터 안내">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6V10Zm6 4v2"/></svg>
              <div><strong>게임 설정과 최근 전적은 현재 브라우저에 저장합니다.</strong><p>이 정보는 운영 서버로 업로드하지 않습니다. 광고 기능이 활성화되는 경우의 데이터 처리는 <a class="inline-policy-link" href="${sitePath('privacy/')}">별도 개인정보 안내</a>를 따릅니다.</p></div>
              <button class="secondary-button" type="button" data-action="settings">이름과 설정 바꾸기</button>
            </section>
          </section>

          <section class="game-view" id="game-view" aria-labelledby="stage-title" hidden>
            <header class="game-hud">
              <button class="back-button" type="button" data-action="lobby" aria-label="로비로 이동"><span aria-hidden="true">←</span><span>로비</span></button>
              <div class="game-hud__title"><p id="stage-eyebrow">MINI GAME</p><h1 id="stage-title" tabindex="-1">게임</h1><span class="phase-pill" id="game-phase">시작 대기</span></div>
              <div class="game-hud__actions">
                <button class="hud-button" type="button" data-action="rules">규칙</button>
                <button class="hud-button hud-button--primary" id="game-start" type="button">시작</button>
                <button class="hud-button" type="button" data-action="reset">다시 시작</button>
                <button class="icon-button" type="button" data-action="share" aria-label="현재 게임 가이드 공유">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8.7 12.8 15.3 16.6M15.3 7.4 8.7 11.2M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>
                </button>
                <button class="icon-button" id="game-fullscreen" type="button" data-action="fullscreen" aria-label="전체 화면">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/></svg>
                </button>
                <button class="icon-button" type="button" data-action="settings" aria-label="플레이 설정">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7-3.2 2-1.5-2-3.4-2.5 1a8 8 0 0 0-1.8-1L14.3 4h-4.6l-.4 3.1a8 8 0 0 0-1.8 1L5 7.1l-2 3.4L5 12a8 8 0 0 0 0 2L3 15.5l2 3.4 2.5-1a8 8 0 0 0 1.8 1l.4 3.1h4.6l.4-3.1a8 8 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5a8 8 0 0 0 0-2Z"/></svg>
                </button>
              </div>
            </header>
            <p class="orientation-notice" id="orientation-notice" hidden><strong>가로 화면 권장</strong><span>세로에서도 플레이할 수 있지만 가로로 돌리면 조작 공간이 더 넓습니다.</span></p>
            <div class="game-host" id="game-host"></div>
          </section>
        </main>

        <footer class="site-footer">
          <div class="site-footer__summary"><a class="site-footer__home" href="${sitePath('')}"><strong>모여PLAY</strong></a><p>게임 설정과 최근 전적은 현재 브라우저에 저장되며 운영 서버로 업로드하지 않습니다.</p></div>
          <nav class="site-footer__nav" aria-label="사이트 정책과 안내">
            <a href="${sitePath('')}">게임</a>
            <a href="${sitePath('how-to-play/')}">이용 방법</a>
            <a href="${sitePath('fairness/')}">공정성</a>
            <a href="${sitePath('privacy/')}">개인정보</a>
            <a href="${sitePath('terms/')}">이용약관</a>
            <a href="${sitePath('contact/')}">문의</a>
            <a href="https://github.com/DUBEEUBBEE/moyeoplay" rel="noopener noreferrer">GitHub</a>
          </nav>
        </footer>
      </div>
      <div class="visually-hidden" id="app-announcer" role="status" aria-live="polite" aria-atomic="true"></div>
    `;
  }

  #renderCards(): void {
    const fragment = document.createDocumentFragment();
    GAME_DEFINITIONS.forEach((game, index) => fragment.append(createGameCard(game, index)));
    this.#gameGrid.append(fragment);
  }

  #bindEvents(): void {
    const { signal } = this.#abort;
    this.#root.addEventListener(
      'click',
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-action], [data-game-id]')
            : null;
        if (!target) return;
        const id = target.dataset.gameId;
        if (id) {
          const game = getGameDefinition(id);
          if (game) navigateToGame(game.id);
          return;
        }
        const action = target.dataset.action;
        if (action === 'skip') {
          event.preventDefault();
          queryRequired<HTMLElement>(this.#root, '#main-content').focus();
        } else if (action === 'scroll-games') {
          if (this.#lobby.hidden) {
            this.#scrollToGamesOnLobby = true;
            navigateToLobby();
          } else {
            this.#scrollToGames();
          }
        } else if (action === 'lobby') navigateToLobby();
        else if (action === 'random') this.#openRandomGame();
        else if (action === 'share') void this.#shareCurrentPage();
        else if (action === 'settings') this.#openSettings(target);
        else if (action === 'rules') this.#openRules(target);
        else if (action === 'reset') this.#resetGame();
        else if (action === 'fullscreen') void this.#toggleFullscreen();
        else if (action === 'retry-game') this.#retryFailedGame();
        else if (action === 'clear-session') this.#session.clear();
      },
      { signal },
    );
    this.#startButton.addEventListener('click', () => void this.#toggleGame(), { signal });
    this.#soundButton.addEventListener('click', () => void this.#toggleSound(), { signal });
    window.addEventListener('hashchange', () => void this.#route(), { signal });
    document.addEventListener('visibilitychange', () => this.#handleVisibility(), { signal });
    document.addEventListener('fullscreenchange', () => this.#updateFullscreenLabel(), { signal });
    window.addEventListener('resize', this.#syncViewportHeight, { signal });
    window.visualViewport?.addEventListener('resize', this.#syncViewportHeight, { signal });
    window.visualViewport?.addEventListener('scroll', this.#syncViewportHeight, { signal });
  }

  async #route(): Promise<void> {
    const focusView = this.#hasRouted;
    this.#hasRouted = true;
    const route = parseHash(location.hash);
    if (!route) {
      this.#toast.show('존재하지 않는 주소라 로비로 돌아왔습니다.');
      navigateToLobby(true);
      return;
    }
    if (route.kind === 'lobby') {
      this.#showLobby(focusView);
      return;
    }
    await this.#showGame(route.gameId, focusView);
  }

  #showLobby(focusView: boolean): void {
    this.#loadToken += 1;
    this.#resultModal.close();
    this.#rulesModal.close();
    this.#destroyController();
    this.#stage.hidden = true;
    this.#lobby.hidden = false;
    document.body.dataset.view = 'lobby';
    delete document.body.dataset.oneScreenGame;
    document.title = '모여PLAY — 친구들이 모이면 바로 한 판';
    const scrollToGames = this.#scrollToGamesOnLobby;
    if (focusView) {
      queryRequired<HTMLElement>(this.#root, scrollToGames ? '#games-title' : '#hero-title').focus({
        preventScroll: true,
      });
    }
    if (scrollToGames) {
      this.#scrollToGamesOnLobby = false;
      requestAnimationFrame(() => this.#scrollToGames());
    } else {
      window.scrollTo({ top: 0, behavior: this.#isReducedMotion() ? 'instant' : 'smooth' });
    }
  }

  #scrollToGames(): void {
    queryRequired<HTMLElement>(this.#root, '#games').scrollIntoView({
      behavior: this.#isReducedMotion() ? 'instant' : 'smooth',
    });
  }

  async #showGame(gameId: GameId, focusView: boolean, retryLoad = false): Promise<void> {
    const game = getGameDefinition(gameId);
    if (!game) return;
    const token = ++this.#loadToken;
    this.#destroyController();
    this.#retryRequiresReload = false;
    this.#lobby.hidden = true;
    this.#stage.hidden = false;
    document.body.dataset.view = 'game';
    document.body.dataset.oneScreenGame = String(ONE_SCREEN_GAMES.has(gameId));
    this.#stageTitle.textContent = game.title;
    this.#stageEyebrow.textContent = `${game.eyebrow} · ${game.players}`;
    this.#orientationNotice.hidden = !game.landscapePreferred;
    this.#failedGameId = null;
    this.#gameHost.dataset.loading = 'true';
    this.#gameHost.setAttribute('aria-busy', 'true');
    this.#gameHost.textContent = '게임을 준비하고 있습니다…';
    document.title = `${game.title} · 모여PLAY`;

    try {
      const module = retryLoad ? await loadGameForRetry(game.id) : await game.load();
      if (token !== this.#loadToken) return;
      clearElement(this.#gameHost);
      this.#currentGame = game;
      this.#controller = module.createGame({
        audio: this.#audio,
        getPlayerName: (player) =>
          this.#settingsState.playerNames[player - 1] ?? `PLAYER ${String(player)}`,
        isReducedMotion: () => this.#isReducedMotion(),
        announce: (message) => this.#announce(message),
        setPhase: (phase, message) => this.#setPhase(phase, message),
        complete: (result) => this.#completeGame(result),
      });
      this.#controller.mount(this.#gameHost);
      this.#controller.enter();
      this.#setPhase('idle', `${game.title} 준비 완료. 시작 버튼을 누르세요.`);
      this.#gameHost.dataset.loading = 'false';
      this.#gameHost.setAttribute('aria-busy', 'false');
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (focusView) this.#stageTitle.focus({ preventScroll: true });
    } catch (error: unknown) {
      if (token !== this.#loadToken) return;
      console.error(`[모여PLAY] 게임 모듈을 불러오지 못했습니다: ${game.id}`, error);
      this.#destroyController();
      this.#failedGameId = game.id;
      this.#retryRequiresReload = retryLoad;
      this.#currentGame = game;
      this.#gameHost.dataset.loading = 'false';
      this.#gameHost.setAttribute('aria-busy', 'false');
      const panel = document.createElement('section');
      panel.className = 'game-load-error';
      panel.setAttribute('role', 'alert');
      const title = document.createElement('h2');
      title.textContent = `${game.title}를 불러오지 못했습니다`;
      const detail = document.createElement('p');
      detail.textContent = retryLoad
        ? '재시도도 완료되지 않았습니다. 현재 게임 주소를 유지한 채 페이지를 새로고침하거나 로비로 돌아가 주세요.'
        : '일시적인 오류일 수 있습니다. 다시 시도하거나 로비로 돌아가 주세요.';
      const actions = document.createElement('div');
      actions.className = 'game-load-error__actions';
      const retry = this.#makeModalButton(retryLoad ? '페이지 새로고침' : '다시 시도', true);
      retry.dataset.action = 'retry-game';
      const lobby = this.#makeModalButton('로비로 돌아가기');
      lobby.dataset.action = 'lobby';
      actions.append(retry, lobby);
      panel.append(title, detail, actions);
      this.#gameHost.replaceChildren(panel);
      this.#setPhase(
        'idle',
        retryLoad
          ? `${game.title} 재시도에 실패했습니다. 페이지를 새로고침할 수 있습니다.`
          : `${game.title}를 불러오지 못했습니다. 다시 시도할 수 있습니다.`,
      );
      retry.focus();
    }
  }

  #destroyController(): void {
    this.#clearAnnouncement();
    const controller = this.#controller;
    this.#controller = null;
    this.#currentGame = null;
    this.#failedGameId = null;
    this.#retryRequiresReload = false;
    this.#phase = 'idle';
    try {
      controller?.destroy();
    } catch (error: unknown) {
      console.error('[모여PLAY] 게임 자원을 정리하지 못했습니다.', error);
    }
    clearElement(this.#gameHost);
  }

  async #toggleGame(): Promise<void> {
    if (!this.#controller) return;
    await this.#audio.unlock().catch(() => undefined);
    if (this.#phase === 'playing' || this.#phase === 'countdown') {
      const previous = this.#phase;
      this.#controller.pause();
      if (this.#phase === previous) this.#setPhase('paused', '게임이 일시정지되었습니다.');
    } else if (this.#phase === 'paused') {
      this.#controller.resume();
    } else {
      this.#controller.start();
    }
  }

  #resetGame(): void {
    if (!this.#controller) return;
    this.#resultModal.close();
    const didReset = this.#controller.reset();
    if (didReset) {
      this.#setPhase('idle', '게임을 처음 상태로 다시 준비했습니다.');
    }
  }

  #setPhase(phase: GamePhase, message?: string): void {
    this.#phase = phase;
    setText(this.#phaseLabel, PHASE_LABELS[phase]);
    if (phase === 'playing' || phase === 'countdown') this.#startButton.textContent = '일시정지';
    else if (phase === 'paused') this.#startButton.textContent = '계속하기';
    else if (phase === 'roundOver') this.#startButton.textContent = '다음 라운드';
    else if (phase === 'matchOver') this.#startButton.textContent = '다시 하기';
    else this.#startButton.textContent = '시작';
    this.#startButton.setAttribute(
      'aria-label',
      `${this.#currentGame?.title ?? '게임'} ${this.#startButton.textContent}`,
    );
    if (message) this.#announce(message);
  }

  #completeGame(result: GameResult): void {
    const game = this.#currentGame;
    if (!game) return;
    this.#session.record(game.id, result, TWO_PLAYER_GAMES.has(game.id));
    this.#setPhase('matchOver', `${result.headline}. ${result.detail}`);
    this.#audio.win();
    clearElement(this.#resultModal.body);
    const badge = document.createElement('p');
    badge.className = 'result-badge';
    badge.textContent = !TWO_PLAYER_GAMES.has(game.id)
      ? 'RESULT'
      : result.winner === 0
        ? 'DRAW'
        : 'WINNER';
    const title = document.createElement('h3');
    title.textContent = result.headline;
    const detail = document.createElement('p');
    detail.className = 'result-detail';
    detail.textContent = result.detail;
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const replay = this.#makeModalButton('다시 하기', true);
    const lobby = this.#makeModalButton('로비로 이동');
    const random = this.#makeModalButton('랜덤 다음 게임');
    replay.addEventListener('click', () => {
      this.#resultModal.close();
      this.#controller?.reset();
      this.#controller?.start();
    });
    lobby.addEventListener('click', () => {
      this.#resultModal.close();
      navigateToLobby();
    });
    random.addEventListener('click', () => {
      this.#resultModal.close();
      this.#openRandomGame(game.id);
    });
    actions.append(replay, lobby, random);
    this.#resultModal.body.append(badge, title, detail, actions);
    this.#resultModal.open(this.#startButton);
  }

  #makeModalButton(label: string, primary = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'primary-button' : 'secondary-button';
    button.textContent = label;
    return button;
  }

  #openRandomGame(exclude?: GameId): void {
    const pool = GAME_DEFINITIONS.filter((game) => game.id !== exclude);
    const game = pool[secureRandomIndex(pool.length)];
    if (game) navigateToGame(game.id);
  }

  #retryFailedGame(): void {
    const gameId = this.#failedGameId;
    if (!gameId) return;
    if (this.#retryRequiresReload) {
      window.location.reload();
      return;
    }
    void this.#showGame(gameId, true, true);
  }

  async #shareCurrentPage(): Promise<void> {
    const route = parseHash(location.hash);
    const game = route?.kind === 'game' ? getGameDefinition(route.gameId) : undefined;
    const shareData = game
      ? {
          title: `${game.title} 게임 가이드 · 모여PLAY`,
          text: `${game.description} 규칙과 조작법을 확인하고 바로 플레이하세요.`,
          url: cleanAbsoluteSiteUrl(`games/${game.guideSlug}/`),
        }
      : {
          title: '모여PLAY — 친구들이 모이면 바로 한 판',
          text: '로그인과 설치 없이 한 기기에서 즐기는 로컬 파티 아케이드',
          url: cleanAbsoluteSiteUrl(),
        };
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
        this.#toast.show('공유 메뉴를 열었습니다.');
        return;
      }
      const clipboard = Reflect.get(navigator, 'clipboard') as
        Pick<Clipboard, 'writeText'> | undefined;
      if (clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(shareData.url);
      } else if (!this.#copyTextFallback(shareData.url)) {
        throw new Error('Clipboard API is unavailable');
      }
      this.#toast.show('현재 페이지 링크를 복사했습니다.');
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.#toast.show('링크를 공유하지 못했습니다. 주소창의 URL을 복사해 주세요.');
    }
  }

  #copyTextFallback(value: string): boolean {
    const legacyDocument = document as unknown as {
      execCommand?: (command: string) => boolean;
    };
    if (typeof legacyDocument.execCommand !== 'function') return false;
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.className = 'visually-hidden';
    document.body.append(input);
    input.select();
    try {
      return legacyDocument.execCommand('copy');
    } catch {
      return false;
    } finally {
      input.remove();
    }
  }

  #openRules(trigger: HTMLElement): void {
    const game = this.#currentGame;
    if (!game) return;
    this.#pauseForModal();
    clearElement(this.#rulesModal.body);
    const intro = document.createElement('p');
    intro.className = 'modal-intro';
    intro.textContent = game.description;
    const list = document.createElement('ol');
    for (const rule of game.rules) {
      const item = document.createElement('li');
      item.textContent = rule;
      list.append(item);
    }
    const controls = document.createElement('p');
    controls.className = 'key-guide';
    controls.textContent = `조작: ${game.controls}`;
    this.#rulesModal.body.append(intro, list, controls);
    if (game.id === 'ladder' || game.id === 'roulette') {
      const fairnessLink = document.createElement('a');
      fairnessLink.className = 'modal-resource-link';
      fairnessLink.href = sitePath('fairness/');
      fairnessLink.textContent = '공정성 설계 자세히 보기 →';
      fairnessLink.setAttribute('aria-label', `${game.title} 공정성 설계 자세히 보기`);
      this.#rulesModal.body.append(fairnessLink);
    }
    this.#rulesModal.open(trigger);
  }

  #buildSettingsModal(): void {
    this.#settingsModal.body.innerHTML = `
      <form class="settings-form" id="settings-form">
        <fieldset><legend>플레이어 이름</legend>
          <label><span><i class="player-dot player-dot--one"></i> 플레이어 1</span><input name="player1" maxlength="24" autocomplete="off" /></label>
          <label><span><i class="player-dot player-dot--two"></i> 플레이어 2</span><input name="player2" maxlength="24" autocomplete="off" /></label>
        </fieldset>
        <fieldset><legend>소리와 움직임</legend>
          <label class="switch-row"><span><strong>효과음</strong><small>자동 재생 없이 조작 후에만 재생됩니다.</small></span><input name="sound" type="checkbox" /></label>
          <label><span>효과음 크기</span><input name="volume" type="range" min="0" max="1" step="0.05" /></label>
          <label><span>모션 효과</span><select name="motion"><option value="system">기기 설정 따르기</option><option value="reduced">효과 줄이기</option><option value="full">전체 효과</option></select></label>
        </fieldset>
        <p class="storage-note">게임 설정은 운영 서버로 업로드하지 않고 현재 브라우저에 저장합니다. 광고 기능 활성화 시 <a class="inline-policy-link" href="${sitePath('privacy/')}">별도 개인정보 안내</a>를 확인하세요.</p>
        <div class="modal-actions"><button class="primary-button" type="submit">설정 저장</button><button class="secondary-button" type="button" data-settings-reset>기본값 복원</button></div>
      </form>
    `;
    const form = queryRequired<HTMLFormElement>(this.#settingsModal.body, '#settings-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const motion = data.get('motion');
      const player1 = data.get('player1');
      const player2 = data.get('player2');
      const volume = data.get('volume');
      this.#settings.update({
        playerNames: [
          typeof player1 === 'string' ? player1 : '',
          typeof player2 === 'string' ? player2 : '',
        ],
        soundEnabled: data.get('sound') === 'on',
        volume: typeof volume === 'string' ? Number(volume) : 0.65,
        motion: motion === 'reduced' || motion === 'full' ? motion : 'system',
      });
      this.#settingsModal.close();
      this.#toast.show('플레이 설정을 저장했습니다.');
    });
    queryRequired<HTMLButtonElement>(form, '[data-settings-reset]').addEventListener(
      'click',
      () => {
        this.#settings.reset();
        this.#syncSettingsForm();
      },
    );
  }

  #openSettings(trigger: HTMLElement): void {
    this.#pauseForModal();
    this.#syncSettingsForm();
    this.#settingsModal.open(trigger);
  }

  #pauseForModal(): void {
    if (!this.#controller || (this.#phase !== 'playing' && this.#phase !== 'countdown')) return;
    const previous = this.#phase;
    this.#controller.pause();
    if (this.#phase === previous)
      this.#setPhase('paused', '대화상자를 열어 게임을 일시정지했습니다.');
    this.#toast.show('게임을 일시정지했습니다. 닫은 뒤 계속하기를 눌러 주세요.');
  }

  #syncSettingsForm(): void {
    const form = queryRequired<HTMLFormElement>(this.#settingsModal.body, '#settings-form');
    queryRequired<HTMLInputElement>(form, '[name="player1"]').value =
      this.#settingsState.playerNames[0];
    queryRequired<HTMLInputElement>(form, '[name="player2"]').value =
      this.#settingsState.playerNames[1];
    queryRequired<HTMLInputElement>(form, '[name="sound"]').checked =
      this.#settingsState.soundEnabled;
    queryRequired<HTMLInputElement>(form, '[name="volume"]').value = String(
      this.#settingsState.volume,
    );
    queryRequired<HTMLSelectElement>(form, '[name="motion"]').value = this.#settingsState.motion;
  }

  #applySettings(state: SettingsState): void {
    this.#settingsState = state;
    this.#audio.configure(state.soundEnabled, state.volume);
    this.#root.dataset.motion = state.motion;
    for (const label of this.#root.querySelectorAll<HTMLElement>('[data-player-name]')) {
      const player = label.dataset.playerName === '2' ? 2 : 1;
      label.textContent = state.playerNames[player - 1] ?? `PLAYER ${String(player)}`;
    }
    this.#soundButton.dataset.muted = String(!state.soundEnabled);
    this.#soundButton.setAttribute(
      'aria-label',
      state.soundEnabled ? '사운드 끄기' : '사운드 켜기',
    );
    this.#renderSession(this.#session.value);
  }

  #renderSession(state: SessionState): void {
    setText(this.#scoreP1, state.versusWins[0]);
    setText(this.#scoreP2, state.versusWins[1]);
    clearElement(this.#recentList);
    if (state.recent.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = '아직 기록이 없습니다. 첫 승부를 시작해 보세요.';
      this.#recentList.append(empty);
      return;
    }
    for (const match of state.recent.slice(0, 4)) {
      const game = getGameDefinition(match.gameId);
      if (!game) continue;
      const item = document.createElement('li');
      const copy = document.createElement('div');
      copy.className = 'recent-play__copy';
      const title = document.createElement('strong');
      title.textContent = game.shortTitle;
      const result = document.createElement('span');
      const isVersus = TWO_PLAYER_GAMES.has(match.gameId);
      const winnerName =
        !isVersus || match.winner === 0
          ? null
          : (this.#settingsState.playerNames[match.winner - 1] ?? `PLAYER ${String(match.winner)}`);
      result.textContent = winnerName ? `${winnerName} 승리` : isVersus ? '무승부' : '결과 완료';
      const score = document.createElement('small');
      score.textContent = match.score
        ? `${String(match.score[0])} : ${String(match.score[1])}`
        : '완료';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'recent-play__open';
      openButton.dataset.gameId = game.id;
      openButton.textContent = '열기';
      openButton.setAttribute('aria-label', `${game.title} 다시 열기`);
      copy.append(title, result);
      item.append(copy, score, openButton);
      this.#recentList.append(item);
    }
  }

  async #toggleSound(): Promise<void> {
    const enabled = !this.#settingsState.soundEnabled;
    this.#settings.update({ soundEnabled: enabled });
    if (enabled) await this.#audio.unlock().catch(() => undefined);
    this.#toast.show(enabled ? '효과음을 켰습니다.' : '효과음을 껐습니다.');
  }

  #handleVisibility(): void {
    if (document.hidden && (this.#phase === 'playing' || this.#phase === 'countdown')) {
      const previous = this.#phase;
      this.#controller?.pause();
      if (this.#phase === previous) {
        this.#setPhase(
          'paused',
          '탭이 숨겨져 게임을 자동으로 일시정지했습니다. 계속하기를 눌러 재개하세요.',
        );
      }
      if (this.#phaseIs('paused')) {
        this.#wasAutoPaused = true;
        this.#toast.show('게임을 자동으로 일시정지했습니다.');
      }
    } else if (!document.hidden && this.#wasAutoPaused) {
      this.#wasAutoPaused = false;
      this.#startButton.focus();
    }
  }

  async #toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.#stage.requestFullscreen();
    } catch {
      this.#toast.show('이 브라우저에서는 전체 화면을 시작할 수 없습니다.');
    }
  }

  #updateFullscreenLabel(): void {
    this.#fullscreenButton.setAttribute(
      'aria-label',
      document.fullscreenElement ? '전체 화면 종료' : '전체 화면',
    );
  }

  #announce(message: string): void {
    this.#clearAnnouncement();
    this.#announceTimer = window.setTimeout(() => {
      this.#liveRegion.textContent = message;
      this.#announceTimer = null;
    }, 20);
  }

  #clearAnnouncement(): void {
    if (this.#announceTimer !== null) window.clearTimeout(this.#announceTimer);
    this.#announceTimer = null;
    this.#liveRegion.textContent = '';
  }

  readonly #syncViewportHeight = (): void => {
    const viewport = window.visualViewport;
    const values = {
      '--app-viewport-height': viewport?.height ?? window.innerHeight,
      '--app-viewport-width': viewport?.width ?? window.innerWidth,
      '--app-viewport-offset-top': viewport?.offsetTop ?? 0,
      '--app-viewport-offset-left': viewport?.offsetLeft ?? 0,
    } as const;
    for (const [property, value] of Object.entries(values)) {
      document.documentElement.style.setProperty(property, `${String(value)}px`);
    }
    document.documentElement.dataset.visualViewportFallback = String(
      Boolean(viewport && (viewport.scale > 1.05 || viewport.height < 240 || viewport.width < 320)),
    );
  };

  #isReducedMotion(): boolean {
    return (
      this.#settingsState.motion === 'reduced' ||
      (this.#settingsState.motion === 'system' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches)
    );
  }

  #phaseIs(phase: GamePhase): boolean {
    return this.#phase === phase;
  }
}
