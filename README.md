# 모여PLAY

로그인과 설치 없이 친구들이 한 기기에서 바로 즐기는 한국형 로컬 멀티플레이 파티 아케이드입니다. 정적 콘텐츠 허브와 8개 게임 가이드는 JavaScript 없이 읽을 수 있고, 실제 게임은 광고 없는 `/play/` 앱에서 실행됩니다.

## 공개 URL

- 공개 사이트: [https://moyeoplay.studio/](https://moyeoplay.studio/)
- 플레이 앱: [https://moyeoplay.studio/play/](https://moyeoplay.studio/play/)
- 게임 가이드: `/games/omok/`, `/games/pong/`, `/games/volleyball/`, `/games/pinball-drop/`, `/games/ladder/`, `/games/reaction-duel/`, `/games/tap-battle/`, `/games/roulette/`
- 안내 페이지: `/about/`, `/how-to-play/`, `/fairness/`, `/privacy/`, `/terms/`, `/contact/`
- sitemap: [https://moyeoplay.studio/sitemap.xml](https://moyeoplay.studio/sitemap.xml)
- 소스 저장소: [https://github.com/DUBEEUBBEE/moyeoplay](https://github.com/DUBEEUBBEE/moyeoplay)

운영 빌드의 단일 기준은 `CUSTOM_DOMAIN=moyeoplay.studio`, `SITE_URL=https://moyeoplay.studio/`, `PAGES_BASE_PATH=/`입니다. 예전 `/#lobby`와 `/#game/<id>` 주소는 같은 상태의 `/play/` 주소로 `location.replace` 이동합니다. `/play/`는 `noindex,follow`이며 sitemap에는 15개 clean 콘텐츠 URL만 포함합니다.

> 출시 상태 — 2026-07-22 점검에서 GitHub Pages 커스텀 도메인 TLS 인증서와 Enforce HTTPS가 활성화됐습니다. HTTP apex, HTTPS `www`, 이전 Pages URL은 path를 보존해 `https://moyeoplay.studio/`로 영구 redirect하며 live smoke를 통과했습니다. Search Console property·DNS 소유권·sitemap 제출과 AdSense 사이트 검증·심사 결과는 이 배포 상태와 분리해 확인합니다.

## 게임과 조작

| 게임               | 인원 | 키보드                  | 모바일               | 기본 규칙                        |
| ------------------ | ---: | ----------------------- | -------------------- | -------------------------------- |
| 오목               |    2 | 클릭·좌표 select·방향키 | 좌표 선택 후 확정    | 15×15, 3판 2선승, 프리스타일 5목 |
| 탁구               |    2 | P1 `W/S`, P2 `↑/↓`      | 좌우 독립 상·하 버튼 | 7점 선취                         |
| 통통 배구          |    2 | P1 `A/D/W`, P2 `←/→/↑`  | 좌우 독립 이동·점프  | 7점 선취                         |
| 핀볼 늦게 떨어지기 |    2 | P1 `A`, P2 `L`          | 좌우 부스터          | 3판 2선승, 부스터 3회            |
| 사다리 타기        |  2–8 | 버튼·입력               | 버튼·입력            | 중복 없는 1:1 결과               |
| 반응속도 대결      |    2 | P1 `F`, P2 `J`          | 화면 양쪽            | 3점 선취, 부정 출발              |
| 탭 배틀            |    2 | P1 `F`, P2 `J`          | 화면 양쪽 멀티터치   | 5/10/15초 연타                   |
| 벌칙 룰렛          | 2–12 | 버튼·입력               | 버튼·입력            | 모든 항목 동일 확률              |

게임 안에서는 공통 HUD로 규칙, 시작/일시정지, 다시 시작, 설정, 지원 브라우저의 전체 화면을 사용할 수 있습니다. 모바일 액션 게임은 **가로 방향을 권장**하지만 세로 화면에서도 막지 않습니다. 높이 500px 이하의 가로 모드에서는 HUD·점수·경기 영역·양쪽 핵심 조작을 한 visual viewport에 배치하며, 극단적으로 작은 화면과 확대 환경에서는 스크롤 가능한 fallback을 제공합니다.

## 로컬 실행

Node.js 20 계열은 20.19 이상, Node.js 22 계열은 22.13 이상, 또는 Node.js 24 이상과 npm이 필요합니다. CI는 Node.js 24 LTS를 사용합니다.

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
npm run test:e2e        # custom root로 빌드한 dist의 Playwright + axe
npm run test:e2e:root   # custom-domain root + AdSense mock 격리 profile
npm run test:e2e:dev    # 빠른 개발 서버 E2E
E2E_LIVE_URL=https://moyeoplay.studio/ npm run test:e2e:live
                        # 지정한 배포 URL의 Pages smoke
npm run check           # typecheck + lint + unit + production build
```

처음 E2E를 실행하는 컴퓨터에서는 브라우저를 한 번 설치합니다.

```bash
npx playwright install chromium webkit
```

## 구조

```text
site/             랜딩·게임 가이드·신뢰 페이지의 단일 콘텐츠 원본
scripts/          정적 MPA·아이콘·OG·스크린샷 생성과 artifact 검증
src/static-site.ts 정적 페이지 progressive enhancement와 광고 consent gate
src/app/          /play/ 라우터, 앱 셸, 설정·세션 저장소
src/components/   모달, 토스트, 게임 카드
src/core/         게임 계약, 고정 스텝 루프, 입력, 오디오, Canvas, RNG, 저장소
src/games/        8개 독립 게임과 순수 로직 테스트
src/styles/       토큰, 기본, 컴포넌트, 게임, 반응형 CSS
tests/e2e/        Playwright 사용자 흐름과 axe 검사
design/           ImageGen 게임 아이콘과 클레이 히어로 master
public/           최적화 아이콘·히어로, 실제 게임 스크린샷, OG, PWA 자산
docs/             아키텍처, QA, SEO·호스팅·AdSense·자산 provenance
```

`scripts/generate-site.mjs`가 build 전에 `.generated-pages/`에 16개 HTML entry와 sitemap을 만듭니다. 각 게임은 `/play/`에서 진입할 때 동적으로 import되며 `mount → enter → start/pause/resume/reset → destroy` 생명주기를 따릅니다. 자세한 내용은 [아키텍처 문서](docs/ARCHITECTURE.md)를 참고하세요.

게임 아이콘·히어로와 OG는 저장소 master에서 다시 만들 수 있습니다. 실제 게임 화면은 production preview를 연 Playwright로 캡처합니다.

```bash
npm run assets:build
npm run assets:screenshots
```

## 배포

`.github/workflows/pages.yml`은 다음 흐름을 사용합니다.

1. 모든 pull request에서 `npm ci`, 타입·포맷·린트 검사, 단위 테스트, custom root의 광고 off·account-meta-only·mock-ad 검사, 실제 배포 profile의 Chromium·WebKit production E2E를 실행합니다.
2. `main` push에서는 같은 검사가 통과한 뒤 `dist`를 공식 Pages artifact로 업로드합니다.
3. 별도 deploy job이 `pages: write`, `id-token: write`만 받아 `github-pages` environment로 배포합니다.
4. 배포 직후 별도 live smoke job이 `https://moyeoplay.studio/`의 15개 색인 URL, `/play/`, root 파일, 메타데이터, 정적 자산과 Canvas 게임을 Chromium으로 다시 검사합니다. HTTP·`www` redirect test는 `E2E_CHECK_REDIRECTS=true`일 때 실행되며 Pages workflow는 출시 게이트로 이 값을 켭니다. TLS가 준비되지 않으면 job을 실패시켜 외부 blocker를 숨기지 않습니다.

workflow는 `SITE_URL`/`CUSTOM_DOMAIN`을 운영 URL의 단일 공급원으로 사용합니다. custom-domain profile은 base `/`와 PWA id·scope를 사용하고 `CNAME`, root `robots.txt`, 실제 publisher가 설정된 경우에만 root `ads.txt`를 생성합니다. GitHub Actions 방식에서는 artifact의 `CNAME`만으로 Pages custom domain이 설정되지 않으므로 **Settings → Pages의 custom domain, DNS, 인증서, Enforce HTTPS를 별도로 확인**해야 합니다. 자세한 내용은 [SEO 배포](docs/SEO_DEPLOYMENT.md)와 [호스팅·수익화](docs/HOSTING_AND_MONETIZATION.md)를 참고하세요.

저장소의 **Settings → Pages → Build and deployment → Source**는 **GitHub Actions**로 설정되어 있습니다. `main`에 반영하면 품질 검사를 통과한 `dist`가 배포되지만, 배포 job 성공과 custom-domain HTTPS 성공은 서로 다른 판정입니다.

## 운영 환경 변수

| 변수                           | 역할                                       | 기본·운영 원칙                                                 |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| `CUSTOM_DOMAIN`                | CNAME·root-domain 빌드 기준                | 운영값 `moyeoplay.studio`                                      |
| `SITE_URL`                     | canonical·OG·JSON-LD·sitemap·공유 URL 기준 | 운영값 `https://moyeoplay.studio/`                             |
| `PAGES_BASE_PATH`              | Vite·manifest·asset base                   | 운영값 `/`                                                     |
| `ADSENSE_ACCOUNT_META_ENABLED` | AdSense 사이트 소유권 확인 meta만 생성     | 승인 전 기본 `false`; 실제 `ADSENSE_CLIENT_ID` 필요            |
| `ADSENSE_ADS_ENABLED`          | 홈과 8개 가이드의 수동 광고 slot 생성      | 승인·CMP 연결 전 기본 `false`                                  |
| `ADSENSE_ENABLED`              | 이전 설정 호환용 광고 flag                 | 신규 설정으로 이전하며 상충 값은 허용하지 않음                 |
| `ADSENSE_CLIENT_ID`            | `ca-pub-` 16자리 account/client ID         | 실제 계정 값만 사용                                            |
| `ADSENSE_PUBLISHER_ID`         | root `ads.txt`의 `pub-` ID                 | 실제 계정 값만 사용                                            |
| `ADSENSE_CONTENT_SLOT_ID`      | 수동 반응형 slot ID                        | 실제 승인 후 광고 profile에서만 사용                           |
| `SITE_OPERATOR_NAME`           | About·가이드 작성 주체                     | 실제 주체가 없으면 비워 두고 readiness 미완료로 기록           |
| `PUBLIC_CONTACT_EMAIL`         | 공개 문의 이메일                           | 실제 관리 가능한 도메인 이메일만 사용                          |
| `PUBLIC_CMP_PROVIDER_NAME`     | 실제 연결한 CMP 이름                       | settings URL과 함께 설정하거나 둘 다 비움                      |
| `PUBLIC_CMP_SETTINGS_URL`      | 동의 설정·철회 경로                        | provider 이름과 함께 설정; 설정만으로 CMP 인증을 주장하지 않음 |

`ADSENSE_ACCOUNT_META_ENABLED=true`는 소유권 확인 meta만 만들며 slot·Google 광고 script·광고 요청을 만들지 않습니다. `ADSENSE_ADS_ENABLED=true`여도 실제 광고 요청은 CMP adapter가 동의 허용을 전달한 뒤에만 가능하고, 거부·철회·CMP 실패에서는 요청하지 않습니다. `moyeoplay:ads-consent-granted`는 CMP 자체가 아니라 호환 integration event입니다.

## 브라우저 지원

최근 두 버전의 Chrome, Edge, Firefox, Safari와 iOS Safari, Android Chrome을 대상으로 합니다. Fullscreen, Vibration, Web Audio 같은 API는 기능 감지 후 선택적으로 사용하며 핵심 게임은 해당 API 없이도 동작합니다.

## 데이터와 외부 자산

- 사용자 입력은 HTML로 해석하지 않고 DOM `textContent`/form value로만 다룹니다.
- 계정·서비스 DB·분석 SDK·런타임 CDN이 없습니다. 설정과 최근 전적은 `moyeoplay:settings`, `moyeoplay:session`에만 저장합니다.
- AdSense 광고는 기본 off입니다. account meta와 광고 slot·script·request는 분리되어 있고 `/play/`에는 어떤 profile에서도 광고 slot을 넣지 않습니다. 운영 활성화에는 실제 ID, AdSense의 Verify·Request review 결과, Google 인증 CMP 연결과 수동 배치 검토가 필요합니다.
- 그래픽은 Canvas·CSS·자체 SVG와 프로젝트용 ImageGen 아이콘으로 구성됩니다. 생성·chroma 제거·최적화 기록은 [자산 provenance](docs/ASSET_PROVENANCE.md)에 있습니다.
- 저장 데이터가 손상되거나 `localStorage`가 차단되어도 메모리 기본값으로 실행합니다.

환경변수와 활성화 전 게이트는 [AdSense 준비 체크리스트](docs/ADSENSE_READINESS.md)에 정리했습니다. 코드 준비와 별개로 실제 운영자 정보·문의 이메일·AdSense ID·Search Console 등록·CMP·사이트 심사 결과는 운영자가 외부 계정에서 확인하고 기록해야 합니다.
