import { CANVAS_W, clearCanvas, renderOp, type Ctx2D, type DrawOp } from '@ccc/shared';

/**
 * Renders an op list onto a visible canvas with a cached "baked" layer.
 * Completed ops at the front of the list are drawn once into the bake layer; in-progress
 * strokes (and anything after them) are redrawn each frame on top. Visibility changes rebuild.
 */
export class CanvasRenderer {
  private readonly bake: HTMLCanvasElement;
  private readonly bakeCtx: CanvasRenderingContext2D;
  private baked = 0;
  private bakedIds: string[] = [];
  private needsFull = true;
  private frame = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getOps: () => DrawOp[],
  ) {
    this.bake = document.createElement('canvas');
    this.bakeCtx = this.bake.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  }

  resize(pixelWidth: number, pixelHeight: number): void {
    if (this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.bake.width = pixelWidth;
    this.bake.height = pixelHeight;
    this.invalidate();
  }

  invalidate(): void {
    this.needsFull = true;
    this.schedule();
  }

  schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  get scale(): number {
    return this.canvas.width / CANVAS_W;
  }

  private draw(): void {
    const ops = this.getOps();
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;
    // If the op list was replaced or reordered under us, rebuild from scratch.
    for (let i = 0; i < this.baked && !this.needsFull; i++) if (ops[i]?.id !== this.bakedIds[i]) this.needsFull = true;
    if (this.needsFull) {
      clearCanvas(this.bakeCtx as unknown as Ctx2D, w, h);
      this.baked = 0;
      this.bakedIds = [];
      this.needsFull = false;
    }
    while (this.baked < ops.length) {
      const op = ops[this.baked];
      if (op.kind === 'stroke' && !op.done) break;
      renderOp(this.bakeCtx as unknown as Ctx2D, op, w, h);
      this.bakedIds.push(op.id);
      this.baked++;
    }
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(this.bake, 0, 0);
    for (let i = this.baked; i < ops.length; i++) renderOp(ctx as unknown as Ctx2D, ops[i], w, h);
  }
}
