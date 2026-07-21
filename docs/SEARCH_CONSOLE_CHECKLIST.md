# Google Search Console 수동 체크리스트

최종 갱신: 2026-07-21

Search Console 작업은 저장소 배포와 별개다. 이 문서에서 체크되지 않은 항목은 완료로 간주하지 않으며, verification token과 계정 식별 정보는 공개 저장소에 기록하지 않는다.

## 현재 상태

| 항목                                    | 구분        | 상태             |
| --------------------------------------- | ----------- | ---------------- |
| custom-domain canonical·sitemap 코드    | 코드 준비   | 확인 완료        |
| apex·`www` DNS routing                  | 외부 DNS    | 확인 완료        |
| custom-domain TLS·HTTPS redirect        | 외부 Pages  | 미완료 출시 차단 |
| Domain property `moyeoplay.studio` 생성 | 운영자 수동 | 미확인           |
| DNS TXT 소유권 검증                     | 운영자 수동 | 미확인           |
| sitemap 제출                            | 운영자 수동 | 미실행           |
| sitemap `Success`                       | Google 결과 | 미확인           |
| URL Inspection·색인 요청                | 운영자 수동 | 미실행           |
| Google-selected canonical               | Google 결과 | 미확인           |
| Page indexing·Performance               | Google 결과 | 미확인           |

저장소에는 Search Console API, Indexing API, 소유권 verification token 또는 sitemap 자동 제출 workflow가 없다. GitHub Actions 배포 성공을 Search Console 등록 성공으로 간주하지 않는다.

## 1. 배포 전 코드 검사

```bash
npm ci
CUSTOM_DOMAIN=moyeoplay.studio \
SITE_URL=https://moyeoplay.studio/ \
PAGES_BASE_PATH=/ \
npm run build
npm run verify:dist
npm run test:e2e:prod:run
```

- [ ] 15개 색인 문서의 canonical, `og:url`, JSON-LD URL이 `https://moyeoplay.studio/`를 기준으로 한다.
- [ ] `dist/sitemap.xml`에 custom-domain HTTPS URL 15개가 있고 hash URL·`/play/`·noindex URL이 없다.
- [ ] 이전 Pages URL, example domain, placeholder token이 deployable `dist`에 없다.
- [ ] `/play/`는 `noindex,follow`이며 robots에서 차단되지 않고 sitemap에 없다.
- [ ] 실제 내용이 바뀐 페이지만 `dateModified`와 sitemap `lastmod`가 갱신됐다.

## 2. live 출시 게이트

다음 항목이 통과하기 전에는 sitemap 제출을 기술적으로 가능하더라도 안정된 custom-domain 출시 완료로 기록하지 않는다.

- [ ] `https://moyeoplay.studio/`와 15개 색인 URL이 유효한 TLS로 200을 반환한다.
- [ ] `https://moyeoplay.studio/robots.txt`와 `/sitemap.xml`이 200이며 올바른 content type이다.
- [ ] `http://moyeoplay.studio/<path>`가 같은 path의 HTTPS apex로 영구 redirect한다.
- [ ] `https://www.moyeoplay.studio/<path>`가 유효한 인증서로 같은 path의 apex에 redirect한다.
- [ ] 이전 `https://dubeeubbee.github.io/moyeoplay/<path>`가 custom-domain 전략과 일치한다.
- [ ] unknown path는 실제 404이고 색인 문서는 soft 404가 아니다.

2026-07-21 현재 DNS는 확인됐지만 custom-domain TLS가 hostname 검증에 실패했고 HTTP apex는 HTTPS로 redirect되지 않았다. 따라서 이 단계는 **미완료**다.

## 3. Domain property 생성과 DNS 검증

Search Console에서 URL-prefix가 아니라 Domain property `moyeoplay.studio`를 만든다. Domain property는 HTTP/HTTPS와 subdomain 변형을 함께 다루며 DNS provider 검증이 필요하다. [Search Console 소유권 검증 안내](https://support.google.com/webmasters/answer/9008080)

- [ ] Search Console property selector에서 **Domain**을 선택하고 `moyeoplay.studio`를 입력한다.
- [ ] Search Console이 실제로 발급한 TXT 값을 복사한다.
- [ ] Name.com의 apex DNS에 안내받은 TXT record를 추가한다. 예시나 추측값을 사용하지 않는다.
- [ ] TXT가 공개 DNS에서 조회되는지 확인한 뒤 Search Console에서 **Verify**를 실행한다.
- [ ] 검증 성공 시 property, 작업 시각, 계정 소유자와 비민감 증거를 운영 기록에 남긴다.
- [ ] 지속 검증을 위해 Google이 요구하는 TXT를 임의로 제거하지 않는다.

DNS TXT 반영은 지연될 수 있다. 즉시 실패했다고 record를 반복 생성하거나 token을 공개 이슈에 붙이지 않는다.

## 4. sitemap 제출

제출할 URL:

```text
https://moyeoplay.studio/sitemap.xml
```

- [ ] verified `moyeoplay.studio` Domain property를 선택한다.
- [ ] **Sitemaps** 보고서에서 위 URL을 제출한다.
- [ ] Google이 fetch한 시각, HTTP 상태, parse 오류와 최종 status를 확인한다.
- [ ] status가 실제 `Success`일 때만 성공으로 기록한다.
- [ ] 로컬 예상 URL은 15개지만 Search Console의 **Discovered pages** 실제 수를 별도로 기록한다.
- [ ] 오류가 있으면 fetch·parse 상세를 수정한 뒤 다시 제출한다.

`Success`는 sitemap을 읽었다는 뜻이지 15개 URL의 crawl·index를 보장하지 않는다. [Google sitemap 생성·제출 안내](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

## 5. URL Inspection

우선 검사 대상:

1. `https://moyeoplay.studio/`
2. `https://moyeoplay.studio/games/omok/`
3. `https://moyeoplay.studio/games/ladder/`
4. `https://moyeoplay.studio/games/roulette/`
5. `https://moyeoplay.studio/fairness/`
6. `https://moyeoplay.studio/privacy/`

- [ ] 각 URL에서 live test를 실행하고 page fetch, indexability와 rendered result를 확인한다.
- [ ] user-declared canonical과 Google-selected canonical이 custom apex로 일치하는지 기록한다.
- [ ] 핵심 clean URL에만 필요할 때 **Request indexing**을 실행한다.
- [ ] 색인 요청을 즉시 색인 또는 노출 보장으로 기록하지 않는다.
- [ ] `https://moyeoplay.studio/play/`는 의도적 `noindex,follow`인지 확인하고 색인 요청하지 않는다.

## 6. 이전 Pages URL과 중복 canonical

- [ ] 이전 Pages root와 nested guide가 같은 path의 HTTPS custom apex로 redirect하는지 확인한다.
- [ ] redirect 전후에 loop·HTTP downgrade·path 손실이 없다.
- [ ] URL Inspection에서 이전 URL이 custom-domain canonical로 처리되는지 확인한다.
- [ ] Page indexing 보고서의 alternate page, duplicate, canonical 선택 상태를 실제 결과로 기록한다.

이전 host redirect는 GitHub Pages 외부 설정의 영향을 받으므로 HTML canonical만 맞다고 완료 처리하지 않는다.

## 7. Page indexing과 Performance

- [ ] `Not found (404)`, soft 404, blocked resource, server error를 검토한다.
- [ ] `Crawled - currently not indexed`, `Discovered - currently not indexed`를 페이지별로 기록한다.
- [ ] duplicate/canonical 사유가 의도와 맞는지 확인한다.
- [ ] 모바일 usability와 Core Web Vitals의 실제 field data가 생기면 검토한다.
- [ ] 초기에는 Performance 데이터가 없을 수 있음을 미확정 상태로 남긴다.

## 운영 기록 템플릿

| 날짜         | property      | 분류                 | 작업             | 실제 결과                 | 비민감 증거   | 작업자      |
| ------------ | ------------- | -------------------- | ---------------- | ------------------------- | ------------- | ----------- |
| `YYYY-MM-DD` | 실제 property | 코드 / 수동 / Google | 예: sitemap 제출 | `Success` / 오류 / 미확인 | 링크·스크린샷 | 실제 작업자 |

예시 행을 실제 완료 기록으로 두지 않는다. token, DNS verification value, 계정 이메일은 표에 저장하지 않는다.
