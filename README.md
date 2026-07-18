# 모여PLAY

로그인과 설치 없이 친구들이 한 기기에서 바로 즐기는 한국형 로컬 멀티플레이 파티 아케이드입니다. 데스크톱 키보드와 모바일 멀티터치를 지원하며 플레이어 이름, 사운드·모션 설정, 최근 전적만 현재 브라우저에 저장합니다.

## 공개 URL

- 공개 사이트: [https://dubeeubbee.github.io/moyeoplay/](https://dubeeubbee.github.io/moyeoplay/)
- 소스 저장소: [https://github.com/DUBEEUBBEE/moyeoplay](https://github.com/DUBEEUBBEE/moyeoplay)

## 게임과 조작

| 게임               | 인원 | 키보드                 | 모바일               | 기본 규칙                        |
| ------------------ | ---: | ---------------------- | -------------------- | -------------------------------- |
| 오목               |    2 | 보드 클릭              | 보드 터치            | 15×15, 3판 2선승, 프리스타일 5목 |
| 네온 탁구          |    2 | P1 `W/S`, P2 `↑/↓`     | 좌우 독립 상·하 버튼 | 7점 선취                         |
| 통통 배구          |    2 | P1 `A/D/W`, P2 `←/→/↑` | 좌우 독립 이동·점프  | 7점 선취                         |
| 핀볼 늦게 떨어지기 |    2 | P1 `A`, P2 `L`         | 좌우 부스터          | 3판 2선승, 부스터 3회            |
| 사다리 타기        |  2–8 | 버튼·입력              | 버튼·입력            | 중복 없는 1:1 결과               |
| 반응속도 대결      |    2 | P1 `F`, P2 `J`         | 화면 양쪽            | 5판 3선승, 부정 출발             |
| 탭 배틀            |    2 | P1 `F`, P2 `J`         | 화면 양쪽 멀티터치   | 5/10/15초 연타                   |
| 벌칙 룰렛          | 2–12 | 버튼·입력              | 버튼·입력            | 모든 항목 동일 확률              |

게임 안에서는 공통 HUD로 규칙, 시작/일시정지, 다시 시작, 설정, 지원 브라우저의 전체 화면을 사용할 수 있습니다. 액션 게임은 세로 화면에서도 실행되며, 작은 세로 화면에서는 가로 모드 권장 안내만 표시합니다.

## 로컬 실행

Node.js 20 이상과 npm이 필요합니다. CI는 Node.js 24 LTS를 사용합니다.

```bash
npm ci
npm run dev
```

Vite가 출력한 로컬 주소를 열면 됩니다. 빌드 결과를 확인하려면 다음을 실행합니다.

```bash
npm run build
npm run preview
```

## 품질 검사

```bash
npm run typecheck       # strict TypeScript
npm run lint            # ESLint
npm run format:check    # Prettier 검사
npm run test            # Vitest 단위 테스트
npm run test:coverage   # V8 커버리지
npm run test:e2e        # Playwright + axe
npm run check           # typecheck + lint + unit + production build
```

처음 E2E를 실행하는 컴퓨터에서는 브라우저를 한 번 설치합니다.

```bash
npx playwright install chromium webkit
```

## 구조

```text
src/app/          라우터, 앱 셸, 설정·세션 저장소
src/components/   모달, 토스트, 게임 카드
src/core/         게임 계약, 고정 스텝 루프, 입력, 오디오, Canvas, RNG, 저장소
src/games/        8개 독립 게임과 순수 로직 테스트
src/styles/       토큰, 기본, 컴포넌트, 게임, 반응형 CSS
tests/e2e/        Playwright 사용자 흐름과 axe 검사
public/           자체 제작 SVG, manifest
docs/             구현 계획, 아키텍처, 상세 게임 규칙
```

각 게임은 진입할 때 동적으로 import되며 `mount → enter → start/pause/resume/reset → destroy` 생명주기를 따릅니다. 자세한 내용은 [아키텍처 문서](docs/ARCHITECTURE.md)를 참고하세요.

## 배포

`.github/workflows/pages.yml`은 다음 흐름을 사용합니다.

1. 모든 pull request에서 `npm ci`, 타입 검사, 린트, 단위 테스트, 프로덕션 빌드, Playwright E2E를 실행합니다.
2. `main` push에서는 같은 검사가 통과한 뒤 `dist`를 공식 Pages artifact로 업로드합니다.
3. 별도 deploy job이 `pages: write`, `id-token: write`만 받아 `github-pages` environment로 배포합니다.
4. Pages가 제공하는 `base_path`와 `base_url`을 Vite에 전달해 프로젝트 하위 경로, canonical, Open Graph URL, robots, sitemap을 실제 URL로 생성합니다.

저장소의 **Settings → Pages → Build and deployment → Source**는 **GitHub Actions**로 설정되어 있습니다. `main`에 반영하면 품질 검사를 통과한 `dist`가 위 공개 URL로 배포됩니다.

## 브라우저 지원

최근 두 버전의 Chrome, Edge, Firefox, Safari와 iOS Safari, Android Chrome을 대상으로 합니다. Fullscreen, Vibration, Web Audio 같은 API는 기능 감지 후 선택적으로 사용하며 핵심 게임은 해당 API 없이도 동작합니다.

## 데이터와 외부 자산

- 사용자 입력은 HTML로 해석하지 않고 DOM `textContent`/form value로만 다룹니다.
- 서버, 로그인, 분석 SDK, 광고, 런타임 CDN이 없습니다.
- 그래픽은 Canvas, CSS, 저장소에 포함된 자체 SVG로 구성됩니다.
- 저장 데이터가 손상되거나 `localStorage`가 차단되어도 메모리 기본값으로 실행합니다.
