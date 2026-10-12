import { LADDER_EXAMPLE, OMOK_EXAMPLES } from './evidence-examples.mjs';

export function renderGuideDiagram(id) {
  if (id === 'omok-threats') {
    const rows = OMOK_EXAMPLES.map((example, index) => {
      const y = 64 + index * 112;
      const stones = example.moves
        .filter(([row]) => row === 7)
        .map(([, col], moveIndex) => {
          // Determine player from the complete move sequence, not the cropped row.
          const originalIndex = example.moves.findIndex(
            ([row, column]) => row === 7 && column === col,
          );
          const isBlack = originalIndex % 2 === 0;
          return `<circle cx="${64 + (col - 3) * 48}" cy="${y + 38}" r="16" fill="${isBlack ? '#27251f' : '#fffdf8'}" stroke="#27251f" stroke-width="2" data-stone="${moveIndex}" />`;
        })
        .join('');
      const targets = example.winningColumns
        .map(
          (col) =>
            `<circle cx="${64 + (col - 3) * 48}" cy="${y + 38}" r="20" fill="none" stroke="#9b321b" stroke-width="3" stroke-dasharray="4 3" />`,
        )
        .join('');
      return `<text x="24" y="${y}" font-size="18" font-weight="700">${index + 1}. ${example.label}</text><path d="M64 ${y + 38}H448" stroke="#786b54" stroke-width="2" />${Array.from({ length: 9 }, (_, col) => `<path d="M${64 + col * 48} ${y + 14}v48" stroke="#786b54" /><text x="${64 + col * 48}" y="${y + 78}" text-anchor="middle" font-size="15">${col + 4}</text>`).join('')}${stones}${targets}`;
    }).join('');
    return `<svg viewBox="0 0 512 422" role="img" aria-labelledby="omok-diagram-title omok-diagram-description"><title id="omok-diagram-title">8행에서 찾는 세 가지 오목 위협</title><desc id="omok-diagram-description">1번은 10열, 2번은 5열과 10열, 3번은 7열이 흑의 다음 승리 자리입니다. 점선 원이 해당 빈칸이며 다른 행의 백돌은 생략했습니다.</desc><rect width="512" height="422" rx="18" fill="#f4e5c9" /><g font-family="system-ui, sans-serif" fill="#27251f">${rows}<text x="24" y="402" font-size="14">숫자는 열 · 점선은 흑의 다음 승리 자리 · 다른 행 생략</text></g></svg>`;
  }
  if (id === 'ladder-mapping') {
    const x = (column) => 80 + column * 160;
    const y = (row) => 90 + row * 18;
    const lines = [0, 1, 2]
      .map(
        (column) =>
          `<path d="M${x(column)} 70V374" stroke="#786b54" stroke-width="4" /><text x="${x(column)}" y="42" text-anchor="middle">${['A', 'B', 'C'][column]}</text><text x="${x(column)}" y="412" text-anchor="middle">결과 ${column + 1}</text>`,
      )
      .join('');
    const rungs = LADDER_EXAMPLE.rungs
      .map(
        (rung) =>
          `<path d="M${x(rung.left)} ${y(rung.row)}H${x(rung.left + 1)}" stroke="#786b54" stroke-width="4" />`,
      )
      .join('');
    return `<svg viewBox="0 0 480 446" role="img" aria-labelledby="ladder-diagram-title ladder-diagram-description"><title id="ladder-diagram-title">A가 결과 3으로 이어지는 세 사람 사다리 예</title><desc id="ladder-diagram-description">첫 가로줄은 1열과 2열, 다음 가로줄은 2열과 3열을 잇습니다. A는 결과 3, B는 결과 1, C는 결과 2에 도착합니다. 실제 생성 규칙의 인접 교환 두 개를 그린 설명용 도식입니다.</desc><rect width="480" height="446" rx="18" fill="#f4e5c9" /><g font-family="system-ui, sans-serif" font-size="20" fill="#27251f">${lines}${rungs}<path d="M80 70V${y(6)}H240V${y(7)}H400V374" stroke="#9b321b" stroke-width="6" fill="none" stroke-linejoin="round" /></g></svg>`;
  }
  throw new Error(`Unknown guide diagram: ${id}`);
}
