# 게임 아이콘 자산 provenance

최종 갱신: 2026-07-19

## 요약

- 생성일: 2026-07-19 KST
- 생성 도구: **Codex built-in imagegen (GPT Image 계열; UI에 세부 model version 미표시)**
- 호출 경로: Codex의 내장 `image_gen__imagegen`
- 별도 CLI/API key: 사용하지 않음
- 최종 master: `design/game-icons/source/<id>.png` 8개
- 배포 본: `public/assets/game-icons/<id>.{avif,webp,png}`
- 게임별 OG: `public/assets/og/<id>.png`
- 제3자 이미지·상표·캐릭터 reference: 사용하지 않음

도구 출력은 정확한 내부 모델 이름과 버전을 보여 주지 않았다. 따라서 `gpt-image-1.5`, `gpt-image-2` 등 특정 모델을 사용했다고 단정하지 않는다.

오목은 참조 이미지 없이 첫 style master로 생성했다. 나머지 7개 게임은 이 프로젝트에서 생성한 오목 master만 style reference로 사용했다. 외부 사이트에서 이미지를 다운로드하거나 제3자 작품·캐릭터·상표를 reference로 제공하지 않았다.

## canonical 공통 prompt

아래는 생성 작업의 canonical 공통 아트 디렉션이다. 실제 tool 호출에서는 각 게임 prompt에 이 조건을 포함하고 chroma key, reference, 64px 식별성, 게임별 금지 조건을 더해 전달했다. 하나의 공통 prompt만을 별도 API 호출로 전송한 기록은 없다.

```text
모여PLAY 게임 카드용 아이콘.
정사각형 1:1, 투명 배경, 중앙 배치, 12~16% safe padding.
프리미엄 한국형 네온 파티 아케이드 스타일.
깔끔한 3D clay + vector icon hybrid, 둥근 형태, 읽기 쉬운 실루엣.
카메라는 정면보다 약간 위에서 본 3/4 시점, 모든 아이콘에서 동일한 각도.
부드러운 studio rim light, 과도한 사실주의 금지.
기본 팔레트: dark navy, cyan #45e4e0, pink #ff5d9e, yellow #ffd447,
purple #a675ff, green #58e6a9.
한 아이콘의 주 accent는 해당 게임 registry accent를 따른다.
작은 카드에서도 즉시 식별되는 2~4개 핵심 오브젝트만 사용.
텍스트, 문자, 숫자, 로고, 상표, 워터마크, UI 스크린샷, 사람 얼굴 없음.
잘린 오브젝트 없음. 배경 장면이나 복잡한 소품 없음.
동일한 재질, 그림자 세기, 광원 방향, 외곽선 두께를 유지.
```

공통 부정 지시:

```text
no text, no letters, no numbers, no watermark, no brand logo,
no photorealism, no character face, no busy background,
no thin details, no cropped objects, no inconsistent perspective,
no gambling casino branding, no money, no chips, no alcohol
```

실제 호출에서는 모든 아이콘의 둥근 clay/vector 재질, 상단 왼쪽 계열 rim light, 외곽선과 시각적 무게를 오목 reference에 맞추도록 확장했다. 생성기의 투명 제어 대신 완전히 평탄한 chroma 배경을 요구했고, 해당 key 색이 아이콘 본체에 들어가지 않도록 게임별 금지 조건을 더했다.

## 게임별 canonical prompt

### 오목 — `omok`

```text
Warm wooden go board fragment with clean grid intersections,
three black stones and three white stones forming an obvious five-in-a-row moment,
one last-move stone marked only by a subtle yellow glow ring,
black and white glossy stones, yellow accent, compact centered composition.
```

문자 `五`를 이미지에 넣지 않는 조건을 함께 사용했다. 실제 호출은 warm wooden 9×9 fragment, 보드·돌 외 소품 금지, yellow last-move ring, green 아이콘 세부 금지를 더했다.

### 네온 탁구 — `pong`

```text
Two vertical neon paddles facing each other, left cyan and right pink,
a bright white ball crossing the center with a short curved motion trail,
dark navy negative space, energetic but minimal arcade sports icon.
```

실제 호출은 추가 소품·바닥 그림자·green fringe를 금지했다.

### 통통 배구 — `volleyball`

```text
Two rounded abstract blob players, cyan and pink, jumping on opposite sides
of a small white net, a yellow ball above the net, playful bounce motion,
no faces, no limbs with detailed anatomy, readable silhouette.
```

실제 호출은 완전한 white net·yellow ball, 얼굴 없는 추상 blob, 넓은 motion accent를 강조하고 duplicate·malformed 형태와 추가 장비를 금지했다.

### 핀볼 늦게 떨어지기 — `pinball-drop`

```text
Two mirrored vertical peg lanes, a cyan ball and a pink ball descending
through symmetric glowing pegs, small upward booster spark beneath each ball,
purple accent, clear symmetry and timing competition.
```

첫 시안의 booster가 화살표로 읽힐 위험이 있어 해당 결과는 폐기했다. 최종 두 번째 호출은 정확히 두 개의 mirrored lane, 레인당 같은 높이의 공 하나, 5–6개 rounded peg, 공 아래의 작은 four-point sparkle와 짧은 luminous tail을 요구했다. arrow, arrowhead, chevron, caret, directional symbol은 명시적으로 금지했고 두 번째 raw result만 master로 채택했다.

### 사다리 타기 — `ladder`

```text
Four clean vertical rails connected by several horizontal rungs,
small colored round tokens at the top and matching outcome nodes at the bottom,
green accent, a single highlighted zig-zag route, no letters or names.
```

실제 호출은 dark-navy rail·rung, 상단 4개 token, 하단 matching node, 하나의 green route를 강조하고 blue 아이콘 세부를 금지했다.

### 반응속도 대결 — `reaction-duel`

```text
A central circular signal lamp glowing green at the exact go moment,
two opposing cyan and pink arcade press pads or fingertips approaching from left and right,
orange accent sparks, symmetrical instant-reaction composition, no text.
```

실제 호출은 canonical의 fingertips 선택지를 사용하지 않고 rounded press pad만 요구했다. hand, skin, fingertip을 명시적으로 금지했다.

### 탭 배틀 — `tap-battle`

```text
Two large arcade tap buttons, cyan and pink, being pressed simultaneously,
concentric impact ripples and small speed sparks, blue accent,
clear left-versus-right competition, no fingers with realistic skin detail.
```

실제 호출은 finger·skin·green 아이콘 세부를 금지하고 dark-navy base와 blue accent를 강조했다.

### 벌칙 룰렛 — `roulette`

```text
A compact segmented prize wheel with equal cyan, pink, yellow, purple and green slices,
a fixed yellow pointer at the top, subtle motion blur around the rim,
gold accent, no casino chips, no money, no text.
```

실제 호출은 5개 equal-colored slice, fixed yellow pointer, warm-gold accent, dark-navy hardware와 “local party selector, not gambling”을 강조했다. casino, chip, money, card, slot, betting, alcohol을 모두 금지했다.

## chroma key 제거

생성 결과에는 투명 배경 대신 평탄한 chroma 배경을 요구했다. 핵심 green 소재가 있는 사다리·반응속도·룰렛은 blue key를, blue accent가 중요한 탭 배틀은 green key를 사용했다.

- `#00FF00`: `omok`, `pong`, `volleyball`, `pinball-drop`, `tap-battle`
- `#0000FF`: `ladder`, `reaction-duel`, `roulette`

사용 helper:

```text
/Users/xaeu/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py
```

오목·사다리·반응속도·탭 배틀:

```bash
remove_chroma_key.py --input <input> --out <output> \
  --auto-key corners \
  --soft-matte \
  --transparent-threshold 10 \
  --opaque-threshold 72 \
  --spill-cleanup \
  --edge-contract 1 \
  --edge-feather 0.45 \
  --force
```

네온 탁구·통통 배구·핀볼:

```bash
remove_chroma_key.py --input <input> --out <output> \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

룰렛은 purple slice를 보존하기 위해 soft matte 대신 더 엄격한 hard tolerance로 최종 재처리했다.

```bash
remove_chroma_key.py --input <input> --out <output> \
  --auto-key corners \
  --tolerance 28 \
  --edge-contract 1 \
  --edge-feather 0.35 \
  --force
```

helper는 border/corner RGB 중앙값을 key로 잡고 색상 거리와 dominance 기준 alpha matte, despill, alpha 수축, 선택적 Gaussian feather를 적용한다. 최종 처리된 master 8개는 모두 1254×1254 RGBA PNG다.

통통 배구와 핀볼 master는 chroma 제거 뒤 투명 픽셀을 유지한 채 실제 alpha 콘텐츠를 900×900 안에 맞추고 1254×1254 투명 canvas 중앙에 합성했다. 두 파일 모두 좌우 177px, 약 14.1%의 여백을 확보했으며 새 오브젝트를 그리거나 생성 결과의 의미를 바꾸지 않았다.

## Sharp 최적화와 파일명

```bash
npm run assets:build
```

`scripts/build-game-assets.mjs`는 다음 source를 읽는다.

```text
design/game-icons/source/omok.png
design/game-icons/source/pong.png
design/game-icons/source/volleyball.png
design/game-icons/source/pinball-drop.png
design/game-icons/source/ladder.png
design/game-icons/source/reaction-duel.png
design/game-icons/source/tap-battle.png
design/game-icons/source/roulette.png
```

각 master를 `fit: contain`, `withoutEnlargement: true`로 320×320에 맞춘 뒤 다음을 만든다.

```text
public/assets/game-icons/<id>.avif
public/assets/game-icons/<id>.webp
public/assets/game-icons/<id>.png
```

형식별 설정:

- PNG: compression level 9, adaptive filtering
- WebP: quality 86, alpha quality 100, effort 6
- AVIF: quality 58, effort 7, chroma subsampling 4:4:4
- AVIF/WebP: 각 파일 40KiB 초과 시 build 실패

2026-07-19 산출물을 실제로 조사한 크기:

| 형식         |                   8개 합계 |
| ------------ | -------------------------: |
| AVIF         |   75,518 bytes, 약 73.7KiB |
| WebP         | 112,468 bytes, 약 109.8KiB |
| PNG fallback | 574,477 bytes, 약 561.0KiB |

모든 AVIF·WebP 개별 파일은 40KiB 미만이다. `<picture>`에서 AVIF, WebP, PNG 순으로 제공하므로 AVIF을 지원하는 환경의 8개 modern-format 파일 합계는 약 73.7KiB다.

## deterministic OG 생성

게임별 OG는 ImageGen이 생성한 문자나 UI를 사용하지 않는다. `scripts/build-game-assets.mjs`가 코드로 만든 1200×630 SVG 배경에 게임 아이콘을 440×440으로 축소해 `(735, 92)` 좌표에 합성한다.

아래 텍스트와 레이아웃은 코드와 `GAME_CONTENT`에서 결정론적으로 만든다.

- 모여PLAY 브랜드
- 게임 제목
- 짧은 설명
- 인원·장르
- 게임 registry accent가 반영된 그라데이션·라인

최종 파일은 `public/assets/og/<id>.png` 8개이며 모두 1200×630 불투명 PNG다. 생성 경로에 난수가 없으므로 같은 source·content·toolchain에서 같은 레이아웃을 재생성한다. 다만 설치 폰트, Sharp/libvips 버전과 image codec 환경까지 다른 머신에서 byte-identical output을 보증하지는 않는다.

## 실제 게임 스크린샷과의 구분

`public/assets/screenshots/<id>.webp` 8개는 AI가 만든 가상 게임 화면이 아니다. `scripts/capture-game-screenshots.mjs`가 Playwright Chromium으로 실제 런타임을 열어 1280×720, device scale 1, `ko-KR`, reduced motion으로 캡처한 WebP다. 스크린샷 전용 deterministic random source seed `0x4d4f5945`를 사용하며 production game code에 치트 API를 추가하지 않는다.

## 160px·64px 수동 검수 결과

8개 master를 dark-navy 배경에 160px과 64px로 축소해 재검수했다.

통과한 항목:

- 8종 모두 제목 없이 핵심 게임 실루엣을 식별할 수 있음
- 눈에 띄는 텍스트·문자 유사 artifact·워터마크·상표·사람 얼굴 없음
- 주요 오브젝트가 잘리지 않음
- 눈에 띄는 green/blue chroma fringe나 white halo 없음
- 룰렛에 현금·칩·카드·슬롯머신·카지노 브랜딩 없음
- 재질, rim light, 둥근 3D clay/vector 계열이 전체적으로 일관됨
- 외부 reference와 제3자 저작물·캐릭터·상표를 사용한 흔적 없음

검수에서 확인한 예외·한계:

1. **오목 prompt 내부 모순**: “흑돌 3개와 백돌 3개”로 five-in-a-row를 만들라는 것은 수량상 동시에 충족할 수 없다. 최종 master는 흑돌 5개의 세로 5목과 백돌 4개의 가로 배치를 보여 준다. 5목 장면은 전달하지만 prompt의 돌 수 조건은 불일치한다.
2. **safe padding**: 최종 alpha bounding box 기준으로 8개 master의 각 방향 여백은 최소 12.4% 이상이다. 배구와 핀볼은 위의 투명 canvas 중앙 합성으로 좌우 14.1%를 확보했다. 오브젝트 잘림 없이 64px 식별성 검수를 통과했다.
3. **카메라 각도**: 반응속도와 탭 배틀은 보드형 아이콘보다 조금 더 정면·평면적으로 읽힌다. 동일한 스타일 계열에서 수동 검수했지만 “8개의 카메라 각도가 수학적으로 완전히 동일하다”고 단정하지 않는다.
4. **핀볼 재생성**: 첫 생성본은 booster가 화살표로 오해될 수 있어 폐기했다. 화살표를 금지하고 별 모양 spark를 요구한 두 번째 생성본만 최종 master로 채택했다.

## 문서 주의사항

`THIRD_PARTY_NOTICES.md`는 기본 빌드와 AdSense 활성화 빌드의 외부 요청 차이, AI 생성 PNG master, Sharp 개발 의존성을 함께 요약한다. 세부 생성·처리 이력은 이 문서를 기준으로 한다.
