# 호스팅과 수익화 의사결정

최종 갱신: 2026-07-21

## 현재 결론

- 운영 후보 URL은 `https://moyeoplay.studio/`이며 GitHub Pages custom-domain artifact와 DNS가 구성돼 있다.
- 2026-07-21 현재 custom-domain TLS 인증서와 HTTPS enforcement는 완료되지 않았다. HTTP apex도 HTTPS로 redirect되지 않으므로 출시 차단 상태다.
- AdSense account 확인 meta와 실제 광고 송출은 분리한다. 광고는 기본 off이고 Google 결과·CMP·배치 검토 전에는 켜지 않는다.
- custom domain이 있어도 origin이 GitHub Pages이면 GitHub Pages의 현재 약관과 사용량 한도가 그대로 적용된다.
- AdSense가 있는 모든 Pages 사이트가 무조건 금지라고 단정하지 않는다. 반대로 custom domain이나 비상업적 게임 설명이 있다는 이유만으로 수익화 운영 적합성이 자동 보장된다고도 판단하지 않는다.
- 운영자는 사이트의 실제 주목적, 광고 규모, 트래픽과 향후 사업 모델을 기준으로 현재 GitHub 문서를 재검토하고 필요하면 GitHub Support 또는 적절한 자문을 이용한다.

## GitHub Pages의 현재 공식 제한

2026-07-21 확인한 GitHub 공식 문서는 Pages를 online business, e-commerce 또는 상업적 거래·상업적 SaaS를 주목적으로 하는 무료 호스팅 용도로 사용하도록 의도하지 않았고 허용하지 않는다고 설명한다. 비밀번호·신용카드 같은 민감한 거래에도 사용하지 말라고 안내한다. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

같은 문서가 기재한 사용량 기준:

- source repository 권장 크기 1GB
- 게시된 Pages 사이트 최대 1GB
- 배포 timeout 10분
- 월 100GB soft bandwidth limit
- 시간당 10회 soft build limit. custom GitHub Actions workflow로 build·publish하는 경우 이 build limit은 적용되지 않음
- 서비스 품질을 위한 rate limit 가능성

이 저장소의 custom Actions 배포는 build 방식만 바꾼다. 상업적 목적 제한, 용량·대역폭과 rate limit 판단을 제거하지 않는다.

공식 문서는 ‘광고 코드가 한 줄이라도 있으면 금지’라는 규칙을 따로 제시하지 않는다. 따라서 AdSense 사용을 자동 위반이라고 단정하지 않되, 광고 수익이 사이트의 주목적이 되거나 online business 운영으로 발전하면 Pages 적합성을 다시 판단하고 대체 호스트를 우선 검토한다.

## custom domain과 HTTPS

운영 단일 기준:

```text
CUSTOM_DOMAIN=moyeoplay.studio
SITE_URL=https://moyeoplay.studio/
PAGES_BASE_PATH=/
```

GitHub Actions 방식에서는 artifact의 `CNAME`이 Pages custom domain을 설정하지 않는다. **Settings → Pages의 Custom domain**, DNS provider records, custom TLS 인증서와 **Enforce HTTPS**를 별도로 확인한다. GitHub는 apex에 `A`/`AAAA` 또는 `ALIAS`/`ANAME`, `www`에 default Pages host를 향한 CNAME을 안내하며 wildcard DNS를 피하라고 권고한다. [GitHub Pages custom domain 안내](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

현재 확인 결과:

| 항목                       | 상태      |
| -------------------------- | --------- |
| apex A 4개                 | 확인 완료 |
| `www` CNAME                | 확인 완료 |
| Pages artifact 배포        | 확인 완료 |
| custom hostname TLS        | 미완료    |
| Enforce HTTPS              | 미완료    |
| HTTP→HTTPS path redirect   | 미완료    |
| secure `www`→apex redirect | 미검증    |

DNS만 맞는 상태를 HTTPS 완료로 보고하지 않는다.

## 수익화 전에 필요한 세 경계

### 1. 사이트 확인

`ADSENSE_ACCOUNT_META_ENABLED=true`는 Google이 제공한 실제 client ID로 account meta만 만든다. 광고 slot, Google script와 광고 request를 만들지 않는다. AdSense의 **Verify**와 **Request review**는 운영자가 외부 계정에서 실행한다.

### 2. 광고 surface

`ADSENSE_ADS_ENABLED=true`만 홈과 8개 게임 guide에 수동 slot을 만든다. `/play/`, Canvas, touch controls와 trust page에는 slot을 두지 않는다. legacy `ADSENSE_ENABLED`는 migration alias일 뿐 새 운영 설정으로 유지하지 않는다.

### 3. 동의와 요청

광고 slot이 있어도 CMP adapter가 `granted`를 전달하기 전에는 Google script를 불러오지 않는다. denied, withdrawn, unavailable, error에서는 request가 0이어야 한다. adapter와 호환 event는 CMP 자체가 아니며 실제 Google-certified CMP를 별도로 선택·연결한다.

## 대체 정적 호스트 평가

수익화 운영에 더 적합한 host를 검토할 때 다음을 비교한다.

- 현재 약관과 요금제에서 광고·상업적 콘텐츠가 허용되는지
- custom apex/`www`, managed TLS와 redirect
- root `robots.txt`, `sitemap.xml`, `ads.txt` 제어
- Git 연결, preview, rollback과 deploy token 권한
- 대역폭, build time, file 수·크기 한계와 초과 비용
- cache·security header, CSP, redirect 설정
- access log, cookie와 접속 데이터 처리 위치·계약

모여PLAY는 서버 런타임이 없는 정적 MPA이므로 다음 계약을 유지하면 host 이전 장벽이 낮다.

```bash
CUSTOM_DOMAIN=moyeoplay.studio \
SITE_URL=https://moyeoplay.studio/ \
PAGES_BASE_PATH=/ \
npm run build
```

- publish directory는 `dist`다.
- `/games/<slug>/`, `/play/` 같은 directory index URL을 제공해야 한다.
- 모든 URL을 root `index.html`로 보내는 SPA rewrite를 무조건 적용하지 않는다.
- canonical·manifest·root files는 GitHub repository path가 아니라 root profile을 사용한다.

Cloudflare Pages는 prebuilt asset folder의 Direct Upload를, Netlify는 Git 연결 또는 output folder 배포를 지원한다. 이는 기술적 후보 예시이지 현재 요금제·상업적 사용·AdSense 허용을 이 문서가 보증한다는 뜻은 아니다. [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Netlify 배포 안내](https://docs.netlify.com/start/choose-your-path/)

호스트 이전은 이번 hardening의 필수 범위가 아니다. 현재 Pages에서 안전한 출시 조건을 확인하는 일과 장기 수익화 host 결정을 분리한다.

## 운영 결정 기록

- [ ] custom-domain TLS·HTTPS enforcement·redirect가 live에서 통과했다.
- [ ] GitHub Pages의 현재 약관과 프로젝트의 실제 목적을 운영자가 검토했다.
- [ ] custom domain이 약관 검토를 면제하지 않는다는 점을 확인했다.
- [ ] 실제 운영자·문의·Privacy 정보를 공개했다.
- [ ] Search Console property·sitemap·색인 상태를 실제 계정에서 확인했다.
- [ ] AdSense Sites Verify·Request review와 Google 결과를 구분해 기록했다.
- [ ] Google-certified CMP의 실제 연결과 거부·철회 흐름을 확인했다.
- [ ] 승인 후 ads-on profile의 배치·CLS·오클릭 위험을 수동 검토했다.
- [ ] traffic·광고 목적이 커질 때 대체 host 재평가 조건을 정했다.

현재는 첫 항목부터 미완료이므로 수익화 출시 승인 상태가 아니다.
