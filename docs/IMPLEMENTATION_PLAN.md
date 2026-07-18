# 모여PLAY 프로덕션 전환 계획

> 이 문서는 v1.0 착수 당시의 기준선과 완료된 마이그레이션 결정을 보존한 기록이다. 현재 운영 구조와 명령은 `README.md`, v1.1 공정성·배포 검증은 `docs/ARCHITECTURE.md`와 `docs/QA.md`를 기준으로 한다.

## 1. v1.0 착수 당시 구조와 문제점

- `index.html`, `styles.css`, `app.js` 세 파일에 5개 게임과 앱 쉘이 결합된 정적 프로토타입이다.
- 2,007줄의 `app.js`가 라우팅, 사운드, Canvas 스케일링, 입력, 물리, 판정, DOM 렌더링을 모두 소유한다. 순수 로직을 독립 테스트하기 어렵고 게임 전환 시 자원 소유권이 불명확하다.
- 하나의 전역 `requestAnimationFrame` 루프가 항상 실행되며, 탭 비활성화 자동 일시정지와 게임별 `destroy()` 계약이 없다.
- 해시 라우팅은 `#omok`을 사용하여 요구된 `#game/omok` 규칙, 잘못된 해시 복구, 동적 import가 없다.
- 사운드 on/off 외에 볼륨, 모션 줄이기, 플레이어 이름, 세션 승수, 최근 결과 저장이 없고 손상된 `localStorage` 대응도 없다.
- 공통 HUD에 시작/일시정지, 전체화면, 설정, 결과 후 랜덤 다음 게임이 없다. Canvas 상태의 텍스트/라이브 영역 전달도 제한적이다.
- 오목은 매치 승점 설정/선공 교대가 없고, 탁구·배구는 5점 고정이며 명시적 상태 머신과 고정 타임스텝이 없다. 핀볼은 비결정적 난수와 결합되어 재현 테스트가 어렵다.
- 반응속도 대결, 탭 배틀, 벌칙 룰렛이 없고 로비에 동작하지 않는 “다음 게임” 카드가 남아 있다.
- 빌드, strict 타입 검사, 린트, 포맷, 단위/E2E/접근성 테스트, CI/CD가 전무하다.
- 초기 브라우저 기준선에서 1440×900, 390×844 로비와 오목 진입은 실행되었으나 favicon 요청 오류가 초기에 관찰되었고, 설정/결과 모달과 키보드 포커스 트랩은 없다.
- 착수 당시 작업 경로에는 `.git`과 원격 정보가 없고 `gh` CLI도 없었다. 실제 소유자/저장소명, Pages base, 공개 URL은 임의로 조작하지 않고 배포 단계에서 검증하기로 했다.

## 2. 목표 구조

```text
src/
  main.ts
  app/              # 라우터, 앱 쉘, 세션/설정 저장소
  components/       # 모달, 토스트, 카드, 공통 HUD
  core/             # 게임 계약, 루프, 입력, 오디오, Canvas, RNG, 저장소
  games/<game>/     # 게임별 controller, logic, render
  styles/           # 토큰, 기본, 컴포넌트, 반응형
tests/e2e/          # Playwright 사용자 흐름·axe·반응형 검사
public/             # favicon, manifest, robots, sitemap
docs/               # 구조·규칙·구현 문서
```

- Vite + strict TypeScript를 사용하고 런타임 CDN 없이 자체 CSS/SVG/Web Audio로 구성한다.
- 각 게임은 `MiniGameController` 생명주기를 준수하고, 하나의 `GameHost`만 현재 컨트롤러를 소유한다. 진입 시 동적 import하고 이탈 시 루프/타이머/입력/포인터 캡처를 해제한다.
- 액션 게임은 `idle → countdown → playing ↔ paused → roundOver → matchOver` 상태 머신과 고정 타임스텝/제한된 delta를 사용한다.
- 해시 라우터는 `#game/<id>`만 정상 경로로 인정하고 잘못된 값은 `#lobby`로 복구한다. 뒤로/앞으로 가기는 `hashchange`로 처리한다.
- 버전 스키마 저장소가 플레이어 이름, 사운드/볼륨, 모션, 매치 승수, 제한된 최근 기록을 관리하고 예외/손상 데이터는 메모리 기본값으로 폴백한다.
- 앱 쉘은 로비, 공통 HUD, 규칙/설정/결과 모달, `aria-live` 상태 영역을 제공하고 모달 포커스 트랩과 복귀를 공통 구현한다.

## 3. 완료된 마이그레이션 순서

1. npm/Vite/TypeScript/ESLint/Prettier/Vitest/Playwright 설정과 기본 HTML 엔트리를 추가한다.
2. storage, RNG, Canvas scaler, 고정 스텝 루프, input/audio 자원 관리자와 게임 계약을 구축한다.
3. 반응형 로비·공통 HUD·모달·설정·세션 패널과 `#game/*` 라우터를 구축한다.
4. 오목과 사다리의 순수 로직/테스트를 분리한 뒤 새 controller에 연결한다.
5. 탁구, 배구, 핀볼을 고정 스텝 물리와 명시적 상태 머신으로 이전하고 키보드/독립 터치 입력을 연결한다.
6. 반응속도, 탭 배틀, 룰렛을 동일한 controller/상태/저장소 계약으로 추가한다.
7. 축소 모션, 고대비, safe area, 320px, 390×844, 844×390, 768×1024, 1440×900을 기준으로 CSS와 터치 크기를 보정한다.
8. 단위 → 타입/린트 → 빌드 → E2E/axe → 실제 브라우저 스크린샷 순으로 회귀 검증한다.
9. GitHub Pages Actions, README/구조/규칙/변경 문서, SEO/PWA 정적 에셋을 추가한다. 원격이 확인되면 Vite base/canonical/sitemap을 확정한다.

## 4. 게임별 개선 항목

- **오목**: 15×15 프리스타일 5목, 마지막 수/호버/승리 라인, 무승부, 안전한 무르기, 선공 교대, 1/3/5판 매치.
- **탁구**: 3-2-1, 재서브, 이동 방향·타격 위치 반사, 랠리 가속/상한, tunneling/중복 점수 방지, 5/7/11점.
- **배구**: 가속/감속, 점프/중력, 선수·네트 충돌, 코트 제한, 바닥 최초 접촉 1회 점수, 서브 리셋, 회전/그림자/잔상, 5/7/11점.
- **핀볼 늦게 떨어지기**: 시드 기반 미러 배치, 동시 카운트다운, 3회 부스터/쿨다운, 벽·핀 충돌 복구, 착지 1회 기록, 0.05초 무승부, 3판 2선승.
- **사다리**: 2~8명 안전한 입력, 보안 난수로 균등 목표 순열 선택, 인접 교환으로 정확한 1:1 mapping 구성, 확정 snapshot과 단계별 공개, 전체 결과/복사. 결과 예측에 쓰일 수 있는 seed는 표시하거나 재현 기능으로 제공하지 않는다.
- **반응속도**: 예측하기 어려운 지연, 부정 출발, 키/화면 반쪽 멀티터치, 반응 시간, 3점 선취.
- **탭 배틀**: 5/10/15초, 키 repeat/포인터 중복 방지, 실시간 게이지·TPS·최종 탭.
- **벌칙 룰렛**: 2~12개 안전한 항목, unbiased index, 선 결과 후 정확한 각도 애니메이션, 연속 실행/회전 중 편집 방지, 복사/다시 돌리기.

## 5. 테스트 전략

- Vitest로 오목 승리/무승부/무르기, 사다리 전체 permutation/가로선/mapping, 탁구 반사/속도/점수 latch, 배구 바닥 latch/충돌, 핀볼 대칭/착지/무승부/부스터, 저장소 마이그레이션/손상, 룰렛 인덱스/각도를 테스트한다.
- Playwright로 8개 카드/직접 URL/공통 HUD, 저장 유지, 전환 후 유령 입력, invalid hash, 390×844/844×390 오버플로, 콘솔 오류를 검증한다.
- `@axe-core/playwright`로 로비와 게임 공통 UI에서 critical/serious 위반이 없음을 검증한다.
- `npm run check`는 typecheck → lint → unit → build를 연속 실행하며 개별 실패를 숨기지 않는다.
- 빌드 후 preview를 사용해 선택된 Pages base에서 정적 에셋/해시 라우팅을 다시 검증한다.

## 6. GitHub Pages 배포 전략

- PR에서 `npm ci`, typecheck, lint, unit, build, E2E를 실행한다.
- `main` push에서 동일 검사를 통과한 `dist`만 공식 Pages artifact로 올리고, 최소 권한·environment URL·concurrency cancellation을 설정한다.
- 확인된 원격 `DUBEEUBBEE/moyeoplay`의 프로젝트 Pages base는 `/moyeoplay/`다. hash routing과 모든 chunk·manifest·icon 경로를 이 base로 프로덕션 빌드하고 PR에서도 같은 `dist`를 검사한다.
- canonical, Open Graph, sitemap은 확인된 `https://dubeeubbee.github.io/moyeoplay/` 절대 URL로 빌드한다. `main` 배포 뒤 공개 URL 200, CSS/JS, Canvas 시작, `#game/*`, 모바일을 별도 live smoke job에서 검증한다.
