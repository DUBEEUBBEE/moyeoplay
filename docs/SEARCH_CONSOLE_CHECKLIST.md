# Google Search Console 수동 체크리스트

최종 갱신: 2026-07-19

## 현재 상태

| 항목                             | 상태   |
| -------------------------------- | ------ |
| Search Console property 생성     | 미확인 |
| 소유권 검증                      | 미확인 |
| sitemap 수동 제출                | 미실행 |
| sitemap `Success` 상태           | 미확인 |
| URL 검사·색인 요청               | 미실행 |
| Page indexing/Performance 보고서 | 미확인 |

저장소에는 Search Console Sitemaps API, Indexing API, 소유권 검증 토큰, sitemap 자동 제출 workflow가 없다. 배포 성공을 Search Console 등록 성공으로 간주하지 않는다.

Google은 sitemap ‘제출’이 파일을 Google에 업로드하는 것이 아니라 공개된 파일의 위치를 알리는 것이라고 설명한다. Search Console Sitemaps report에서 소유자가 URL을 입력해 제출해야 하며, sitemap에 있는 URL이 모두 crawl 또는 index된다는 보장은 없다. [Search Console Sitemaps report 안내](https://support.google.com/webmasters/answer/7451001)

## 1. 배포 전 로컬 검사

```bash
npm ci
PAGES_BASE_PATH=/moyeoplay/ \
SITE_URL=https://dubeeubbee.github.io/moyeoplay/ \
npm run build
npm run verify:dist
npm run test:e2e:prod:run
```

- [ ] `dist/sitemap.xml`이 존재한다.
- [ ] sitemap에 절대 URL 15개가 있다.
- [ ] sitemap에 hash URL, `/play/`, `noindex` URL, placeholder domain이 없다.
- [ ] 루트, 8개 게임 가이드, 6개 정적 안내 페이지의 canonical이 `https://dubeeubbee.github.io/moyeoplay/`를 기준으로 한다.
- [ ] `/play/`는 `noindex,follow`이며 sitemap에 없다.
- [ ] `dateModified`와 `lastmod`는 실제 콘텐츠 갱신일을 반영한다.

## 2. live URL 확인

배포 후 다음 URL을 브라우저와 HTTP 요청으로 확인한다.

- [ ] `https://dubeeubbee.github.io/moyeoplay/` → 200
- [ ] `https://dubeeubbee.github.io/moyeoplay/sitemap.xml` → 200, XML 본문
- [ ] `https://dubeeubbee.github.io/moyeoplay/games/omok/` → 200
- [ ] 8개 `/games/<slug>/` → 모두 200
- [ ] `/about/`, `/how-to-play/`, `/fairness/`, `/privacy/`, `/terms/`, `/contact/` → 모두 200
- [ ] canonical, title, description, JSON-LD, OG image URL이 live 배포 주소와 일치

GitHub Project Pages에서는 `https://dubeeubbee.github.io/robots.txt`를 이 project repository가 관리할 수 없다. Google은 `robots.txt`를 호스트 root에 두도록 요구하며 하위 디렉터리의 `robots.txt`는 대체가 아니다. [Google robots.txt 위치 규칙](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt)

따라서 project Pages에서는 `/moyeoplay/robots.txt`를 만들어 sitemap을 선언했다고 보고하지 않는다. 아래 sitemap URL을 Search Console에 직접 제출한다.

## 3. Search Console property 소유권

- [ ] Search Console에서 URL-prefix property `https://dubeeubbee.github.io/moyeoplay/`를 추가한다.
- [ ] 운영자 계정으로 현재 배포에 적용 가능한 공식 소유권 검증 방법을 선택한다.
- [ ] Search Console이 제공한 실제 토큰만 사용한다. 이 문서의 예시 문자열을 verification token으로 쓰지 않는다.
- [ ] 검증 완료 화면의 property, 시각, 계정 소유자를 운영 기록에 남긴다. 민감한 토큰 값은 공개 이슈나 문서에 복사하지 않는다.

운영 custom domain으로 이전하면 다음을 별도로 수행한다.

- [ ] 실제 custom domain의 새 property를 추가하고 소유권을 검증한다.
- [ ] custom domain의 root sitemap URL을 새로 제출한다.
- [ ] 이전 Pages URL과 새 canonical/redirect 전략을 점검한다.

## 4. sitemap 수동 제출

제출할 현재 URL:

```text
https://dubeeubbee.github.io/moyeoplay/sitemap.xml
```

Google은 sitemap을 Search Console Sitemaps report에 제출하면 Googlebot 접근 시각과 처리 오류를 확인할 수 있다고 안내한다. [Google sitemap 제출 방법](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

- [ ] Search Console의 해당 property를 선택한다.
- [ ] **Sitemaps** 보고서를 연다.
- [ ] live URL 검사에서 sitemap fetch가 가능한지 확인한다.
- [ ] 위 sitemap URL을 **Add a new sitemap**에 입력하고 수동으로 **Submit**한다.
- [ ] 최종 status가 `Success`인지 확인한다.
- [ ] 현재 로컬 생성 기준 URL 수는 15개이다. Search Console의 실제 **Discovered pages** 수를 별도로 기록하고, 로컬 예상값을 검증 결과처럼 복사하지 않는다.
- [ ] 오류가 있으면 보고서의 fetch/parse 상세를 확인하고 수정 후 다시 제출한다.

`Success`는 sitemap을 읽었다는 의미이지 15개 URL의 색인 완료를 의미하지 않는다.

## 5. URL 검사와 색인 보고서

우선 검사 대상:

1. `https://dubeeubbee.github.io/moyeoplay/`
2. `https://dubeeubbee.github.io/moyeoplay/games/omok/`
3. `https://dubeeubbee.github.io/moyeoplay/games/ladder/`
4. `https://dubeeubbee.github.io/moyeoplay/games/roulette/`
5. `https://dubeeubbee.github.io/moyeoplay/fairness/`
6. `https://dubeeubbee.github.io/moyeoplay/privacy/`

- [ ] URL Inspection에서 live test를 실행하고 page fetch, canonical, indexability를 확인한다.
- [ ] Google이 선택한 canonical이 HTML의 canonical과 일치하는지 확인한다.
- [ ] 필요한 핵심 clean URL에만 수동으로 indexing을 요청한다. 요청이 색인을 보장한다고 기록하지 않는다.
- [ ] `/play/`는 의도적 `noindex`이므로 색인 요청 대상에서 제외한다.
- [ ] Page indexing 보고서에서 ‘Crawled - currently not indexed’, duplicate/canonical, soft 404, blocked resource 상태를 검토한다.
- [ ] 색인 초기에는 검색 노출과 Performance 데이터가 없을 수 있음을 정상적인 미확정 상태로 기록한다.

## 6. 재점검 주기

- 큰 sitemap 변경 후: 실제 URL 및 `lastmod`를 확인하고 필요할 때 수동 재제출
- custom domain 이전 후: 새 property, 소유권, sitemap, canonical, redirect 전체 재검사
- Search Console 오류 통지 후: 오류를 수정한 뒤 보고서에서 수동 확인
- 주요 콘텐츠 갱신 후: 색인 상태와 Google canonical 재확인

## 운영 기록 템플릿

| 날짜         | property      | 작업             | 실제 결과                 | 증거 링크·스크린샷 | 작업자      |
| ------------ | ------------- | ---------------- | ------------------------- | ------------------ | ----------- |
| `YYYY-MM-DD` | 실제 property | 예: sitemap 제출 | `Success` / 오류 / 미확인 | 비민감 증거        | 실제 작업자 |

이 표의 예시를 실제 완료 기록으로 두지 않는다.
