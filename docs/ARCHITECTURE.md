# 모여PLAY 아키텍처

## 경계

모여PLAY는 서버가 없는 Vite 정적 사이트다. 앱 셸은 라우팅·설정·세션·공통 HUD만 소유하고 게임 코드는 `src/games/<id>`의 동적 chunk로 분리한다.

```text
hash route
   ↓
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

- 로비는 `#lobby`, 게임은 `#game/<id>`다.
- `hashchange` 하나가 뒤로/앞으로 이동과 직접 URL 진입을 처리한다.
- 등록되지 않은 ID나 옛 `#omok` 형태는 로비로 교정한다.
- `GameDefinition.load()`가 게임별 `import()`를 수행한다. 새 로딩이 시작되면 token을 올려 늦게 끝난 이전 import가 다시 mount되지 않게 한다.

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

## Pages 빌드

로컬과 PR build는 상대 base `./`를 사용한다. Pages build에서는 `configure-pages`가 제공한 `base_path`와 `base_url`을 환경 변수로 전달한다. Vite plugin은 실제 URL이 있을 때만 canonical, `og:url`, `og:image`, `sitemap.xml`, robots Sitemap 항목을 절대 URL로 만든다. 확인되지 않은 URL은 소스에 하드코딩하지 않는다.
