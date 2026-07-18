# 모여PLAY 아키텍처

## 경계

모여PLAY는 서버가 없는 Vite 정적 MPA다. `site/site-content.mjs`의 한국어 콘텐츠에서 루트, 8개 게임 가이드, 6개 신뢰 페이지를 build time에 만들고, 실제 게임 앱만 `/play/`에서 실행한다. 앱 셸은 라우팅·설정·세션·공통 HUD만 소유하고 게임 코드는 `src/games/<id>`의 동적 chunk로 분리한다.

```text
site-content ── generate-site ── 15개 indexable HTML + sitemap
                                  └─ /play/index.html
                                            ↓ hash route
                                         AppShell ─── SettingsStore / SessionStore
   │                 │
   │                 └─ versioned SafeStorage → localStorage or memory fallback
   ├─ common HUD / Modal / Toast / aria-live
   └─ one active MiniGameController
            ├─ pure logic
            ├─ FixedStepLoop / timers
            ├─ InputManager
            ├─ CanvasSurface
            └─ AudioManager through GameServices
```

## 라우팅과 코드 분할

- 문서 주소는 `/`, `/games/<slug>/`, 6개 trust URL이며 fragment를 검색 대상 주소로 쓰지 않는다.
- 플레이 로비는 `/play/#lobby`, 게임은 `/play/#game/<id>`다.
- 옛 루트 `/#lobby`, `/#game/<id>`는 허용된 8개 id만 inline `location.replace`로 같은 `/play/` 상태에 연결한다.
- `hashchange` 하나가 뒤로/앞으로 이동과 직접 URL 진입을 처리한다.
- 등록되지 않은 ID나 옛 `#omok` 형태는 로비로 교정한다.
- `GameDefinition.load()`가 게임별 `import()`를 수행한다. 새 로딩이 시작되면 token을 올려 늦게 끝난 이전 import가 다시 mount되지 않게 한다.
- chunk 로딩이 실패하면 게임 영역 안의 `alert`에서 재시도하거나 로비로 돌아갈 수 있다. 재시도는 Vite glob이 만든 query 별도 module URL을 사용해 브라우저의 실패 module cache를 재사용하지 않고, 같은 controller 정리·mount 경계를 거친다.

## 자원 소유권

동시에 살아 있는 controller는 최대 하나다. 라우트 이탈 시 앱 셸이 먼저 `destroy()`를 부르고 host DOM을 비운다. controller는 자신의 AbortController, RAF/FixedStepLoop, timeout을 종료한다. `visibilitychange`에서 진행 중 게임은 자동 pause되며 탭 복귀만으로 자동 resume하지 않는다.

## 게임 상태

공통 phase는 다음 값만 사용한다.

```text
idle → countdown → playing ↔ paused → roundOver → matchOver
```

게임은 `GameServices.setPhase`로 앱 셸에 전이를 알린다. 앱 셸은 공통 시작 버튼 문구, phase pill, `aria-live`를 갱신한다. 최종 결과는 `complete()` 한 번으로 전달하며 앱 셸이 세션 기록과 결과 modal을 책임진다.

## 물리와 Canvas

- 표시 CSS 크기와 논리 좌표를 분리한다.
- DPR은 2로 제한해 모바일 메모리 사용을 제어한다.
- pointer 좌표는 bounding rect에서 논리 좌표로 변환한다.
- 액션 게임은 120Hz 고정 스텝과 최대 delta/서브스텝 제한을 사용한다.
- 비활성 controller는 render하지 않는다.
- 판정과 시뮬레이션 불변식은 Canvas draw 코드에서 분리해 Vitest로 검증한다.

탁구는 한 fixed step 안에서 벽·패들·득점선의 time of impact를 순서대로 처리하고 남은 substep을 보존한다. 배구는 네트·선수 연속 충돌을 제한된 반복 패스로 분리한다. 두 경우 모두 비정상 대기 시간을 막는 iteration guard와 penetration recovery를 둔다.

## 입력과 작은 가로 화면

- 포인터 입력은 `pointerId`별로 독립 추적해 두 플레이어가 동시에 hold·jump·tap할 수 있다.
- `pointerup`, `pointercancel`, `lostpointercapture`, blur, visibility 변경, reset, destroy에서 held pointer를 정리한다.
- 높이 500px 이하 가로 화면은 `visualViewport` 높이와 safe-area를 반영해 HUD·점수·경기 영역·조작을 한 화면에 압축한다. 일반 배치는 유지하며 작은 화면·확대 환경은 스크롤을 fallback으로 남겨 둔다.

## 저장 스키마

`moyeoplay:settings` version 2:

- 24자 이하 플레이어 이름 2개
- 사운드 활성화와 0–1 볼륨
- system/reduced/full 모션 설정

`moyeoplay:session` version 1:

- 2인 게임의 P1/P2 누적 승수
- 최대 8개의 game id, winner, 선택적 numeric score, timestamp

그룹 게임의 입력 원문과 룰렛 항목은 최근 기록에 저장하지 않는다. JSON 파싱, schema migration, write가 실패하면 앱은 기본 메모리 상태로 계속 실행한다.

## 오디오와 접근성

Web Audio context는 사용자 조작 이후에만 만들어진다. 모든 게임은 hit, score, countdown, win 의미를 공유하지만 API가 없거나 음소거여도 로직은 바뀌지 않는다. Canvas의 차례·점수·승패는 인접 DOM HUD와 공통 `aria-live`로 중복 제공한다. modal은 focus trap, Escape, backdrop close, trigger focus 복귀를 제공한다.

## 콘텐츠와 광고 경계

- `/play/`는 `noindex,follow`이며 광고 slot과 광고 tag가 없다.
- AdSense는 기본 off다. 실제 형식의 client/publisher/slot, custom root domain, 명시적 활성화가 없으면 광고 DOM도 생성하지 않는다.
- 활성화 profile도 루트와 게임 가이드에만 수동 slot을 만들고 consent gate 이벤트 전에는 외부 Google script를 요청하지 않는다. 이 hook은 CMP 자체가 아니므로 운영 전 Google 인증 CMP 연결이 별도로 필요하다.
- project Pages는 host root를 소유하지 않으므로 project-path `robots.txt`와 `ads.txt`를 만들지 않는다. base `/` profile만 root `robots.txt`를 만들며 publisher ID가 있을 때만 `ads.txt`를 만든다. `CNAME`은 custom domain에서만 생성한다.

## 이미지 파이프라인

`design/game-icons/source/<id>.png`의 1254×1254 RGBA master를 Sharp가 320×320 AVIF·WebP·PNG와 1200×630 OG로 만든다. 카드 `<picture>`는 고정 크기를 예약하고 이미지 로드 성공 전까지 기존 glyph를 fallback으로 유지한다. 게임 가이드의 1280×720 WebP는 Playwright가 고정 viewport·난수·모션 설정으로 실제 `/play/` 런타임을 캡처한다.

## Pages 빌드

기본 build는 현재 project Pages profile인 `PAGES_BASE_PATH=/moyeoplay/`, `SITE_URL=https://dubeeubbee.github.io/moyeoplay/`를 사용한다. 로컬 `npm run dev`는 root `/` profile을 명시한다. workflow는 repository 이름 또는 `CUSTOM_DOMAIN`/`SITE_URL` 변수로 base를 계산한다. generator가 canonical, Open Graph·Twitter, JSON-LD와 `sitemap.xml`을 실제 URL로 만들고, Vite의 profile manifest 단계가 PWA `id`·`start_url`·`scope`·icon을 `/moyeoplay/` 또는 `/` 절대 path로 고정한다. 프로덕션 source map은 생성하지 않는다.

CI는 먼저 격리된 root `/` + AdSense mock profile을 검사하고, 실제 배포 profile의 `dist`를 `vite preview`에서 Chromium·WebKit으로 검사한다. `main` 배포 뒤에는 deploy job이 낸 `page_url`을 별도 live smoke job으로 넘겨 정적 자산·메타데이터·Canvas 시작을 한 번 더 검증한다. 품질 job은 읽기 권한만, 배포 job은 `pages: write`와 `id-token: write`만 사용한다.
