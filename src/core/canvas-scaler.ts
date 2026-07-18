export interface CanvasSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  resize(): void;
  pointFromEvent(event: PointerEvent): { x: number; y: number };
}

export function createCanvasSurface(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  maxDpr = 2,
): CanvasSurface {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not supported by this browser.');

  const resize = (): void => {
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), maxDpr);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvas.style.aspectRatio = `${String(width)} / ${String(height)}`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
  };

  const pointFromEvent = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * height,
    };
  };

  resize();
  return { canvas, context, width, height, resize, pointFromEvent };
}
