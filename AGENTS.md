# AGENTS.md

## 작업 원칙

- 기존 게임이나 작동하는 사용자 흐름을 삭제·축소해 완료한 것처럼 처리하지 않는다.
- 제거 작업이 아니라면 저장소 범위의 읽기·쓰기·실행 권한을 활용해 필요한 구현과 검증을 끝까지 진행한다.
- 사용자 입력은 `innerHTML` 문자열에 연결하지 않는다. 정적 마크업에만 `innerHTML`을 허용하고 이름·결과·룰렛 항목은 `textContent` 또는 form value로 처리한다.
- 프레임마다 DOM 전체를 다시 만들지 않는다. Canvas 렌더와 변경된 HUD 텍스트만 갱신한다.
- 확인하지 않은 배포, 테스트, URL을 성공으로 보고하지 않는다.

## 저장소 구조

- `src/app`: 앱 셸, hash 라우터, 설정·세션 스토어, 게임 레지스트리
- `src/components`: 재사용 가능한 DOM 컴포넌트
- `src/core`: 게임 계약, 루프, 입력, Canvas, 오디오, RNG, 저장소
- `src/games/<id>`: 게임 controller와 순수 로직, 단위 테스트
- `src/styles`: 토큰부터 반응형 보정까지 계층화한 CSS
- `tests/e2e`: Playwright와 axe 접근성 검사
- `public`: 런타임 네트워크가 필요 없는 정적 자산
- `docs`: 계획, 아키텍처, 게임 규칙

## 개발 명령

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run check
```

PR 완료 전 `npm run check`와 `npm run test:e2e`가 모두 성공해야 한다. 게임 물리나 레이아웃을 바꾸면 390×844, 844×390, 768×1024, 1440×900을 확인한다.

## 코드 규칙

- TypeScript strict를 유지하고 `any`, 전역 가변 상태, 무분별한 타입 단언을 추가하지 않는다.
- 테스트 가능한 판정·매핑·물리는 `logic.ts`의 순수 함수로 둔다.
- 난수는 주입 가능한 `RandomSource` 또는 시드 RNG를 사용한다. 룰렛 결과는 rejection sampling 기반 인덱스를 사용한다.
- 액션 물리는 `FixedStepLoop` 또는 제한된 동일 방식으로 실행하고 큰 delta와 최대 서브스텝을 제한한다.
- 브라우저 기본 동작은 실제 게임 입력을 처리한 경우에만 막는다.
- 외부 이미지·폰트·음원·CDN을 추가하지 않는다. 새 라이선스도 소유자 승인 없이 선언하지 않는다.

## 게임 모듈 생명주기

모든 `src/games/*/index.ts`는 `createGame(services)`를 export하고 다음 계약을 구현한다.

```ts
interface MiniGameController {
  mount(container: HTMLElement): void;
  enter(): void;
  start(): void;
  pause(): void;
  resume(): void;
  reset(options?: { preserveMatchScore?: boolean }): void;
  destroy(): void;
}
```

- `mount`는 자신의 DOM만 만든다.
- `enter`는 화면 크기를 맞추고 초기 상태를 알린다.
- `start`, `pause`, `resume`은 명시적 phase와 실제 루프/타이머 상태를 함께 바꾼다.
- `reset`은 라운드/매치 상태를 일관되게 초기화한다.
- `destroy`는 RAF, timeout, interval, AudioNode, 이벤트 listener, pointer capture를 모두 정리한다.
- 화면을 떠난 controller가 입력이나 렌더를 계속하면 PR 완료 조건을 만족하지 못한 것이다.

## 테스트와 PR 완료 조건

- 새 판정 로직에는 정상, 경계, 잘못된 양성, 중복 처리 방지 테스트를 추가한다.
- 저장 스키마 변경에는 이전 버전 migration과 손상 데이터 fallback 테스트를 추가한다.
- UI 변경에는 키보드 접근, 이름 있는 버튼, 모달 포커스 복귀, `aria-live` 상태 전달을 확인한다.
- `console.error`, uncaught exception, 수평 오버플로, 잘린 터치 버튼이 없어야 한다.
- Pages workflow는 공식 Actions와 최소 권한을 사용하고 `dist`만 배포한다.
