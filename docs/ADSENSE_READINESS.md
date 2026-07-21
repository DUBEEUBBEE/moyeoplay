# AdSense 준비 체크리스트

최종 갱신: 2026-07-21

이 문서는 **코드 준비**, **운영자 수동 작업**, **Google 결과**를 구분한다. 코드와 테스트가 통과해도 AdSense 사이트 연결, 심사 또는 광고 승인을 의미하지 않는다.

## 현재 상태

| 항목                                    | 분류          | 상태             |
| --------------------------------------- | ------------- | ---------------- |
| custom root production artifact         | 코드 준비     | 확인 완료        |
| account meta와 광고 송출 분리           | 코드 준비     | 확인 완료(로컬)  |
| `/play/` 광고 slot 금지                 | 코드 준비     | 확인 완료        |
| CMP adapter의 granted 외 요청 차단      | 코드 준비     | 확인 완료(로컬)  |
| custom-domain TLS·HTTPS redirect        | 외부 Pages    | 미완료 출시 차단 |
| 실제 운영자 이름                        | 운영자 수동   | 미설정           |
| 실제 공개 문의 이메일                   | 운영자 수동   | 미설정           |
| 실제 AdSense client·publisher·slot ID   | 운영자 수동   | 미설정           |
| AdSense Sites에 `moyeoplay.studio` 추가 | 운영자 수동   | 미확인           |
| 사이트 소유권 Verify                    | Google 결과   | 미확인           |
| Request review                          | 운영자 수동   | 미실행           |
| 사이트 상태 `Ready`                     | Google 결과   | 미확인           |
| Google-certified CMP 연결               | 운영자 수동   | 미연결           |
| root `ads.txt` live                     | 운영자·Google | 미실행           |
| 실제 광고 배치·CLS·오클릭 검토          | 운영자 수동   | 미실행           |

승인 전 운영 기본값은 account meta와 광고 모두 `false`다. 실제 AdSense 값, 운영자 실명, 이메일과 CMP를 추측하거나 placeholder로 `dist`에 배포하지 않는다.

## 환경 변수와 책임 경계

| 변수                           | 책임                                 | 검증 규칙                                                      |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| `ADSENSE_ACCOUNT_META_ENABLED` | AdSense 사이트 소유권 확인 meta      | `true`면 실제 형식의 `ADSENSE_CLIENT_ID` 필수                  |
| `ADSENSE_ADS_ENABLED`          | 홈·게임 가이드의 수동 광고 slot      | 승인 전 `false`; client·publisher·slot과 custom root 필요      |
| `ADSENSE_ENABLED`              | 이전 광고 flag 호환                  | 새 flag가 없을 때 migration alias; 새 값과 상충하면 build 실패 |
| `ADSENSE_TEST_MODE`            | 외부 요청 없는 격리 테스트           | `dist` 사용 금지, `dist-*-test`만 허용                         |
| `ADSENSE_CLIENT_ID`            | `ca-pub-` + 16자리 account/client ID | 실제 AdSense가 제공한 값만 사용                                |
| `ADSENSE_PUBLISHER_ID`         | `pub-` + 16자리 publisher ID         | client ID의 숫자와 일치해야 함                                 |
| `ADSENSE_CONTENT_SLOT_ID`      | 수동 반응형 content slot             | 10–20자리 숫자, ads-on profile에서 필요                        |
| `SITE_OPERATOR_NAME`           | About·guide byline의 운영/제작 주체  | 실제 이름이 없으면 비워 두고 readiness 미완료                  |
| `PUBLIC_CONTACT_EMAIL`         | 공개 Contact 이메일                  | 실제 관리 가능한 주소만 사용                                   |
| `PUBLIC_CMP_PROVIDER_NAME`     | 공개할 실제 CMP 이름                 | settings URL과 함께 설정하거나 둘 다 비움                      |
| `PUBLIC_CMP_SETTINGS_URL`      | 동의 선택·거부·철회 설정 경로        | provider 이름과 함께 설정; HTTPS URL만 사용                    |

`ADSENSE_ENABLED`는 기존 배포 설정의 갑작스러운 파손을 막기 위한 migration 경로일 뿐이다. 새 환경에서는 `ADSENSE_ADS_ENABLED`를 명시하고 legacy flag를 제거한다. 두 flag를 동시에 다른 값으로 설정해 조용히 우선순위를 정하지 않는다.

## A. 사이트 소유권 확인 meta

`ADSENSE_ACCOUNT_META_ENABLED=true`이고 실제 형식의 `ADSENSE_CLIENT_ID`가 있을 때만 색인 가능한 정적 페이지의 `<head>`에 다음 형태를 생성한다.

```html
<meta name="google-adsense-account" content="<GOOGLE_PROVIDED_CA_PUB_ID>" />
```

- account meta만 켜도 광고 slot, `.adsbygoogle`, Google 광고 script 또는 광고 network request가 생기면 안 된다.
- `/play/`는 광고 실행 표면이 아니며 초기 profile에서는 account meta도 넣지 않는다. AdSense가 실제 연결 과정에서 다른 범위를 요구하면 운영 증거와 테스트를 함께 갱신한다.
- flag가 켜졌는데 ID가 없거나 형식이 잘못됐거나 placeholder면 production build를 실패시킨다.
- 이 meta는 AdSense 연결용이다. Search Console DNS verification과 혼동하지 않는다.

Google은 사이트 연결 방법 중 하나로 `google-adsense-account` meta를 안내하고, 이후 운영자가 AdSense에서 **Verify**와 **Request review**를 실행하도록 설명한다. [AdSense 사이트 연결 안내](https://support.google.com/adsense/answer/7584263)

## B. 광고 slot 생성

`ADSENSE_ADS_ENABLED=true`일 때만 다음 페이지에 수동 반응형 slot을 만든다.

- 홈 콘텐츠 하단
- 8개 게임 가이드 본문의 독립된 광고 영역

초기 릴리스에서 slot을 만들지 않는 페이지:

- `/play/`와 모든 hash game route
- About, 사용법, 공정성
- Privacy, Terms, Contact

각 광고 영역은 `광고 · Advertisement`처럼 명확히 표시하고 CTA, 게임 시작 링크, 내비게이션, 카드 전체 링크와 분리한다. anchor, vignette, interstitial, pre-roll, auto ads와 자동 새로고침은 초기 릴리스에서 사용하지 않는다. 광고가 꺼지면 빈 광고 상자도 만들지 않는다.

## C. CMP adapter와 광고 요청

slot이 있어도 페이지 로드만으로 Google script를 가져오지 않는다. CMP adapter는 다음 상태를 명시적으로 다룬다.

- `unknown`: 아직 결정을 받지 않음
- `granted`: 필요한 동의가 확인됨
- `denied`: 거부됨
- `withdrawn`: 이전 동의가 철회됨
- `unavailable`: CMP를 불러오지 못함
- `error`: CMP integration 오류

오직 `granted`만 광고 loader 진입을 허용한다. `unknown`, `denied`, `withdrawn`, `unavailable`, `error`에서는 Google script와 ad request가 0이어야 한다. test mode의 `granted`는 DOM marker만 갱신하고 실제 외부 요청을 보내지 않는다.

실제 CMP integration은 현재 상태를 아래 DOM event contract로 adapter에 전달한다. `detail`은 `{ state: ... }` 또는 상태 문자열이며, 허용 값 이외의 입력은 무시한다.

```js
window.dispatchEvent(
  new CustomEvent('moyeoplay:ads-consent-state-changed', {
    detail: { state: 'granted' },
  }),
);
```

기존 `moyeoplay:ads-consent-granted` event는 CMP 자체가 아니라 호환 integration signal이다. 단순 쿠키 banner, page load 또는 localStorage 값만으로 이 event를 발생시키지 않는다. `PUBLIC_CMP_PROVIDER_NAME`과 settings URL을 표시했다고 CMP가 인증·연결됐다고 판단하지 않는다.

Google은 EEA, UK, Switzerland에서 personalized ads를 제공할 때 Google-certified CMP와 IAB TCF integration을 요구한다. 인증 목록과 적용 조건은 운영 시점에 다시 확인한다. Google의 CMP 인증이 모든 개인정보법 준수를 보증하는 것도 아니다. [Google consent management 요구사항](https://support.google.com/adsense/answer/13554116)

## 코드 profile 검사

### 광고 off

- [x] 로컬 운영 profile에서 account meta, slot, `.adsbygoogle`, Google script, 광고 request가 모두 0이다.
- [x] Privacy가 현재 광고 게재가 꺼져 있음을 로컬 운영 build와 일치하게 설명한다.
- [x] 로컬 운영 build의 `/ads.txt`는 실제 publisher ID가 없으므로 404다.

### account-meta-only

- [x] 격리 로컬 profile의 색인 가능한 15개 정적 문서에 유효 account meta가 있다.
- [x] 격리 로컬 profile의 `/play/`에는 meta와 slot이 없다.
- [x] 격리 로컬 profile의 모든 페이지에서 slot, `.adsbygoogle`, Google script와 광고 request가 0이다.
- [x] deployable production artifact에 mock ID가 없다.

### 격리 mock ad-on

- [x] 홈과 8개 가이드에만 slot이 각각 존재한다.
- [x] `/play/`와 6개 trust page에는 slot이 없다.
- [x] consent 전, denied, withdrawn, unavailable, error에서 script와 request가 0이다.
- [x] test-mode granted에서도 실제 외부 request가 0이다.
- [x] Privacy 문구가 ads-on build와 일치한다.
- [x] `ADSENSE_TEST_MODE=true` output은 `dist`가 아니다.

## 신뢰 정보 출시 게이트

- [ ] `SITE_OPERATOR_NAME`에 실제 운영·제작 주체가 설정되고 About와 game guide byline이 일치한다.
- [x] 프로젝트 목적, 직접 설계·테스트한 과정, 공개 저장소와 공정성 문서가 About에서 발견 가능하다.
- [x] AI-assisted hero·icon을 사람이 선택·수정·최적화했다는 공개와 `ASSET_PROVENANCE.md` 연결이 있다.
- [ ] `PUBLIC_CONTACT_EMAIL`에 실제 관리 가능한 도메인 이메일이 설정된다. 미설정 GitHub Issues fallback을 이메일 설정 완료로 간주하지 않는다.
- [x] Privacy가 localStorage keys, GitHub Pages 로그 가능성, 광고 off/on 상태, Google·partner 처리, cookie·web beacon·IP·page URL·browser·device, 선택·거부·철회를 로컬 build와 일치하게 설명한다.
- [ ] 실제 CMP를 연결한 경우에만 provider 이름과 settings/withdrawal URL을 공개한다.

법률 자문을 받았거나 모든 지역의 법률 준수가 보장된다고 쓰지 않는다. 운영 사실과 미확정 상태를 분리한다.

## 운영자 수동 단계

### 1. 호스팅·도메인

- [ ] `https://moyeoplay.studio/`의 DNS, custom TLS 인증서와 HTTPS enforcement를 live에서 확인한다.
- [ ] HTTP→HTTPS와 `www`→apex가 path를 보존하고 loop가 없는지 확인한다.
- [ ] GitHub Pages의 현재 약관·한도와 광고 운영 목적의 적합성을 운영자가 검토한다.

2026-07-21 현재 DNS는 확인됐지만 TLS·HTTPS redirect는 미완료이므로 이 단계는 아직 통과하지 않았다.

### 2. AdSense Sites 연결

- [ ] AdSense 계정에서 실제 publisher·client ID를 확인한다.
- [ ] AdSense **Sites**에 `moyeoplay.studio`를 추가한다.
- [ ] Google이 계정 화면에서 제공한 실제 verification 방법을 선택한다.
- [ ] meta 방식이면 `ADSENSE_ACCOUNT_META_ENABLED=true`와 실제 client ID를 배포한다.
- [ ] live HTML에서 meta를 확인하고 AdSense에서 **Verify**를 실행한다.
- [ ] 운영자가 **Request review**를 실행한다.

Verify 또는 review 요청을 코드가 대신 완료했다고 기록하지 않는다.

### 3. CMP 선택·연결

- [ ] 유입 지역과 광고 유형에 맞는 Google-certified CMP를 실제 공식 목록에서 확인한다.
- [ ] 초기 표시, 허용, 거부, 선택 저장, 설정 변경과 철회 경로를 연결한다.
- [ ] adapter의 6개 상태와 광고 request 0 조건을 production-like 환경에서 확인한다.
- [ ] 실제 provider 이름과 settings URL을 paired 환경 변수로 설정한다.
- [ ] Privacy의 사업자·처리 목적·선택 경로가 실제 CMP와 일치한다.

### 4. Google 결과 확인

- [ ] AdSense Sites 상태가 실제로 `Ready`인지 계정에서 확인한다.
- [ ] 거절·준비 중·정책 제한 상태를 그대로 기록하고 코드 test 통과로 덮지 않는다.
- [ ] 승인 후에만 `ADSENSE_ADS_ENABLED=true`를 검토한다.

## `ads.txt`

`ADSENSE_PUBLISHER_ID`가 실제로 설정된 custom root build에서만 root `ads.txt`를 만든다. 내용은 AdSense 계정이 제공한 snippet과 일치해야 한다.

```text
google.com, <GOOGLE_PROVIDED_PUBLISHER_ID>, DIRECT, f08c47fec0942fa0
```

- [ ] `https://moyeoplay.studio/ads.txt`가 유효한 TLS로 200을 반환한다.
- [ ] Content-Type이 plain text이며 HTML fallback이 아니다.
- [ ] publisher ID가 AdSense 계정과 정확히 일치한다.
- [ ] AdSense Sites의 `ads.txt` 상태를 Google 결과로 별도 기록한다.
- [ ] `/moyeoplay/ads.txt`나 placeholder file을 성공 증거로 쓰지 않는다.

Google은 root `ads.txt`를 강력히 권장하지만 계정 화면의 실제 안내와 상태를 운영자가 확인해야 한다. [Google ads.txt 안내](https://support.google.com/adsense/answer/12171612)

## 실제 광고 배치 검토

- [ ] 광고가 콘텐츠와 명확히 구분되고 게임 시작 CTA처럼 보이지 않는다.
- [ ] 모바일 390×844에서 광고 예약 공간이 주요 CLS를 만들지 않는다.
- [ ] no-fill, ad blocker, script failure에서도 콘텐츠·내비게이션이 정상이다.
- [ ] Canvas, touch controls, 결과 modal, 룰렛·사다리 결과에 광고가 없다.
- [ ] 운영자·개발자·Playwright가 live 광고를 클릭하지 않는다.
- [ ] 자동화는 격리 test mode에서만 slot과 gate를 검사한다.

## 활성화 순서

1. custom-domain TLS·HTTPS·redirect 출시 게이트를 통과한다.
2. 실제 운영자·문의·Privacy·About 정보를 완성한다.
3. Search Console Domain property와 sitemap 상태를 수동 확인한다.
4. AdSense Sites에 도메인을 추가하고 account meta 등 실제 방법으로 Verify한다.
5. Request review를 실행하고 Google 결과를 기다린다.
6. Google-certified CMP와 거부·철회 흐름을 실제 연결한다.
7. 실제 publisher·slot ID와 root `ads.txt`를 확인한다.
8. AdSense Sites 상태가 실제 `Ready`이고 수동 배치 검토가 끝난 뒤에만 `ADSENSE_ADS_ENABLED=true`를 고려한다.

이 체크리스트의 완료도 Google 승인 지속이나 법률 준수를 보증하지 않는다. 실제 승인·거절·제한 상태는 운영자가 AdSense 계정에서 확인한 결과만 사실로 기록한다.
