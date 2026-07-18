# 변경 기록

## 1.1.0 - 2026-07-18

### 안정성과 공정성

- 사다리 목표 순열을 보안 난수로 먼저 선택하고 인접 교환으로 정확히 구성하도록 개선
- 사다리 round snapshot, 편집 확인, 부분 공개 masking, 전체 공개 전 mapping·복사·라운드 ID 잠금 추가
- 탁구 TOI 다중 충돌, 배구 연속 충돌 분리, 반응속도 event timestamp·동점·부정 출발 판정 하드닝
- 룰렛·사다리의 보안 난수가 없을 때 비보안 fallback 대신 실패하도록 변경

### 모바일과 접근성

- 높이 500px 이하 가로 폰에서 HUD·점수·경기 영역·양쪽 조작을 한 visual viewport에 배치
- pointer ID별 동시 입력과 cancel·blur·visibility·reset·destroy 정리, 핀볼 compatibility click 중복 방지
- coarse pointer 오목에 좌표 선택–확정–취소, 키보드 조작, 무르기 확인, 규칙 badge 추가
- 로비 카드·게임 상태의 semantic DOM, 44px 조작, 축소 모션·포커스 순서·Axe 검증 보강

### 배포와 QA

- Pages 하위 경로를 사용한 프로덕션 E2E와 `main` 배포 후 live smoke job 추가
- raster Open Graph 커버, 192/512/maskable PWA icon, Apple touch icon과 Twitter metadata 추가
- chunk 로딩 재시도 UI, 로비 링크 공유, Clipboard fallback, 탭 사운드 throttle, 프로덕션 source map 비활성화
- 생산 자산·direct hash route·lifecycle·멀티터치·접근성을 다루는 Playwright·Axe 회귀 테스트와 QA 문서 확장

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
