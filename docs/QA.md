# 모여PLAY QA 가이드

## 지원 환경과 기준 화면

자동화는 Chromium 데스크톱과 WebKit 기반 iPhone 환경을 기본으로 실행한다. 수동 확인은 최근 두 버전의 Chrome·Edge·Firefox·Safari, iOS Safari, Android Chrome을 대상으로 한다.

레이아웃 회귀 기준 viewport는 다음과 같다.

- 세로 모바일: `320×568`, `360×640`, `375×667`, `390×844`
- 가로 모바일: `568×320`, `667×375`, `844×390`
- 태블릿·데스크톱: `768×1024`, `1440×900`

가로이며 높이가 500px 이하인 액션 게임에서는 공통 HUD, 실시간 점수, Canvas 또는 경기 영역, P1/P2 핵심 조작이 같은 visual viewport 안에 있어야 한다. 일반 확대나 더 작은 화면에서는 콘텐츠를 자르는 대신 스크롤 가능한 fallback을 허용한다.

## 자동 검사

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build:pages
npm run verify:dist
npm run test:e2e:prod
npm audit --omit=dev
```

`test:e2e:prod`는 `PAGES_BASE_PATH=/moyeoplay/`와 실제 공개 URL metadata로 `dist`를 만든 뒤 `vite preview`를 검사한다. 빠른 개발 서버 확인이 필요할 때만 `npm run test:e2e:dev`를 사용한다.

## 공정성 설계

### 사다리

1. 브라우저의 `crypto.getRandomValues`를 rejection sampling한 인덱스 공급원으로 사용한다.
2. Fisher–Yates로 참가자 수 `n`의 목표 순열을 먼저 고른다. 기본 모드는 제자리 결과도 `n!`개 순열 중 하나로 허용한다.
3. 목표 `start → end` 순열을 최대 `n(n-1)/2`개의 인접 교환으로 바꾸고, 한 행에 하나의 가로줄만 배치한다.
4. `calculateMapping`으로 다시 계산한 결과가 목표 순열과 정확히 같지 않으면 생성을 실패시킨다.
5. 생성 순간 이름·결과·순열·가로줄·라운드 ID를 읽기 전용 round snapshot으로 확정한다. 설정 편집으로 돌아갈 때는 확인 후 snapshot과 공개 상태를 함께 폐기한다.
6. 전체 공개 전에는 전체 결과 복사와 생성 ID 공개를 막고, DOM에는 공개된 참가자의 결과만 렌더한다. Canvas에는 공개한 참가자의 실제 trace만 그리고 다른 가로줄은 숨겨 미공개 mapping을 추론할 수 없게 한다. 전체 완료 후에는 모든 정확한 가로줄과 경로를 그려 화면의 경로와 mapping이 일치하는지 확인한다.

이 구조는 정상 배포 코드 안에서 결과 선택 편향과 공개 후 설정 변경을 막는다. 사용자가 브라우저 코드 자체를 변조하거나 개발자 도구로 런타임을 바꾸는 행위까지 원격 서버가 검증하는 구조는 아니다.

### 룰렛

룰렛도 rejection-sampled 보안 난수로 결과 index를 먼저 선택한다. 선택된 index의 중심이 고정 바늘 아래에 오도록 최종 회전 각도를 계산하고 마지막 프레임에 계획값을 그대로 대입한다. 애니메이션 위치에서 결과를 역산하지 않는다.

## 멀티터치 확인법

- Playwright CDP pointer dispatch 또는 서로 다른 `pointerId`의 `pointerdown`을 양쪽 조작부에 거의 동시에 보낸다.
- 탁구·배구는 두 선수의 `data-pressed`와 실제 이동 상태가 동시에 바뀌는지 확인한다.
- 핀볼은 두 부스터가 정확히 한 번씩 줄고, 같은 pointer stream과 후속 compatibility `click`이 중복 차감되지 않는지 확인한다.
- 반응속도·탭 배틀은 같은 시각에 가까운 양쪽 입력, key repeat, compatibility click을 확인한다.
- `pointerup`, `pointercancel`, `lostpointercapture`, window blur, `visibilitychange`, reset, 게임 전환 뒤 모든 held/active pointer 상태가 해제되어야 한다.
- 실제 iOS·Android에서는 두 손가락으로 양쪽 버튼을 동시에 누른 채 페이지 스크롤·텍스트 선택·브라우저 확대가 생기지 않는지 추가 확인한다.

## 게임별 수동 체크리스트

### 공통

- 로비→게임→로비를 키보드만으로 이동하고 새 화면 제목에 포커스가 오는지 확인한다.
- 규칙·설정 dialog에서 Tab/Shift+Tab 순환, Escape 닫기, trigger 포커스 복귀를 확인한다.
- 시작·일시정지·재개·reset·결과 dialog 후 phase 문구와 버튼 이름이 일치하는지 확인한다.
- 탭을 숨겼다가 돌아와도 자동으로 재개되지 않는지 확인한다.
- 게임을 20회 이상 전환해 이전 DOM, 입력, RAF, timer가 남지 않는지 확인한다.

### 오목

- 데스크톱 클릭은 즉시 착수하고 coarse pointer는 첫 탭에서 좌표만 선택하는지 확인한다.
- 44px 이상의 확정 버튼으로 한 번만 착수하고 선택 변경·취소가 가능한지 확인한다.
- 좌표 select·방향키·확정 키만으로 착수할 수 있는지 확인한다.
- 무르기 확인을 취소/승인했을 때 보드와 마지막 수가 정확한지 확인한다.
- 가로·세로·두 대각선, 가장자리, 5개 이상, 무승부를 확인한다.

### 탁구·배구·핀볼

- 세 가로폰 viewport에서 Canvas, 점수, 양쪽 컨트롤이 동시에 보이는지 확인한다.
- 탁구 고속 중앙·끝·모서리 충돌, 배구 네트/플레이어 겹침·최대 delta 바닥 통과를 확인한다.
- 두 선수가 동시에 hold/점프/부스터를 사용할 수 있는지 확인한다.

### 사다리·반응속도·탭 배틀·룰렛

- 사다리 2인 identity/swap과 8인 경계, 부분 공개 후 설정 잠금·복사 비활성화를 확인한다.
- 반응속도는 `3점 선취`, 부정 출발, 8ms 동점 경계, 혼합 키/화면 입력을 확인한다.
- 탭 배틀은 실제 유효 pointerdown 수와 최종 count가 같고 고속 입력 중 오디오가 로직을 막지 않는지 확인한다.
- 룰렛은 12개 긴 한글·이모지·공백 항목, 바늘과 결과 index, Clipboard fallback을 확인한다.

## 접근성

- 로비, 설정·규칙 dialog, 8개 게임 idle, 가능한 playing/paused/matchOver와 결과 dialog에서 Axe `critical`/`serious` 0개를 요구한다.
- Canvas만으로 전달되는 상태가 없어야 하며 점수·차례·마지막 수·승패를 DOM과 필요한 live region으로 제공한다.
- 색만으로 P1/P2와 상태를 구분하지 않는다.
- 200% 확대에서 중요한 텍스트가 겹치거나 가로 overflow가 생기지 않는지 수동으로 확인한다.

## GitHub Pages production smoke

1. `npm run build:pages` 후 `npm run test:e2e:prod:run`을 실행한다.
2. `/moyeoplay/`가 200인지, 8개 카드와 모든 direct hash route가 열리는지 확인한다.
3. HTML에 `/src/main.ts`가 없고 JS/CSS가 도메인 루트 `/assets/`가 아니라 `/moyeoplay/assets/`에서 로드되는지 확인한다.
4. favicon, manifest, apple icon, 192/512/maskable icon, raster OG image가 모두 200인지 확인한다.
5. canonical, `og:url`, `og:image`, Twitter image가 실제 HTTPS Pages URL인지 확인한다.
6. main 배포 뒤 workflow의 live smoke job이 배포 URL에서 8개 카드, landscape 모바일, Canvas 게임 시작, console/page error 0개를 다시 검사한다.

이미 배포된 주소만 다시 검사할 때는 `E2E_LIVE_URL=https://dubeeubbee.github.io/moyeoplay/ npm run test:e2e:live`를 실행한다.

실제 배포 권한이나 외부 브라우저가 없는 환경에서는 해당 항목을 성공으로 기록하지 않고 `미검증`으로 남긴다.
