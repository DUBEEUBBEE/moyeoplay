# 호스팅과 수익화 의사결정

최종 갱신: 2026-07-19

## 현재 결론

- 현재 공개 배포는 `https://dubeeubbee.github.io/moyeoplay/`의 GitHub Project Pages를 기준으로 한다.
- 현재 기본 빌드의 AdSense는 꺼져 있다. `ADSENSE_ENABLED`를 명시하지 않으면 광고 slot과 Google 광고 script를 HTML에 생성하지 않는다.
- GitHub Pages를 계속 쓰는 동안 custom domain을 붙여도 GitHub Pages의 이용 제한은 그대로 적용된다.
- 지속적인 광고 수익화를 운영 목적으로 한다면, 활성화 전에 상업적 정적 사이트를 명시적으로 지원하는 별도 호스트와 자신이 소유한 root domain으로 이전하는 것을 우선 검토한다.

## GitHub Pages 정책과 한계

GitHub은 Pages가 무료 웹 호스팅으로서 online business, e-commerce, 상업적 SaaS를 운영하는 용도로 의도되지 않았고 그런 용도는 허용되지 않는다고 명시한다. 비밀번호나 신용카드 번호 같은 민감한 거래에도 사용하지 말라고 한다. [GitHub Pages limits](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/github-pages-limits)

동일한 공식 문서에 현재 다음 사용량 한계가 기재되어 있다.

- source repository 권장 크기 1GB
- 게시된 Pages 사이트 최대 1GB
- 배포 timeout 10분
- 월 100GB soft bandwidth limit
- 시간당 10회 soft build limit. 단, custom GitHub Actions workflow로 빌드·게시하는 경우에는 해당 build 한계가 적용되지 않는다.

이 저장소의 custom Actions 배포는 자체 build 절차이지 GitHub Pages의 상업적 용도 제한을 제거하는 방법이 아니다. custom domain을 붙여도 실제 origin 호스트가 GitHub Pages라면 같은 정책을 따른다.

단순히 광고 코드가 있다는 사실만으로 모든 Pages 사이트가 즉시 위반이라고 단정하지는 않는다. 하지만 사이트의 주목적이 상업적 서비스 운영으로 변하는 지점에서는 Pages를 수익화 호스트로 간주하지 말고 대체 호스트의 현재 약관을 검토한다.

## project Pages에서 수익화를 바로 켜지 않는 이유

1. `dubeeubbee.github.io`의 호스트 root는 이 project repository가 소유하지 않는다. `/moyeoplay/ads.txt`는 AdSense가 요구하는 root `ads.txt`를 대체하지 못한다.
2. project path는 `/moyeoplay/`를 base로 하므로 root-domain 기준 배포·검증 절차와 다르다.
3. custom domain을 GitHub Pages에 연결하는 것만으로 GitHub Pages 상업적 용도 정책이 변하지 않는다.
4. 현재 코드에는 AdSense 스크립트 로드를 동의 이벤트 뒤로 미루는 연결점만 있고, 운영에 사용할 인증된 CMP 구현은 아직 없다.
5. AdSense 계정, 사이트 심사, 실제 publisher ID·content slot, 소유권 검증은 저장소 코드로 완료할 수 없는 외부 운영 작업이다.

## 대체 정적 호스트 평가

상업적 운영을 위한 호스트를 고를 때는 다음을 비교한다.

- 현재 약관에서 광고·상업적 콘텐츠가 허용되는지
- custom apex/subdomain과 HTTPS
- root `robots.txt`, `sitemap.xml`, `ads.txt` 제어
- Git 연결, preview, rollback, 배포 토큰 권한
- 대역폭, build time, file 수·크기 한계와 초과 비용
- cache header, CSP·security header, redirect 설정
- 로그, 쿠키, 접속 데이터 처리 위치와 계약 조건

현재 앱은 `dist/`만 배포하면 되는 정적 MPA이므로 정적 호스트 이전 장벽은 낮다.

- Cloudflare Pages는 prebuilt asset folder를 Wrangler 또는 drag-and-drop으로 배포할 수 있다. [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- Netlify는 Git repository 연결과 `dist`같은 build/output folder 업로드를 지원한다. [Netlify 배포 안내](https://docs.netlify.com/start/choose-your-path/)

이들은 기술적으로 배포 가능한 예시이지, 현재 요금제·상업적 사용·AdSense 허용을 이 문서가 보증한다는 뜻은 아니다. 선택 시점의 정책과 연동 비용을 운영자가 확인한다.

## 이전 빌드 계약

도메인을 정한 후, placeholder를 그대로 쓰지 말고 실제 검증된 호스트 이름으로 빌드한다.

```bash
CUSTOM_DOMAIN=<YOUR_VERIFIED_HOSTNAME> \
SITE_URL=https://<YOUR_VERIFIED_HOSTNAME>/ \
PAGES_BASE_PATH=/ \
npm run build
```

- `SITE_URL`과 `CUSTOM_DOMAIN`의 hostname은 같아야 한다.
- root-domain 배포의 `PAGES_BASE_PATH`는 `/`이다.
- 호스트의 publish directory는 `dist`다.
- `/games/<slug>/`와 `/play/`같은 directory index URL을 서브해야 한다.
- 이 사이트는 여러 HTML entry를 가진 MPA이므로 모든 URL을 루트 `index.html`로 보내는 SPA rewrite를 무조건 추가하지 않는다.

## 수익화 전 의사결정 게이트

- [ ] 호스트의 현재 약관과 요금제에서 상업적 광고 운영이 허용됨을 운영자가 확인했다.
- [ ] 운영자가 소유·검증한 custom root domain이 있다.
- [ ] custom root 빌드의 canonical, sitemap, `robots.txt`, `ads.txt`가 같은 도메인을 사용한다.
- [ ] Search Console 소유권·sitemap·색인 상태를 운영자가 수동으로 확인했다.
- [ ] AdSense 사이트 검토, 실제 ID, CMP, 개인정보 안내, 광고 배치를 `ADSENSE_READINESS.md`에 따라 검증했다.
- [ ] 실제 광고를 자동화 테스트로 클릭하지 않고, test mode에서만 DOM과 동의 gate를 검사했다.
- [ ] 외부 심사가 완료되지 않은 상태를 ‘승인 완료’로 보고하지 않았다.
