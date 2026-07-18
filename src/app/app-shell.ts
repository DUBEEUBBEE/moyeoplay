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
import { GAME_DEFINITIONS, getGameDefinition } from './game-registry';
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

const PHASE_LABELS: Record<GamePhase, string> = {
  idle: '시작 대기',
  countdown: '카운트다운',
  playing: '경기 중',
  paused: '일시정지',
  roundOver: '라운드 종료',
  matchOver: '경기 종료',
};

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
    this.#settings.subscribe((state) => this.#applySettings(state));
    this.#session.subscribe((state) => this.#renderSession(state));
    this.#fullscreenButton.hidden = !document.fullscreenEnabled;

    if (!location.hash)
      history.replaceState(null, '', `${location.pathname}${location.search}#lobby`);
    void this.#route();
  }

  destroy(): void {
    this.#abort.abort();
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
          <p class="privacy-pill"><span aria-hidden="true"></span> 로그인 없음 · 이 기기에만 저장</p>
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
                <h1 id="hero-title" tabindex="-1">친구들이 모이면<br /><em>바로 한 판.</em></h1>
                <p class="hero__description">오목부터 순발력 대결, 공정한 룰렛까지. 가입도 설치도 없이 이 화면을 가운데 두고 바로 시작하세요.</p>
                <div class="hero__actions">
                  <button class="primary-button" type="button" data-action="random">랜덤 게임 선택 <span aria-hidden="true">→</span></button>
                  <button class="secondary-button" type="button" data-action="scroll-games">8개 게임 보기</button>
                </div>
                <ul class="trust-list" aria-label="서비스 특징">
                  <li><strong>2번</strong><span>이내로 게임 시작</span></li>
                  <li><strong>8개</strong><span>완성된 로컬 게임</span></li>
                  <li><strong>0개</strong><span>계정 · 설치 · 서버 전송</span></li>
                </ul>
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
            </div>

            <section class="game-section" id="games" aria-labelledby="games-title">
              <div class="section-heading">
                <div><p class="eyebrow">CHOOSE A GAME</p><h2 id="games-title" tabindex="-1">지금 분위기에 맞는 한 판</h2></div>
                <p>카드를 열고 시작을 누르면 끝. 키보드와 멀티터치를 함께 지원합니다.</p>
              </div>
              <div class="game-grid" id="game-grid"></div>
            </section>

            <section class="promise-panel" aria-label="모여PLAY 데이터 안내">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6V10Zm6 4v2"/></svg>
              <div><strong>친구들과 놀기 위한 정보만, 이 기기에만.</strong><p>플레이어 이름·사운드·모션 설정과 최근 전적만 브라우저 저장소에 남습니다. 서버 전송과 분석 추적은 없습니다.</p></div>
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

        <footer class="site-footer"><strong>모여PLAY</strong><p>로그인 없음 · 설치 없음 · 데이터는 이 기기에만 저장</p><button class="text-button" type="button" data-action="scroll-games">게임 목록</button></footer>
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
        else if (action === 'settings') this.#openSettings(target);
        else if (action === 'rules') this.#openRules(target);
        else if (action === 'reset') this.#resetGame();
        else if (action === 'fullscreen') void this.#toggleFullscreen();
        else if (action === 'clear-session') this.#session.clear();
      },
      { signal },
    );
    this.#startButton.addEventListener('click', () => void this.#toggleGame(), { signal });
    this.#soundButton.addEventListener('click', () => void this.#toggleSound(), { signal });
    window.addEventListener('hashchange', () => void this.#route(), { signal });
    document.addEventListener('visibilitychange', () => this.#handleVisibility(), { signal });
    document.addEventListener('fullscreenchange', () => this.#updateFullscreenLabel(), { signal });
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

  async #showGame(gameId: GameId, focusView: boolean): Promise<void> {
    const game = getGameDefinition(gameId);
    if (!game) return;
    const token = ++this.#loadToken;
    this.#destroyController();
    this.#lobby.hidden = true;
    this.#stage.hidden = false;
    document.body.dataset.view = 'game';
    this.#stageTitle.textContent = game.title;
    this.#stageEyebrow.textContent = `${game.eyebrow} · ${game.players}`;
    this.#orientationNotice.hidden = !game.landscapePreferred;
    this.#gameHost.dataset.loading = 'true';
    this.#gameHost.setAttribute('aria-busy', 'true');
    this.#gameHost.textContent = '게임을 준비하고 있습니다…';
    document.title = `${game.title} · 모여PLAY`;

    try {
      const module = await game.load();
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
    } catch {
      if (token !== this.#loadToken) return;
      this.#toast.show('게임을 불러오지 못했습니다. 로비에서 다시 시도해 주세요.');
      navigateToLobby(true);
    }
  }

  #destroyController(): void {
    this.#controller?.destroy();
    this.#controller = null;
    this.#currentGame = null;
    this.#phase = 'idle';
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
    this.#controller.reset();
    this.#setPhase('idle', '게임을 처음 상태로 다시 준비했습니다.');
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
        <p class="storage-note">설정은 서버로 보내지 않고 현재 브라우저에만 저장합니다.</p>
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
      item.append(title, result, score);
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
    this.#liveRegion.textContent = '';
    window.setTimeout(() => {
      this.#liveRegion.textContent = message;
    }, 20);
  }

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
