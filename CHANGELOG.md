# 변경 기록

## 1.0.0 - 2026-07-18

### 추가

- Vite, strict TypeScript, ESLint, Prettier, Vitest, Playwright, axe 기반 품질 도구
- 독립 생명주기와 동적 import를 사용하는 8개 게임 구조
- 반응속도 대결, 탭 배틀, 벌칙 룰렛
- 버전형 설정·세션 저장소와 손상 데이터 fallback
- 공통 게임 HUD, 규칙·설정·결과 modal, 사운드·볼륨·모션 설정, 전체 화면
- 320px부터 데스크톱까지 반응형 UI, safe area, 축소 모션, 고대비, `aria-live`
- GitHub Pages 공식 Actions 기반 검사·배포 workflow
- 자체 제작 favicon, Open Graph SVG, web app manifest와 배포 URL 기반 SEO metadata 생성

### 변경

- 단일 2,007줄 `app.js`를 앱·코어·컴포넌트·게임별 모듈로 분리
- 기존 오목, 탁구, 배구, 핀볼, 사다리의 판정·물리·조작·연출 개선
- 기존 `#omok` 라우팅을 Pages 안전한 `#game/omok` 형식으로 통일

### 제거

- 동작하지 않는 “다음 게임” placeholder 카드
- 런타임에 항상 돌던 전역 단일 RAF와 게임 간 공유 가변 상태
