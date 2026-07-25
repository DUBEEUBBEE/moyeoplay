# Search Console·AdSense 신청 후 안정화 운영

최종 갱신: 2026-07-26

이 문서는 Search Console 등록·사이트맵 제출과 AdSense 사이트 확인·검토 요청 이후의 변경 동결 기준을 정한다. 코드와 라이브 검사가 통과해도 Google이 선택한 canonical, 색인 수, AdSense 검토 단계 또는 승인 결과를 뜻하지 않는다.

## 현재 단계와 확인 경계

- 운영자 작업: Search Console 도메인 속성 등록과 sitemap 제출, AdSense 사이트 연결·확인과 검토 요청을 완료했다.
- 2026-07-26 라이브 기술 표면: custom-domain HTTPS, HTTP·`www`·이전 Pages URL의 path 보존 영구 redirect, 15개 색인 문서, sitemap·robots, account-meta-only, `/play/` noindex·no-ads를 확인했다.
- 코드 변경 전 확인된 결함: 알 수 없는 경로가 올바른 404 status를 반환하지만 GitHub 기본 오류 문서를 사용했다. 이 변경에서 branded `noindex,follow` 404 artifact와 배포 후 회귀 검사를 추가한다.
- 외부 계정 결과: 현재 Search Console 색인 범위·Google-selected canonical, AdSense의 현재 검토 단계·`Ready`·승인·거절 결과는 이 감사에서 확인하지 않았다.
- 광고 송출: `ADSENSE_ADS_ENABLED=false`를 유지한다. account 확인 meta와 root `ads.txt`가 있어도 광고 slot, script 또는 request를 켜지 않는다.

GitHub Pages의 custom domain, 인증서와 Enforce HTTPS는 repository artifact의 `CNAME`만으로 설정되지 않는다. redirect나 TLS가 실패하면 **Settings → Pages**와 DNS를 운영자가 직접 확인하며 JavaScript redirect로 대체하지 않는다.

## 심사 중 허용하는 수정

- 끊어진 내부 링크와 잘못된 fragment target
- 실제 404·soft 404, redirect, canonical, sitemap·robots 오류
- AdSense account meta 누락·중복과 광고 off invariant 위반
- 런타임·접근성 오류, 심각한 오탈자와 사실 오류
- 개인정보·신뢰 페이지 설명과 실제 구현의 불일치
- 기존 계약을 지키는 테스트, 라이브 감사, 로그 redaction 강화

문제를 고친 경우에도 실제로 바뀐 문서의 날짜만 갱신한다.

## 심사 결과 전 보류

- 대규모 UI 개편과 정보 구조 변경
- URL 변경, 가이드 삭제·병합, title·canonical 일괄 변경
- 대량 신규 SEO 페이지, 얕은 FAQ, 키워드 반복 콘텐츠
- Auto ads, anchor·vignette·interstitial·pre-roll, 자동 새로고침
- 실제 광고 slot·script·request와 `/play/` 주변 광고
- 분석·추적 도구의 충동적 추가
- 실제 인증 CMP가 아닌 자체 쿠키 배너
- Search Console sitemap 반복 제출과 AdSense 검토 재요청 자동화

## 배포와 라이브 감사

로컬에서는 다음 순서로 artifact와 브라우저 계약을 확인한다.

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
```

배포 후 workflow는 쓰기 권한이 없는 `npm run audit:live`와 Playwright live smoke를 실행한다. 감사 출력은 account meta의 존재·형식·일치 여부, 광고 DOM·script·request 개수만 기록하고 실제 client·publisher·slot 값은 기록하지 않는다. Search Console이나 AdSense API에 제출·변경 작업을 하지 않는다.

수동으로 현재 배포를 검사할 때:

```bash
E2E_LIVE_URL=https://moyeoplay.studio/ \
AUDIT_REQUIRE_BRANDED_404=true \
npm run audit:live

E2E_LIVE_URL=https://moyeoplay.studio/ \
E2E_CHECK_REDIRECTS=true \
E2E_REQUIRE_BRANDED_404=true \
npm run test:e2e:live
```

PR은 새 Pages 배포를 만들지 않는다. 따라서 새 404의 라이브 확인은 `main` 병합·배포 후 live-smoke가 성공해야 완료로 기록한다.

## legacy 광고 flag 이전

`ADSENSE_ENABLED`는 기존 배포를 갑자기 깨뜨리지 않기 위한 호환 alias다. 값 자체를 로그에 출력하지 않고 존재할 때 deprecation warning만 남긴다.

1. repository 운영 변수에 `ADSENSE_ADS_ENABLED=false`를 명시한다.
2. account-meta-only build와 배포 후 live smoke 성공을 확인한다.
3. 그 뒤 legacy `ADSENSE_ENABLED` 운영 변수를 제거한다.
4. 코드의 alias는 호환 기간 뒤 별도 변경에서 제거한다.

두 flag가 다르면 build를 실패시킨다. legacy 값이 있더라도 심사 동결 중 광고를 자동 활성화하지 않는다.

## 승인 후에만 할 작업

1. 운영자가 AdSense Sites의 실제 상태가 `Ready`인지 직접 확인한다.
2. 적용 지역과 광고 유형에 맞는 Google-certified CMP 또는 Google Privacy & messaging을 연결한다.
3. 동의·거부·설정 변경·철회와 오류 상태에서 광고 request를 검증한다.
4. 수동 slot의 모바일 CLS, 콘텐츠 구분과 오클릭 위험을 실제 기기에서 검수한다.
5. 위 조건이 모두 충족된 뒤 별도 PR에서만 `ADSENSE_ADS_ENABLED=true`를 검토한다.

Auto ads는 이 절차와 별도인 실험·검수 전까지 계속 끈다. Canvas, 게임 시작 버튼, 터치 조작과 결과 화면은 계속 광고 금지 영역이다.

## 거절된 경우의 대응

- Low value content: 페이지 수를 억지로 늘리지 않는다. 실제 게임 업데이트·사용 사례·신규 기능과 직접 연결된 고유 문서만 추가한다.
- Site down or unavailable: DNS, TLS, redirect, robots와 verification meta를 먼저 재현·수정한다.
- Policy issue: 정책 센터가 지정한 정확한 페이지와 정책을 기준으로 수정한다.
- Navigation: broken link, 모바일 메뉴, 정책·문의 발견성을 수정한다.
- Duplicate or replicated content: 이전 Pages URL의 HTTP 상태와 path 보존 redirect, canonical을 먼저 확인한다.

거절 사유를 추측해 사이트 전체를 다시 쓰거나 검토 요청을 자동 반복하지 않는다.

## 운영자가 계정에서 직접 확인할 항목

- Search Console의 현재 색인 페이지 수, 제외 사유와 Google-selected canonical
- sitemap의 마지막 읽기 결과와 오류
- AdSense Sites의 현재 검토 단계, `Ready`, 승인·거절·정책 제한
- AdSense 계정의 `ads.txt` 상태
- 실제 CMP의 인증 상태와 지역별 메시지

계정 화면의 상태를 확인하지 않은 경우 `NOT_TESTED`로 남긴다.
