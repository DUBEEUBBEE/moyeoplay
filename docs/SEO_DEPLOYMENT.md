# SEO 배포 안내

최종 갱신: 2026-07-19

이 문서는 `scripts/generate-site.mjs`, `scripts/site-config.mjs`, `vite.config.ts`, `.github/workflows/pages.yml`의 현재 동작을 기준으로 한다. Search Console 소유권 확인과 sitemap 제출은 이 저장소에서 자동화하지 않는 수동 운영 작업이다.

## 현재 배포 프로파일

| 항목              | GitHub Project Pages                      | custom root domain 준비 모드             |
| ----------------- | ----------------------------------------- | ---------------------------------------- |
| `SITE_URL`        | `https://dubeeubbee.github.io/moyeoplay/` | `https://<YOUR_VERIFIED_HOSTNAME>/`      |
| `PAGES_BASE_PATH` | `/moyeoplay/`                             | `/`                                      |
| `CUSTOM_DOMAIN`   | 빈 값                                     | scheme과 path가 없는 실제 호스트 이름    |
| Vite output       | `dist/`                                   | `dist/` 또는 명시한 별도 `BUILD_OUT_DIR` |
| `sitemap.xml`     | `/moyeoplay/sitemap.xml`                  | `/sitemap.xml`                           |
| `robots.txt`      | 생성하지 않음                             | 도메인 root에 생성                       |
| `CNAME`           | 생성하지 않음                             | `CUSTOM_DOMAIN`이 있으면 생성            |
| `ads.txt`         | 생성하지 않음                             | 실제 publisher ID가 있을 때만 생성       |

현재 GitHub Actions 워크플로우는 project Pages 프로파일을 사용한다.

```bash
PAGES_BASE_PATH=/moyeoplay/ \
SITE_URL=https://dubeeubbee.github.io/moyeoplay/ \
npm run build
```

이 빌드의 canonical, Open Graph URL, manifest, 정적 asset URL, sitemap URL은 모두 `/moyeoplay/`를 기준으로 만들어져야 한다.

## 생성되는 검색용 표면

- 정적 HTML은 루트 1개, 게임 가이드 8개, 안내·정책 페이지 6개, 게임 실행 페이지 1개로 총 16개다.
- `sitemap.xml`은 색인 대상 clean URL 15개만 담는다. `/play/`는 포함하지 않는다.
- `/play/`는 `noindex,follow`를 사용한다. hash 게임 URL은 sitemap에 넣지 않고 `/games/<slug>/`가 게임별 검색·공유 표면이다.
- 색인 대상 페이지는 절대 canonical, 고유 title·description, Open Graph/Twitter image, JSON-LD, 하나의 `h1`을 제공한다.
- `dateModified`와 sitemap `lastmod`는 `site/site-content.mjs`의 실제 갱신일에서 만든다. 배포 시각을 임의로 날짜로 사용하지 않는다.

## project Pages와 root 파일 제약

Google은 `robots.txt`가 적용될 호스트의 root에 있어야 하며, 하위 디렉터리의 파일은 해당 호스트의 `robots.txt`로 취급하지 않는다. [Google robots.txt 위치 규칙](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt)

`DUBEEUBBEE/moyeoplay`는 `dubeeubbee.github.io`의 `/moyeoplay/` 하위 경로만 배포한다. 따라서 이 project 저장소로는 호스트 root인 `https://dubeeubbee.github.io/robots.txt`를 관리할 수 없다. `/moyeoplay/robots.txt`를 만들어도 root `robots.txt`가 아니므로, 현재 생성기는 project Pages 프로파일에서 해당 파일을 의도적으로 빼는다. 필요한 색인 제어는 페이지별 robots meta로 처리한다.

`ads.txt`도 검증 대상 사이트의 root URL에 있어야 한다. Google의 예시는 `https://example.com/ads.txt`이며, 호스트 하위 project path를 root로 간주하지 않는다. [Google ads.txt 안내](https://support.google.com/adsense/answer/12171612)

project Pages에서는 `https://dubeeubbee.github.io/moyeoplay/sitemap.xml`을 공개할 수 있다. Google은 sitemap이 root에 없거나 `robots.txt`에 선언되지 않아도 Search Console에서 URL을 직접 제출하는 방법을 제공한다. [Google sitemap 생성·제출 안내](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

## custom domain root 빌드

실제로 소유·검증한 호스트 이름을 확정한 뒤에만 다음 프로파일을 사용한다. 문서의 placeholder를 운영값으로 배포하지 않는다.

```bash
CUSTOM_DOMAIN=<YOUR_VERIFIED_HOSTNAME> \
SITE_URL=https://<YOUR_VERIFIED_HOSTNAME>/ \
PAGES_BASE_PATH=/ \
npm run build
```

이 프로파일은 다음을 강제한다.

- `CUSTOM_DOMAIN`은 scheme, port, path가 없는 hostname이어야 한다.
- `SITE_URL`의 hostname이 `CUSTOM_DOMAIN`과 같아야 한다.
- `SITE_URL` path와 `PAGES_BASE_PATH`는 모두 `/`여야 한다.
- 생성기는 `CNAME`, root `robots.txt`, root `sitemap.xml`을 만든다. `ADSENSE_PUBLISHER_ID`가 있을 때만 root `ads.txt`를 더한다.

GitHub Pages custom domain은 저장소 Pages 설정과 DNS 제공자 설정을 별도로 완료해야 한다. apex domain은 공식 안내의 `A`/`AAAA` 또는 `ALIAS`/`ANAME` 방식을 따른다. [GitHub Pages custom domain 설정](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

현재 빌드가 산출물에 `CNAME`을 넣는 것은 다른 정적 호스트와 산출물 검사에서도 도메인 의도를 보존하기 위함이다. 다만 GitHub의 custom Actions 배포에서는 산출물의 `CNAME`이 custom domain을 설정해 주지 않으며, GitHub 문서상 필수 파일도 아니다. Pages 설정과 DNS가 운영 기준이다.

## GitHub Pages 외 정적 호스트로 이전할 때

모여PLAY는 서버 런타임이 없는 정적 MPA다. custom root 프로파일로 빌드한 `dist/`를 directory index를 지원하는 정적 호스트의 도메인 root에 배포할 수 있다.

- Cloudflare Pages는 사전 빌드한 폴더를 Direct Upload로 배포하는 방법을 문서화한다. [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- Netlify는 Git 연결 또는 `dist`같은 output 폴더 업로드를 지원한다. [Netlify 배포 안내](https://docs.netlify.com/start/choose-your-path/)

호스트 선정 전에는 현재 이용약관, 상업적 이용, 대역폭, custom domain, 비용, 로그·쿠키 처리, 수익화 정책을 운영자가 다시 확인한다. 이 문서는 특정 호스트의 현재 요금제나 AdSense 허용을 보증하지 않는다.

## 배포 검증

```bash
npm ci
PAGES_BASE_PATH=/moyeoplay/ \
SITE_URL=https://dubeeubbee.github.io/moyeoplay/ \
npm run build
npm run verify:dist
npm run test:e2e:prod:run
```

배포 전에 다음을 확인한다.

- [ ] `dist/index.html`과 8개 `/games/<slug>/index.html`이 존재한다.
- [ ] `dist/sitemap.xml`에 절대 canonical URL 15개가 있고 hash URL과 `/play/`가 없다.
- [ ] project Pages 빌드에 `robots.txt`, `CNAME`, `ads.txt`가 없다.
- [ ] custom root 빌드라면 `SITE_URL`, `PAGES_BASE_PATH`, `CUSTOM_DOMAIN`, `CNAME`, root asset 내용이 서로 일치한다.
- [ ] canonical, `og:url`, `og:image`가 현재 배포 도메인과 base path를 사용한다.
- [ ] `/play/`가 `noindex,follow`이고 게임 가이드는 `index,follow,max-image-preview:large`이다.
- [ ] live 루트, sitemap, manifest, OG 이미지, 8개 guide URL이 HTTP 200이다.
- [ ] Search Console 소유권 확인·sitemap 제출은 자동 완료로 간주하지 않고 별도 수동 기록을 남긴다.
