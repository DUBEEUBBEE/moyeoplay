# AdSense 준비 체크리스트

최종 갱신: 2026-07-19

## 준비 상태

**현재 AdSense는 기본 off이다. 이 저장소는 AdSense 승인, 사이트 심사 통과, 실제 광고 송출을 보증하지 않는다.**

| 항목                        | 현재 상태              |
| --------------------------- | ---------------------- |
| 기본 빌드 광고              | off                    |
| 실제 AdSense client ID      | 저장소에 설정되지 않음 |
| 실제 publisher ID           | 저장소에 설정되지 않음 |
| 실제 content slot ID        | 저장소에 설정되지 않음 |
| custom root domain          | 미지정                 |
| site ownership verification | 미실행                 |
| Google site review          | 미실행                 |
| Google-certified CMP        | 미구현                 |
| root `ads.txt` live 확인    | 미실행                 |
| Search Console 색인 확인    | 미실행                 |
| 실제 광고 배치 수동 검토    | 미실행                 |

`package.json`의 root test 명령에 들어 있는 `moyeoplay.example`, `ca-pub-1234567890123456`, `pub-1234567890123456`, `1234567890`은 자동화 검사 전용 placeholder다. 실제 도메인, 계정, publisher, slot 값이 아니며 운영 빌드에 사용하지 않는다.

## 현재 코드의 보호 장치

`scripts/site-config.mjs`는 다음을 강제한다.

- `ADSENSE_ENABLED`의 기본값은 `false`다.
- 활성화 빌드는 `ADSENSE_CLIENT_ID`, `ADSENSE_PUBLISHER_ID`, `ADSENSE_CONTENT_SLOT_ID`를 모두 요구한다.
- client ID는 `ca-pub-` + 16자리 숫자, publisher ID는 `pub-` + 16자리 숫자, slot ID는 10–20자리 숫자 형식이어야 한다.
- client ID와 publisher ID의 16자리 숫자가 일치해야 한다.
- 실제 광고 빌드는 `CUSTOM_DOMAIN`과 root `PAGES_BASE_PATH=/`를 요구한다.
- `ADSENSE_TEST_MODE=true`는 배포 디렉터리 `dist`를 사용할 수 없다. 테스트 빌드가 운영 artifact로 올라가는 것을 막는다.

`scripts/generate-site.mjs`와 `src/static-site.ts`의 현재 동작은 다음과 같다.

- off 빌드에서는 `[data-adsense-slot]`, `.adsbygoogle`, Google 광고 script를 HTML에 생성하지 않는다.
- on 빌드에서만 정적 홈과 8개 게임 가이드에 광고 slot을 추가한다.
- 터치·키보드 조작이 집중된 `/play/`, privacy, terms, contact 페이지에는 광고 slot을 넣지 않는다.
- slot은 ‘광고’로 라벨되고 최소 높이를 예약한다.
- 실제 Google script는 `moyeoplay:ads-consent-granted` 이벤트가 발생하기 전에는 요청하지 않는다.
- test mode에서는 동의 이벤트 후에도 Google network request를 보내지 않고 DOM 상태만 검사한다.

중요: 현재 저장소에는 실제 CMP 배너, 동의 저장·철회, IAB TCF 연동이 없다. custom event listener는 CMP가 아니라 향후 연결을 위한 gate일 뿐이다. 따라서 ID만 넣고 운영 광고를 켜서는 안 된다.

## 1. 호스팅과 custom domain

- [ ] GitHub Pages 상업적 용도 제한과 대체 호스트 조건을 `HOSTING_AND_MONETIZATION.md`에 따라 검토했다.
- [ ] 상업적 광고 운영을 허용하는 호스트를 현재 약관으로 확인했다.
- [ ] 운영자가 소유·검증한 custom root domain을 확정했다.
- [ ] `CUSTOM_DOMAIN`, `SITE_URL=https://<YOUR_VERIFIED_HOSTNAME>/`, `PAGES_BASE_PATH=/`를 서로 일치시켰다.
- [ ] placeholder domain을 운영값으로 사용하지 않았다.
- [ ] HTTPS, DNS, canonical, root sitemap, root `robots.txt`를 live 도메인에서 확인했다.

GitHub Project Pages의 `/moyeoplay/ads.txt`는 호스트 root `ads.txt`가 아니다. 실제 수익화 빌드는 root domain에서 `https://<YOUR_VERIFIED_HOSTNAME>/ads.txt`를 제어할 수 있어야 한다.

## 2. 콘텐츠·정책·검색 상태

- [ ] 홈과 8개 게임 가이드가 JavaScript 없이도 충분한 규칙·조작·공정성 콘텐츠를 제공하는지 수동 검토했다.
- [ ] 홈, 게임 가이드, privacy, terms, contact, fairness, how-to-play의 내부 링크와 내비게이션이 정상이다.
- [ ] Privacy는 광고 활성 시 Google·partner 데이터 처리, 쿠키·유사 기술, 동의 관리를 실제 구현과 일치하게 설명한다.
- [ ] Terms가 오락 목적, 사용자 입력, 외부 서비스와 한계를 설명한다.
- [ ] Contact에 실제 운영 이메일을 설정하거나, 없으면 GitHub Issues fallback이 보인다. 가짜 이메일을 게시하지 않는다.
- [ ] `SEARCH_CONSOLE_CHECKLIST.md`의 수동 소유권, sitemap, 색인 상태를 실제로 확인했다.

Google은 AdSense 참여 전에 자체 콘텐츠, 정책 준수, HTML source 수정 권한 등을 확인하도록 안내한다. [AdSense 참여 요건](https://support.google.com/adsense/answer/9724)

## 3. 실제 AdSense ID와 site verification

- [ ] AdSense 계정에서 실제 publisher ID를 확인했다.
- [ ] 실제 ad code의 `ca-pub-...` client ID를 확인했다.
- [ ] 실제 content ad unit의 slot ID를 확인했다.
- [ ] client ID와 publisher ID가 같은 16자리 계정 숫자를 가리키는지 확인했다.
- [ ] 이 ID들을 소스, 문서, 이슈, 스크린샷에 불필요하게 저장하지 않고 배포 환경 값으로 관리한다.
- [ ] AdSense Sites에 실제 custom domain을 추가했다.
- [ ] Google이 제공한 실제 site verification 방법을 구현하고 **Verify**를 완료했다.
- [ ] 운영자가 AdSense 계정에서 **Request review**를 직접 실행했다.
- [ ] Sites 상태가 실제로 `Ready`인지 확인했다. 코드 검사 통과를 AdSense 승인으로 적지 않았다.

Google의 publisher ID는 `pub-1234567890123456`과 같은 형식이며, 계정 정보 또는 실제 ad code에서 확인할 수 있다. [publisher ID 확인 방법](https://support.google.com/adsense/answer/105516)

Google은 사이트 전체를 정책 기준으로 검토하며, 사이트가 승인되기 전에는 광고를 표시할 수 없다고 안내한다. 심사는 Google 계정에서 수행되므로 저장소 테스트가 승인을 보장할 수 없다. [AdSense site 연결·심사 안내](https://support.google.com/adsense/answer/7584263)

## 4. certified CMP와 동의 흐름

Google은 EEA, UK, Switzerland 사용자에게 personalized ads를 제공하는 publisher product 파트너에게 Google-certified CMP와 IAB TCF 연동을 요구한다. CMP 인증이 해당 CMP의 모든 개인정보법 준수를 Google이 보증한다는 뜻은 아니며, 적용 법률과 동의 설계의 책임은 publisher에게 있다. [EEA·UK·Switzerland CMP 요구사항](https://support.google.com/adsense/answer/13554116)

- [ ] 유입 지역과 광고 유형을 고려해 Google 인증 CMP를 선택했다.
- [ ] CMP의 실제 인증 상태와 지원 platform을 Google 공식 목록에서 현재 시점으로 확인했다.
- [ ] 초기 동의 표시, 선택 저장, 동의 거부, 설정 변경·철회 경로를 구현했다.
- [ ] CMP가 실제로 필요한 광고 동의를 확인한 후에만 `moyeoplay:ads-consent-granted`를 발생시킨다.
- [ ] 거부·철회·CMP 로드 실패에서 Google ad script와 ad request가 발생하지 않는지 검사했다.
- [ ] 동의 상태를 임의로 추정하거나 단순 page load를 동의로 간주하지 않는다.
- [ ] Privacy 페이지에 실제 CMP 사업자, 쿠키·유사 기술, 처리 목적, 선택·철회 방법을 실제 구현과 일치하게 반영했다.

## 5. `ads.txt`

Google은 `ads.txt`를 필수는 아니지만 강력히 권장하며, 해당 사이트의 root directory에 게시하도록 안내한다. Google이 제시한 AdSense 기본 형식은 다음과 같다. [Google ads.txt 안내](https://support.google.com/adsense/answer/12171612)

```text
google.com, pub-<YOUR_REAL_16_DIGIT_PUBLISHER_ID>, DIRECT, f08c47fec0942fa0
```

위 placeholder를 파일에 그대로 써서 배포하지 않는다. AdSense 계정이 제공한 실제 snippet을 기준으로 한다.

현재 생성기는 base `/`인 root 빌드에서 `ADSENSE_PUBLISHER_ID`가 있을 때 다음 형식의 root `ads.txt`를 만든다. 실제 광고 활성화는 test mode가 아닌 경우 검증된 `CUSTOM_DOMAIN`도 별도로 요구한다.

```text
google.com, <ADSENSE_PUBLISHER_ID>, DIRECT, f08c47fec0942fa0
```

- [ ] 실제 파일이 `https://<YOUR_VERIFIED_HOSTNAME>/ads.txt`에서 200으로 열린다.
- [ ] Content-Type이 읽을 수 있는 plain text이고 HTML fallback을 반환하지 않는다.
- [ ] publisher ID가 AdSense 계정과 정확히 일치한다.
- [ ] project Pages의 `/moyeoplay/ads.txt`를 root `ads.txt` 검증 성공으로 기록하지 않는다.
- [ ] AdSense Sites에서 `ads.txt` 상태를 수동으로 확인했다. 반영에 시간이 걸릴 수 있음을 오류로 즉시 단정하지 않는다.

## 6. Google과 partner 데이터 안내

Google은 Google 서비스를 사용하는 사이트·앱에서 IP 주소, cookie, page URL, browser·device 정보 등을 사용해 서비스 제공, 광고 측정, 부정 행위 방지, 선택에 따른 개인화 등을 수행할 수 있다고 안내한다. 비개인화 광고를 선택해도 광고 효과 측정과 부정 방지 같은 다른 처리가 계속될 수 있다. [Google partner sites 데이터 안내](https://policies.google.com/technologies/partner-sites)

- [ ] Privacy 문구가 ‘비개인화=데이터 미처리’로 오해할 표현을 쓰지 않는다.
- [ ] 광고를 활성화한 빌드의 Privacy 페이지가 Google·partner 처리와 동의 경로를 실제로 보여 준다.
- [ ] CMP와 Google 관련 정책을 운영 시점의 현재 문서로 다시 확인했다.

## 7. 광고 배치·CLS·잘못된 클릭 검토

현재 코드가 광고를 `/play/`에 넣지 않는 것은 실시간 게임 조작과 광고 클릭을 분리하는 기본 보호 장치다. 그러나 실제 광고 크리에이티브와 모바일 layout은 외부 script 없이 수행한 테스트로 완전히 검증할 수 없다.

- [ ] 광고가 루트·게임 가이드의 콘텐츠와 시각적으로 구분되고 ‘광고’ 표시가 있다.
- [ ] 광고가 게임 카드, 내비게이션, 다운로드, 시작 버튼처럼 보이지 않는다.
- [ ] 유의미한 높이를 미리 예약해 주요 CLS를 막고, 로드 실패 시 거대한 빈 공간이 남지 않는다.
- [ ] 게임 컨트롤·CTA·반복 터치 영역과 광고 사이에 충분한 거리가 있다. 게임 경계에 인접한 배치라면 최소 150px 간격 기준을 수동으로 확인한다.
- [ ] anchor, vignette, overlay 광고가 게임 화면을 덮지 않는다.
- [ ] hash route 변경, 라운드 종료, 다시 하기마다 광고를 재요청하지 않는다.
- [ ] 사용자 요청 없는 auto refresh를 추가하지 않았다.

## 8. 무효 트래픽과 운영자 클릭

Google은 publisher가 자신의 광고를 클릭하는 것을, 광고 목적지가 궁금한 경우라도, 금지한다. 자동·수동으로 impression과 click을 부풀리거나 다른 사람에게 광고 클릭을 요청해서도 안 된다. [Google 무효 트래픽 방지 안내](https://support.google.com/adsense/answer/1112983)

- [ ] 운영자, 개발자, QA 담당자가 live 광고를 클릭하지 않는다.
- [ ] Playwright, link checker, visual test, bot이 live 광고 크리에이티브를 클릭하지 않는다.
- [ ] 자동화는 `ADSENSE_TEST_MODE=true`와 배포되지 않는 별도 output directory에서만 광고 DOM을 검사한다.
- [ ] 광고 클릭, 새로고침, 노출을 대가·응원·벌칙과 연결하지 않는다.

## 활성화 절차

1. 호스트 정책과 custom root domain을 확정한다.
2. 정적 콘텐츠, Privacy, Terms, Contact, Search Console 색인 상태를 수동 검토한다.
3. AdSense 계정에서 실제 사이트를 추가하고 소유권 검증과 심사를 요청한다.
4. certified CMP와 동의·철회 흐름을 구현하고 실제 상태에서 검사한다.
5. 실제 client, publisher, content slot ID를 배포 환경 값에 설정한다.
6. root `ads.txt`와 AdSense Sites 상태를 수동으로 확인한다.
7. test mode에서 slot, 동의 gate, network 미요청, 페이지 배치를 검사한다.
8. Google 심사 상태가 실제 `Ready`이고 법·정책·배치 검토가 끝난 후에만 운영 빌드의 `ADSENSE_ENABLED=true`를 검토한다.

이 체크리스트의 완료는 Google의 승인을 보장하지 않는다. 실제 승인·거절·제한 상태는 운영자가 AdSense 계정에서 확인한 결과만 사실로 기록한다.
