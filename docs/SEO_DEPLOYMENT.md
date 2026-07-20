# SEO 배포 안내

최종 갱신: 2026-07-21

이 문서는 `scripts/generate-site.mjs`, `scripts/site-config.mjs`, `vite.config.ts`, `.github/workflows/pages.yml`의 운영 계약과 외부 Pages 설정을 분리해 기록한다. Search Console 소유권 확인과 sitemap 제출은 저장소에서 자동 완료할 수 없는 운영자 수동 작업이다.

## 운영 단일 진실 공급원

| 항목              | 운영값                                              |
| ----------------- | --------------------------------------------------- |
| `CUSTOM_DOMAIN`   | `moyeoplay.studio`                                  |
| `SITE_URL`        | `https://moyeoplay.studio/`                         |
| `PAGES_BASE_PATH` | `/`                                                 |
| Vite output       | `dist/`                                             |
| canonical host    | `moyeoplay.studio` apex                             |
| sitemap           | `https://moyeoplay.studio/sitemap.xml`              |
| robots            | `https://moyeoplay.studio/robots.txt`               |
| 플레이 앱         | `https://moyeoplay.studio/play/` (`noindex,follow`) |

canonical, Open Graph, Twitter image, JSON-LD, sitemap, manifest, robots sitemap 주소와 공유 URL은 위 config에서만 파생한다. `site/site-content.mjs`는 콘텐츠를 제공하지만 운영 URL을 별도로 소유하지 않는다.

배포 가능한 `dist`에 다음 문자열이 남으면 `verify:dist`가 실패해야 한다.

- 이전 운영 주소 `dubeeubbee.github.io/moyeoplay`
- 예약 테스트 도메인 `moyeoplay.example`
- mock AdSense ID와 unresolved placeholder
- source map, `/src/` 개발 entry, 로컬 절대 경로

`moyeoplay.example`과 mock ID는 `dist-*-test`처럼 배포되지 않는 격리 output에서만 허용한다.

## 현재 운영 상태

| 항목                         | 상태             | 근거·다음 작업                                                                                |
| ---------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| custom root artifact         | 확인 완료        | 최근 quality job에서 base `/`, custom CNAME, root robots, 15개 custom-domain sitemap URL 검증 |
| apex A records               | 확인 완료        | 2026-07-21 공개 DNS에서 GitHub Pages의 4개 IPv4 확인                                          |
| `www` CNAME                  | 확인 완료        | `dubeeubbee.github.io` 대상 확인                                                              |
| Pages custom domain 연결     | 확인 완료        | 최신 Pages deployment가 `moyeoplay.studio`를 environment URL로 사용                           |
| custom-domain TLS 인증서     | 미완료           | 마지막 live smoke와 직접 요청이 hostname 불일치로 실패                                        |
| Enforce HTTPS                | 미완료           | HTTP apex가 200을 반환해 HTTPS로 강제 전환되지 않음                                           |
| `www` → apex secure redirect | 미검증           | 올바른 custom 인증서가 없는 상태의 결과를 성공으로 기록하지 않음                              |
| 이전 Pages URL → HTTPS apex  | 미완료           | 마지막 확인에서 같은 path의 HTTP custom URL로 이동                                            |
| Search Console               | 운영자 수동 작업 | property·소유권·sitemap·색인 상태 미확인                                                      |
| AdSense                      | 운영자 수동 작업 | Sites Verify·Request review·Google 결과 미확인                                                |

최신 배포 artifact 자체가 성공했어도 TLS와 redirect가 통과하기 전에는 custom-domain 출시 완료가 아니다. GitHub는 custom domain의 **Enforce HTTPS** 옵션이 준비되기까지 시간이 걸릴 수 있다고 안내하므로, 추측으로 완료 처리하지 않고 live 결과를 다시 기록한다. [GitHub Pages custom domain 안내](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 생성되는 검색 표면

- 정적 HTML은 루트 1개, 게임 가이드 8개, 안내·정책 페이지 6개, 게임 실행 페이지 1개로 총 16개다.
- `sitemap.xml`은 색인 대상 clean URL 15개만 담고 `/play/`와 hash URL은 제외한다.
- `/play/`는 `noindex,follow`다. robots에서 `/play/`를 차단하지 않아 crawler가 meta robots를 읽을 수 있게 한다.
- 색인 대상 페이지는 절대 canonical, 고유 title·description, Open Graph/Twitter image, JSON-LD와 하나의 `h1`을 제공한다.
- 게임 가이드는 실제 구현·테스트·공정성 설명과 실제 플레이 화면 screenshot을 유지한다. 생성 icon은 장식 이미지로 빈 alt를 사용한다.
- `dateModified`와 sitemap `lastmod`는 실제 내용이 바뀐 페이지만 갱신한다. 배포 시각이나 전역 일괄 날짜를 사용하지 않는다.

## 운영 빌드

```bash
CUSTOM_DOMAIN=moyeoplay.studio \
SITE_URL=https://moyeoplay.studio/ \
PAGES_BASE_PATH=/ \
npm run build
npm run verify:dist
```

이 profile은 다음을 강제한다.

- `CUSTOM_DOMAIN`은 scheme, port, path가 없는 hostname이다.
- `SITE_URL`의 hostname은 `CUSTOM_DOMAIN`과 같고 HTTPS root URL이다.
- `SITE_URL` path와 `PAGES_BASE_PATH`는 모두 `/`다.
- generator는 root `CNAME`, `robots.txt`, `sitemap.xml`을 만든다.
- `ADSENSE_PUBLISHER_ID`가 실제 형식으로 설정된 root profile에서만 `ads.txt`를 만든다.
- AdSense account meta와 광고 slot은 각각 `ADSENSE_ACCOUNT_META_ENABLED`, `ADSENSE_ADS_ENABLED`로 분리된다.

## GitHub Pages 설정과 root 파일

GitHub Actions custom workflow에서는 artifact 안의 `CNAME`이 Pages custom domain을 설정하지 않으며 GitHub가 해당 파일을 요구하지도 않는다. 저장소 **Settings → Pages의 Custom domain**, DNS, 인증서와 **Enforce HTTPS**가 운영 기준이다. `CNAME` artifact는 다른 정적 호스트와 로컬 검증에서도 배포 의도를 확인하기 위해 유지한다.

현재 apex는 GitHub가 안내하는 4개 `A` record를 사용하고 `www`는 `dubeeubbee.github.io`를 가리킨다. wildcard DNS는 사용하지 않는다. DNS가 맞더라도 TLS 인증서 발급과 HTTPS enforcement는 별도 확인 항목이다. [GitHub Pages custom domain 안내](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

`robots.txt`와 `ads.txt`는 host root에 있어야 한다. custom root profile은 이를 제어할 수 있지만 이전 Project Pages 경로의 `/moyeoplay/robots.txt`나 `/moyeoplay/ads.txt`를 root 파일로 간주하지 않는다. [Google robots.txt 위치 규칙](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt), [Google ads.txt 안내](https://support.google.com/adsense/answer/12171612)

## 이전 GitHub Pages URL

이전 공개 URL은 `https://dubeeubbee.github.io/moyeoplay/`이다. GitHub Pages가 custom domain을 적용하면 기본 Pages URL을 custom host로 redirect하지만 다음을 live에서 확인해야 한다.

- root와 nested path가 각각 같은 path의 `https://moyeoplay.studio/`로 이동한다.
- redirect가 HTTP로 downgrade되지 않는다.
- redirect loop가 없다.
- 최종 문서 canonical과 `og:url`이 custom apex다.
- Search Console에서 이전 URL의 Google-selected canonical을 확인한다.

2026-07-21 마지막 확인에서는 이전 URL이 같은 path의 `http://moyeoplay.studio/`로 이동했으므로 완료 조건을 충족하지 못했다.

## 다른 정적 호스트로 이전할 때

모여PLAY는 서버 런타임이 없는 정적 MPA다. 같은 root profile로 만든 `dist/`를 directory index를 지원하는 정적 호스트의 domain root에 배포할 수 있다. canonical 생성, root files와 asset path는 GitHub 전용 API에 의존하지 않는다.

- Cloudflare Pages는 사전 빌드한 폴더의 Direct Upload를 지원한다. [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- Netlify는 Git 연결 또는 output 폴더 업로드를 지원한다. [Netlify 배포 안내](https://docs.netlify.com/start/choose-your-path/)

호스트를 바꾸기 전에는 현재 약관, 상업적 이용, 대역폭, custom domain, HTTPS, 비용, 로그·쿠키 처리와 redirect/header 기능을 다시 확인한다. 호스트 이전은 이 hardening의 필수 범위가 아니다.

## 배포와 live 검증

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run verify:dist
npm run test:e2e:prod
npm run test:e2e:root
npm audit --omit=dev
E2E_LIVE_URL=https://moyeoplay.studio/ npm run test:e2e:live
# TLS 준비 후 redirect까지 검사
E2E_CHECK_REDIRECTS=true E2E_LIVE_URL=https://moyeoplay.studio/ npm run test:e2e:live
```

- [ ] `dist/index.html`, 8개 guide와 6개 trust page, `dist/play/index.html`이 존재한다.
- [ ] 15개 색인 문서의 canonical·OG·JSON-LD URL이 `https://moyeoplay.studio/`를 사용한다.
- [ ] sitemap에는 정확히 15개 clean custom-domain URL이 있고 `/play/`와 hash URL이 없다.
- [ ] `robots.txt`는 custom sitemap을 선언하고 `/play/`를 막지 않는다.
- [ ] 광고 off와 account-meta-only artifact가 각각 slot·script·request 0 조건을 만족한다.
- [ ] live 15개 색인 URL, `/play/`, manifest와 root files가 기대 status와 content type을 반환한다.
- [ ] HTTPS 인증서가 apex와 `www`에서 유효하다.
- [ ] HTTP→HTTPS, `www`→apex, 이전 Pages URL redirect가 path를 보존하고 loop가 없다.
- [ ] Search Console과 AdSense 외부 작업은 각 체크리스트의 실제 증거가 있을 때만 완료 처리한다.
