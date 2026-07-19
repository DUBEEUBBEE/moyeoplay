# Third-party notices

AdSense가 꺼진 기본 프로덕션 빌드는 외부 CDN, 외부 폰트, 이미지, 음원, JavaScript 라이브러리를 요청하지 않습니다. AdSense를 실제 ID와 custom root domain으로 명시적으로 활성화한 빌드는 필요한 동의가 확인된 뒤 Google 광고 JavaScript를 요청할 수 있습니다. `/play/` 게임 앱에는 광고 태그를 넣지 않습니다.

저장소의 그래픽은 프로젝트용 SVG, CSS, Canvas 도형과 2026-07-19에 Codex built-in imagegen으로 생성한 게임 아이콘·클레이 히어로 master로 구성됩니다. 게임 아이콘은 외부 이미지·상표·캐릭터 reference 없이 생성했고, 히어로는 사용자가 제공한 화면 시안을 스타일·분위기 참고용으로만 사용해 UI 문자나 로고 없이 새로 구성했습니다. 저장소 안에서 AVIF·WebP·PNG·JPG·OG로 최적화한 과정, prompt, chroma key 제거, 수동 검수와 파일 예산은 `docs/ASSET_PROVENANCE.md`에 기록합니다.

개발과 CI에는 `package-lock.json`에 고정된 Vite, TypeScript, ESLint, Prettier, Vitest, Playwright, axe-core, Sharp 및 전이 의존성이 사용됩니다. 각 패키지의 저작권과 라이선스는 npm 배포물의 LICENSE/metadata를 따릅니다. 이 파일과 자산 provenance는 저장소 소유자의 프로젝트 라이선스를 새로 선언하거나 변경하지 않습니다.
