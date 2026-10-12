# 모여PLAY SEO·콘텐츠·AdSense 준비 감사

감사 시작: 2026-10-12 (Asia/Seoul). 마무리 검토: 2026-10-13. 대상: `DUBEEUBBEE/moyeoplay`, <https://moyeoplay.studio/>. 콘텐츠 작성·수정일은 실제 문서를 보강한 2026-10-12로 기록했다. CSS 보정과 검증 재실행만으로 날짜를 다시 올리지 않았다.

기존 8개 게임과 정적 콘텐츠를 유지하고, 기존 게임 가이드 8개·실전 가이드 4개를 먼저 보강했다. 구현에 근거한 심층 문서 4개를 추가해 로컬 production 산출물은 색인 대상 24개, 전체 HTML entry 26개다. 공개 배포본은 감사 시점에 기존 20개 문서이며 새로운 4개 URL은 아직 404다. 이 보고서는 배포 완료·Google 색인·AdSense 승인을 의미하지 않는다.

## 1. 발견 사항과 심각도

심각도는 작업 우선순위이며 Google 거절 원인의 확정 진단이 아니다. 기술적인 색인 차단 결함은 기존 20개 URL에서 발견하지 못했다.

| 심각도              | 발견 사항                                                                                         | 조치·남은 일                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 중간                | 반응속도 설명의 “신호 뒤 12ms”가 실제 첫 유효 입력 뒤의 버퍼와 혼동될 수 있음                     | 기본 가이드·검증 설명·공정성 페이지를 바로잡고 8ms 판정 경계와 분리                                  |
| 중간                | 편집 가이드의 최초 작성·최종 확인 표시가 `updated` 하나를 공유함                                  | 최초 작성일과 최종 수정일을 별도로 출력하고 Article 날짜와 대조                                      |
| 중간                | 개인정보 안내가 사다리·룰렛의 게임 ID·시각 저장과 전적 초기화 후 설정 잔존을 충분히 구분하지 않음 | 실제 SessionStore 저장·초기화 범위에 맞춰 보완                                                       |
| 중간                | 기존 가이드의 상황 판단·바로 실행할 연습·자료 출처·심층 설명 간 연결에 개선 여지                  | 8종 각각의 사례 3개, 실행 행동, 사진 설명, 관련 문서와 소스 추가                                     |
| 중간                | 실제 운영 주체의 표시명과 비공개 문의 이메일은 로컬에 미제공                                      | 프로젝트 주체와 공개 저장소를 명시하고 실제 설정은 운영자가 입력. GitHub Issues는 공개 채널임을 안내 |
| 중간 / 새 기능 검수 | 844×390에서 목차 이동 후 제목 일부가 기존 두 줄 헤더에 가림                                       | 821–900px 문서 앵커 여백만 보정, 네 화면 크기 회귀 검사 추가                                         |
| 배포 전 확인        | 새 4개 URL이 현재 공개 서버에 없고 sitemap은 20개                                                 | 개선안 반영 후 24개 URL live 감사를 다시 통과해야 함                                                 |
| 높음 / 검색 발견    | 기존 가이드 허브·핀볼 실전·2인 게임 비교가 URL 검사에서 “Google에는 아직 알려지지 않은 URL”       | 배포 후 사이트맵 마지막 읽기·발견 URL과 세 문서의 Live test·색인 요청 확인                           |
| 미확인              | 전체 문서의 Google-selected canonical 및 현재 AdSense 계정 상태                                   | 홈 canonical 일치는 확인. 나머지 URL별 선택과 AdSense 결과는 미확인                                  |

### 변경하지 않은 정상 항목

[기존 배포본 감사](evidence/2026-10-12/live-baseline.json)는 기존 20개 URL의 직접 HTTP 200, 문서별 H1 하나, canonical·OG·JSON-LD의 apex URL 일치, sitemap의 정확한 20개 canonical 집합, robots 제공, 정상 redirect, 실제 404를 통과했다. 강화된 [현재 checkout 대비 감사](evidence/2026-10-12/live-current.json)에서도 기존 20개 문서의 title·description은 고유하고 canonical·description은 각각 하나다. 새 URL의 404 네 건과 이에 따른 메타·sitemap 불일치 때문에 전체 판정은 실패한다. 이때 콘솔 오류 4건은 해당 404 resource 응답이며 기존 문서의 JavaScript 예외로 해석하지 않는다.

`/play/`는 계속 `noindex,follow`, sitemap 제외, account meta·광고 슬롯·광고 요청 없음이다. 존재하지 않는 문서와 자산은 실제 HTTP 404이며 branded 404에는 noindex와 복구 링크가 있다. HTTP apex·HTTPS www·이전 Pages 주소는 path를 유지해 HTTPS apex로 영구 이동했다. 정상 canonical 생성 계약·robots 정책·redirect·게임 실행 방식은 변경하지 않았다.

[배포본 렌더링 감사](evidence/2026-10-12/live-rendered.json)는 실제 sitemap의 20개 문서에서 원본 HTML 본문과 렌더링 본문, 모바일·데스크톱 본문 일치, H1·head 메타, 이미지 alt·크기·decode, 내부 문서 21개와 fragment 61개를 확인했다. 런타임 오류·광고 요청은 0이다. 전체 `ok:false`의 이유는 checkout의 24개 예상 URL과 배포본 20개의 차이다.

## 2. 수정 파일과 목적

| 파일                                                                                                                     | 실제 변경                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `site/site-content.mjs`                                                                                                  | 기존 12개 가이드 보강 연결, 반응속도 설명 정정, 허브·소개·문의·공정성·개인정보 보완, 변경한 문서만 수정일 갱신 |
| `site/practice-content.mjs`                                                                                              | 게임별 사례·실행 연습·실제 이미지 설명·관련 문서, 기존 실전 가이드 4개 추가 사례와 자료 출처                   |
| `site/deep-guides.mjs`                                                                                                   | 오목 방어·반응속도 기록·사다리 순열·로컬 2인 입력 점검의 심층 문서 4개                                         |
| `site/evidence-examples.mjs`, `site/evidence-examples.d.mts`                                                             | 도식과 판정 테스트가 공유하는 설명용 국면·가로줄·반응시간 입력                                                 |
| `site/guide-diagrams.mjs`                                                                                                | 오목 세 국면과 실제 인접 교환 규칙의 사다리를 접근 가능한 inline SVG로 생성                                    |
| `scripts/generate-site.mjs`                                                                                              | 사진 caption, 상황표·관련 가이드, 정적 목차, 상단 실행 링크, 문서별 자료 출처, 작성일·수정일 분리              |
| `src/styles/static-site.css`                                                                                             | 기존 토큰을 쓰는 문서용 목차·figure, SVG 반응형 크기, 확인된 헤더 가림 보정                                    |
| `vite.config.ts`                                                                                                         | 기존 MPA에 새 문서 4개 entry 추가                                                                              |
| `scripts/verify-dist.mjs`, `scripts/site-content.test.mjs`                                                               | 메타 중복·색인 가능 여부·실제 날짜·사례·출처·24개 URL 검증 강화                                                |
| `scripts/audit-live.mjs`                                                                                                 | 콘텐츠 원본에서 URL 도출, canonical·description 개수와 중복 검사, ads.txt와 공개 account meta의 publisher 비교 |
| `scripts/audit-rendered.mjs`, `package.json`                                                                             | 원본/렌더링·모바일 본문·이미지·내부 링크·fragment·비식별 lab 성능 감사 명령 추가                               |
| `src/content-evidence.test.ts`                                                                                           | 오목 세 국면·사다리 가로줄·8ms 반응 예제를 실제 게임 함수로 검증하는 5개 테스트                                |
| `tests/e2e/seo.spec.ts`, `adsense.spec.ts`, `live.spec.ts`                                                               | 기존 검사 유지, 24개 문서·네 화면 크기·전체 이미지·자료/날짜·목차와 광고 제외 회귀 확대                        |
| `eslint.config.js`, `.prettierignore`                                                                                    | 콘텐츠 타입 선언 검사와 생성된 테스트 보고서 제외 범위 정리                                                    |
| `README.md`, `docs/ARCHITECTURE.md`, `QA.md`, `ADSENSE_READINESS.md`, `SEARCH_CONSOLE_CHECKLIST.md`, `SEO_DEPLOYMENT.md` | 새 문서 수·검사법 갱신, 과거 계정 기록과 현재 미확인 상태 분리                                                 |
| `docs/evidence/2026-10-12/*`, 이 보고서                                                                                  | 계정 ID를 기록하지 않는 재검증 자료와 수동 인계 항목                                                           |

`src/games/`, `src/core/`, `src/app/`, 광고 loader·CMP adapter, 브랜드 master와 `public/` 자산은 변경하지 않았다. [보존 대조 기록](evidence/2026-10-12/preservation.json)의 대상 114개 파일이 기준 commit과 바이트 단위로 같다. `scripts/site-config.mjs`의 정상 설정 계약도 유지했다. `/terms/`와 `/how-to-play/`는 실제 기능과 맞아 본문·수정일을 유지했다.

## 3. 콘텐츠 가치 개선

### 기존 게임 가이드 8개 전수 검토

| 게임      | 보강한 구체 질문·연습                                              | 구현 근거                                    |
| --------- | ------------------------------------------------------------------ | -------------------------------------------- |
| 오목      | 막힌 네 돌·열린 네 돌·가운데 빈칸에서 다음 한 수, 좌표로 직접 재현 | 15×15 자유룰, `findWinningLine`·`placeStone` |
| 탁구      | 패들 중심·끝·이동 접촉을 하나씩 바꿔 비교                          | 패들 접촉 위치·속도의 반사 처리              |
| 통통 배구 | 낙하 지점 이동과 새 점프 입력을 구분                               | 캐릭터 충돌·점프 입력·바닥 득점              |
| 핀볼      | 카운트다운·약 0.36초 쿨다운·착지 뒤 무효 입력                      | 부스터 사용 가능 상태와 착지 확정            |
| 사다리    | 같은 문구와 같은 결과 칸을 구분, 오타 편집 시 재추첨               | 결과 칸 순열과 확정 snapshot                 |
| 반응속도  | 부정 출발·8ms 무승부·첫 입력 뒤 12ms 버퍼·기기 비교 한계           | 정규화된 이벤트 시각과 판정 함수             |
| 탭 배틀   | 30회/10초 계산, key repeat 제외, 일시정지 시간 제외                | 유효 새 입력과 경기 시계                     |
| 룰렛      | 이전 결과 재선택·직접 삭제·중복 칸의 합산 확률                     | 균등 칸 선택과 목록 변경                     |

기존 규칙·조작·FAQ·실제 화면·실행 기능을 보존했다. 각 가이드에 상황/다음 행동/근거 표 세 행, 짧은 실습, 관련 실전 문서와 `/play/#game/{id}` 링크를 붙였다. 공통 문단을 게임 이름만 바꿔 반복하지 않았다.

### 기존 실전 가이드 4개

- 벌칙 룰렛: 8칸과 중복 칸의 확률, 당첨 제외는 직접 삭제, 모두에게 역할 배정은 사다리로 연결.
- 핀볼 타이밍: 실제 세 번 사용 예를 정정하고 첫 사용·남은 횟수·무효 입력을 기록하는 빈 연습 틀 추가. 측정하지 않은 효과 크기 비교 삭제.
- 2인 브라우저 게임: 게임 선택 후 첫 판의 입력·상태 확인표와 구체적인 동시 입력 진단으로 연결.
- 파티 진행: 6명 A–F의 실제 인원 제한에 맞는 순환 편성 예와 사다리 8명 제한 명시.

### 독립적인 심층 문서 4개

- `/guides/omok-threats-and-defense/`: 세 방어 국면의 좌표·착수 순서·도식. 실제 5목 판정으로 다음 승리 칸을 검증.
- `/guides/reaction-time-and-input-delay/`: 시각 계산, 8ms/12ms 구분, 입력 지연 보정의 한계, 같은 기기 비교 절차.
- `/guides/ladder-permutation-explained/`: 3명/6순열, rejection sampling, A→3·B→1·C→2의 실제 가로줄, 제자리 배정과 라운드 ID의 한계.
- `/guides/local-multiplayer-input-check/`: 경기 상태→단독 입력→동시 입력→터치 해제→repeat→화면→탭 복귀→제보의 실행 순서.

각 문서에는 실제 작성·수정일, 공개 구현/테스트 출처, 관련 기본 가이드와 실행 링크, 정적 href 목차가 있다. 사례·계산·모임 표는 설명용이라고 구분했다. 실측 플레이 후기·승률·이용자 수·외부 평가를 만들지 않았다. FAQ의 특수 검색 노출을 약속하지 않으며 새 리뷰 구조화 데이터도 없다.

기존 production 화면 자산은 그대로 사용했다. 새 도식은 저장소 규칙에 맞춘 자체 SVG이고 외부 이미지·폰트·CDN·라이선스를 도입하지 않았다. 로컬 production preview에서 390×844 오목, 844×390 입력 문서, 768×1024 사다리, 1440×900 오목을 캡처해 도식·본문을 시각 검수했다. 이 캡처는 실제 휴대전화 테스트나 경기 성적의 증거가 아니다.

Google은 도움이 되는 고유 콘텐츠와 사용성·탐색을 사이트 준비 요소로 안내한다. 페이지 수나 자동 점수만으로 승인 또는 검색 성과를 보장하지 않는다. [AdSense 사이트 준비 안내](https://support.google.com/adsense/answer/12176698?hl=ko), [Google의 유용한 콘텐츠 안내](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=ko)

## 4. 기능 보존·회귀·성능 검증

최종 재실행 결과는 아래 표와 [검증 요약](evidence/2026-10-12/verification.json)에 기록한다.

최종 산출물 수는 기존 로컬 생성 파일과 분리한 `BUILD_OUT_DIR=dist-review-20261013`의 새 production 빌드에서도 검증했다.

| 명령                                       | 결과                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                            | 통과: strict 타입·lint·Vitest 102건·Node 11건·production build                                                                        |
| `npm run test:e2e`                         | 통과: Chromium·WebKit 160건, 조건부 20건 skipped, 최종 flaky 0                                                                        |
| `npm run test:e2e:root`                    | 통과: meta-only 34건/6 skipped, 격리 mock ads 38건/2 skipped, 최종 flaky 0                                                            |
| `npm run verify:dist`                      | 통과: production 파일 119개·HTML 26개·색인 24개·8개 자산 세트                                                                         |
| `npm run format:check`                     | 통과: 전체 Prettier 검사                                                                                                              |
| `npm audit --omit=dev`                     | 취약점 0, 개발 도구 전체 감사는 별도로 8건(중간 4·높음 4)이 남음. 배포 runtime과 구분하며 이번 콘텐츠 변경에서 의존성은 교체하지 않음 |
| `npm run audit:live`                       | 배포 전 예상 실패: 새 4개 404 및 20→24 sitemap 차이. 기존 20개는 정상                                                                 |
| `npm run audit:rendered` (공개)            | 배포 전 예상 실패: 실제 20개 문서는 통과, sitemap 예상 집합 차이                                                                      |
| `audit:rendered` (로컬 production preview) | 24개 전부 통과, 내부 문서 25개·fragment 145개, 오류·광고 요청 0                                                                       |

E2E는 Chromium과 WebKit에서 8개 게임의 진입·시작·일시정지·재시작, 입력·결과·세션 기록, 라우트 이탈 정리, 숨겨진 탭 일시정지, 터치 독립 입력·해제, 키보드 조작을 검사한다. 실제 판정 입력·프레임·게임 타이머를 쓰는 기존 completion 검사를 유지했다. 반응속도 매치 완료 회귀는 부정 출발 세 번 경로이며 정상 신호의 시간 경계는 단위·입력 검사로 별도 확인한다. 모든 결과 경로를 실제 하드웨어에서 전수 확인한 것으로 확대하지 않는다.

24개 문서는 390×844, 844×390, 768×1024, 1440×900에서 주요 본문 일치와 수평 overflow 0을 확인하고 모든 lazy 이미지까지 decode한다. JavaScript 없이도 원본 HTML의 H1·본문·정상 href를 읽을 수 있다. Axe는 모든 정적 문서와 기존 게임 상태의 serious/critical 위반을 검사하며 사람의 모든 접근성 평가를 대체하지 않는다.

최초 목차 테스트에서는 프로그램 포커스 스크롤과 즉시 앵커 이동이 경합해 재시도가 발생했다. 내부 링크 검사도 fragment 145개를 매번 다시 방문하면서 한 번 30초 제한을 넘겨, 렌더링 문서의 ID를 한 번 수집해 모든 대상과 대조하도록 개선했다. 화면 안의 링크를 먼저 포커스하는 실제 키보드 순서로 안정화했다. 또한 공유 `.generated-pages`를 쓰는 빌드 두 개를 동시에 실행한 검증 시도는 충돌해 중단됐다. 최종 검증은 빌드를 순서대로 재실행하며 해당 실패를 숨기거나 게임 코드 결함으로 간주하지 않는다.

### 성능 수치의 범위

[공개 사이트 lab 측정](evidence/2026-10-12/live-rendered.json)은 CPU·네트워크 스로틀 없이, 각 샘플마다 새 Chromium 컨텍스트로 홈을 열었다. 390×844에서 LCP 112ms·CLS 0·TBT 대체 지표 0, 1440×900에서 LCP 108ms·CLS 0·TBT 대체 지표 0이었다. 짧은 입력 표본의 최대 지연은 각각 40ms·56ms이며 field INP가 아니다. TBT 대체 지표는 관찰 구간의 50ms 초과 long task 합이며 Lighthouse 전체 측정과 같지 않다. 단일 네트워크·브라우저 관찰로 실제 모바일 Core Web Vitals 통과를 주장하지 않는다. Search Console 개요의 모바일·데스크톱 field 보고서는 현재 데이터 없음이며, 실제 28일 field LCP·INP·CLS가 쌓이면 다시 확인해야 한다. 확인된 성능 병목이 없어 게임 엔진·이미지·번들 구조를 임의 최적화하지 않았다.

## 5. 배포 환경 수동 설정과 광고 준비

- `CUSTOM_DOMAIN=moyeoplay.studio`, `SITE_URL=https://moyeoplay.studio/`, `PAGES_BASE_PATH=/`의 정상 운영값 유지.
- `SITE_OPERATOR_NAME`: 실제 공개할 운영·제작 주체만 입력. 없으면 현재의 “모여PLAY 프로젝트”·공개 저장소 안내 유지. 실명·조직을 만들지 않음.
- `PUBLIC_CONTACT_EMAIL`: 실제 관리할 수 있는 공개 이메일만 설정. 현재 별도 비공개 채널은 제공되지 않는다고 명시. GitHub Issues에는 로그인과 공개 게시가 필요하며 접수·응답 시간을 보장하지 않음.
- `ADSENSE_ACCOUNT_META_ENABLED=true`는 기존 심사용 운영 프로필을 유지하고 실제 `ADSENSE_CLIENT_ID`와 계정 화면의 Verify 결과를 확인. 메타 형식·일관성은 연결/승인 자체의 증거가 아님.
- `ADSENSE_ADS_ENABLED=false` 유지. 계정의 실제 publisher/client/slot ID를 추측·교체하지 않음. mock ID는 기존 격리 `dist-*-test`에서만 사용하며 deployable `dist`에 없음.
- 공개 `/ads.txt`는 200·정상 형식이며 공개 account meta의 publisher와 일치했다. 실제 AdSense 계정의 소유 ID·ads.txt 상태는 운영자가 계정 화면에서 비교해야 함.
- 실제 광고 활성화는 승인 후 별도 작업. 필요한 지역·광고 유형에 맞는 CMP를 실제 연결한 경우에만 `PUBLIC_CMP_PROVIDER_NAME`, `PUBLIC_CMP_SETTINGS_URL`을 입력하고 동의·거부·철회와 개인정보 문구를 다시 검증.

현재 실제 광고 요청은 0이다. 광고 모의 프로필에서는 홈·8개 게임 가이드의 수동 슬롯만 허용하고 `/play/`, 오류·신뢰 페이지·실전 문서에는 슬롯이 없다. 거부·철회·CMP 미사용/오류 및 모의 허용 상태에서 외부 광고 요청 0 조건을 검증한다. 실제 광고 creative·클릭·모바일 배치는 아직 확인할 수 없으며 모의 테스트로 승인 후 실제 광고의 CLS·오클릭 여부를 단정하지 않는다.

콘텐츠가 없거나 낮은 가치인 화면에 광고를 게재하지 않는 정책을 기준으로 실행용 앱과 콘텐츠 문서의 경계를 유지했다. [Google 게시자 콘텐츠 가치 정책](https://support.google.com/publisherpolicies/answer/11112688?hl=ko), [AdSense 프로그램 정책](https://support.google.com/adsense/answer/10502938?hl=ko)

## 6. Search Console에서 검사할 URL

2026-10-13에 인증된 `sc-domain:moyeoplay.studio`의 실제 화면을 읽었다. [비식별 확인 기록](evidence/2026-10-12/search-console.json)에 집계·검사 결과만 남기고 계정 이름·이메일·개별 검사 링크·트래픽 실적은 기록하지 않았다. 기존 문서의 2026-08-10 과거 수치를 현재값으로 재사용하지 않았다.

- 페이지 색인 보고서의 최종 업데이트는 2026-10-09이며 **색인 17개·제외 4개**다. 제외는 apex로 이동하는 HTTP/www 주소 3개와 `/play/`의 noindex 1개다. `/play/`도 URL Inspection에서 2026-07-23 스마트폰 crawl 성공 및 robots meta의 noindex 감지를 직접 확인했다. 리디렉션 유효성 검사는 2026-10-05 실패로 표시되지만 해당 세 주소의 apex 이동은 의도한 동작이므로 redirect를 제거하지 않는다.
- 제출된 sitemap은 **성공**이나 마지막 읽기 2026-07-29·발견 15개로 표시됐다. 공개 XML 20개·로컬 개선안 24개와 다르므로 배포 후 읽기 시각·발견 수 갱신 확인이 필요하다. 이 차이만으로 Google fetch 장애의 원인을 확정하지 않는다.
- `/guides/`, `/guides/pinball-drop-timing/`, `/guides/two-player-browser-games/`를 각각 URL Inspection으로 확인했다. 모두 **Google에는 아직 알려지지 않은 URL**, 감지된 참조 sitemap·페이지 없음, 최근 crawl·Google-selected canonical 해당사항 없음이었다. 200 응답과 색인 완료가 다른 실제 사례다.
- 홈은 Google 등록·Googlebot 스마트폰의 2026-10-06 crawl 성공, crawl/index 허용이다. 선언 canonical은 HTTPS apex이며 Google-selected canonical은 “검사된 URL”로 일치했다. 다른 모든 문서의 Google-selected canonical을 확인했다고 확대하지 않는다.
- Search Console 개요의 모바일·데스크톱 Core Web Vitals는 모두 **데이터 없음**이다. lab 수치로 field 통과를 대신하지 않는다.

위 상태는 읽기만 했으며 sitemap 재제출·색인 요청·유효성 검사·삭제를 실행하지 않았다. 기대한 noindex나 호스트 통합은 유지하고, 중요한 문서의 검색 발견 문제를 우선 확인한다. [Google 페이지 색인 보고서 안내](https://support.google.com/webmasters/answer/7440203?hl=ko)

아래 URL은 개선안 배포 후 전체 검사 대상이다. 새 문서 4개는 배포 전 검사에서 404인 것이 예상 상태다.

| URL                                                              | 검색/이용 목적           | 감사 시 공개 배포 |
| ---------------------------------------------------------------- | ------------------------ | ----------------- |
| <https://moyeoplay.studio/>                                      | 게임 탐색과 전체 안내    | 200               |
| <https://moyeoplay.studio/games/omok/>                           | 오목 기본 규칙·조작      | 200               |
| <https://moyeoplay.studio/games/pong/>                           | 탁구 기본 규칙·조작      | 200               |
| <https://moyeoplay.studio/games/volleyball/>                     | 통통 배구 기본 규칙·조작 | 200               |
| <https://moyeoplay.studio/games/pinball-drop/>                   | 핀볼 기본 규칙·부스터    | 200               |
| <https://moyeoplay.studio/games/ladder/>                         | 사다리 기본 사용법       | 200               |
| <https://moyeoplay.studio/games/reaction-duel/>                  | 반응속도 대결 규칙       | 200               |
| <https://moyeoplay.studio/games/tap-battle/>                     | 연타 대결 규칙           | 200               |
| <https://moyeoplay.studio/games/roulette/>                       | 룰렛 기본 사용법         | 200               |
| <https://moyeoplay.studio/guides/>                               | 상황별 자료 탐색         | 200               |
| <https://moyeoplay.studio/guides/penalty-roulette-ideas/>        | 벌칙·역할 목록 구성      | 200               |
| <https://moyeoplay.studio/guides/pinball-drop-timing/>           | 부스터 사용 상황         | 200               |
| <https://moyeoplay.studio/guides/two-player-browser-games/>      | 2인 게임 선택·첫 판 준비 | 200               |
| <https://moyeoplay.studio/guides/party-game-host-guide/>         | 인원별 모임 진행         | 200               |
| <https://moyeoplay.studio/guides/omok-threats-and-defense/>      | 네 돌 방어의 세 국면     | 신규, 404         |
| <https://moyeoplay.studio/guides/reaction-time-and-input-delay/> | 반응시간 숫자·지연 해석  | 신규, 404         |
| <https://moyeoplay.studio/guides/ladder-permutation-explained/>  | 1:1 배정 알고리즘 이해   | 신규, 404         |
| <https://moyeoplay.studio/guides/local-multiplayer-input-check/> | 키·터치 입력 문제 진단   | 신규, 404         |
| <https://moyeoplay.studio/about/>                                | 운영·제작·근거 확인      | 200               |
| <https://moyeoplay.studio/how-to-play/>                          | 공통 사용법              | 200               |
| <https://moyeoplay.studio/fairness/>                             | 판정·무작위성 한계       | 200               |
| <https://moyeoplay.studio/privacy/>                              | 실제 저장·개인정보 안내  | 200               |
| <https://moyeoplay.studio/terms/>                                | 기능에 맞는 이용 조건    | 200               |
| <https://moyeoplay.studio/contact/>                              | 실제 공개 문의 방법      | 200               |

1. 배포 후 `npm run audit:live`와 `npm run audit:rendered`로 24개 직접 200·canonical·sitemap 일치부터 확인한다.
2. 현재 마지막 읽기가 2026-07-29인 Search Console의 확인된 property에서 `https://moyeoplay.studio/sitemap.xml`의 마지막 읽기 시각·상태·발견 URL 수를 확인한다. `Success`를 색인 완료로 해석하지 않는다.
3. URL Inspection에서 URL별 마지막 crawl, fetch 성공, robots 허용, 색인 가능 여부, user-declared canonical과 Google-selected canonical을 기록한다. Live test의 렌더링 HTML·이미지도 확인한다.
4. `Discovered – currently not indexed`, `Crawled – currently not indexed`, soft 404, 중복/다른 canonical, server error, 리소스 차단을 URL별 실제 이유로 나눈다. 단순 200 응답을 Google 색인이라고 보고하지 않는다.
5. 새 심층 문서와 크게 보강한 주요 가이드에 필요할 때 색인 요청을 한다. `/play/`는 의도적인 noindex이므로 색인 요청하지 않는다.
6. 모바일 field Core Web Vitals와 검색 실적은 데이터가 있을 때 확인한다. 부족하면 “자료 부족”으로 남긴다.

상세 운영 절차는 [Search Console 체크리스트](SEARCH_CONSOLE_CHECKLIST.md)를 따른다. 계정 이메일·verification token은 공개 저장소에 기록하지 않는다.

## 7. 재심사 전 남은 위험과 순서

1. 개선안은 아직 공개 서버에 반영되지 않았다. PR 검토·반영과 Pages 배포 후 24개 URL의 두 live 감사 및 배포 workflow live smoke를 통과해야 한다.
2. 실제 운영 주체 표시명·관리 가능한 문의 이메일을 확인한다. 이메일 미설정 상태의 공개 문의 제약을 운영자가 이해해야 하며 가짜 정보를 채우지 않는다.
3. 실제 Search Console에서 확인한 가이드 허브·핀볼 실전·2인 게임 비교 세 문서는 Google에 알려지지 않은 상태다. sitemap 마지막 읽기 7월 29일·발견 15개도 현재 공개 20개와 다르다. 배포 후 sitemap 갱신·세 문서 및 신규 4개의 수집/색인 상태를 우선 확인한다.
4. 새 콘텐츠는 규칙·실습·구현 근거에 집중했다. Google이 사이트 전체의 콘텐츠 가치를 어떻게 평가할지는 미확정이며 페이지 증가나 테스트 통과로 승인을 보장하지 않는다.
5. 실제 모바일 하드웨어·모든 키보드 동시 입력·사용자 보조기기·field INP는 자동화만으로 확인하지 않았다.
6. 승인 전 광고는 계속 비활성이다. 실제 CMP·광고 creative·개인정보 선택과 배치 검토는 활성화 전에 별도로 완료해야 한다.
7. 위 사항을 확인한 뒤 운영자가 AdSense 계정의 실제 상태를 보고 재심사를 요청한다. 이 작업에서 광고 활성화·재심사 제출은 실행하지 않았다.
