// Minimal stand-ins for HTMLCanvasElement / CanvasRenderingContext2D.
// Records calls; tests assert on `calls` or simply that drawing does not throw.
export type Call = [string, ...unknown[]];
export function fakeContext(): CanvasRenderingContext2D & { calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    fillStyle: "#000",
    strokeStyle: "#000",
    globalAlpha: 1,
    lineWidth: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    lineCap: "butt",
    font: "",
  };
  const handler: ProxyHandler<object> = {
    get(_t, k: string) {
      if (k === "calls") return calls;
      if (k in state) return state[k];
      if (k === "createRadialGradient" || k === "createLinearGradient")
        return (...a: unknown[]) => {
          calls.push([k, ...a]);
          return { addColorStop: () => {} };
        };
      if (k === "getImageData")
        return (_x: number, _y: number, w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "canvas") return { width: 300, height: 150 };
      return (...a: unknown[]) => {
        calls.push([k, ...a]);
      };
    },
    set(_t, k: string, v) {
      state[k] = v;
      calls.push(["set:" + k, v]);
      return true;
    },
  };
  return new Proxy({}, handler) as CanvasRenderingContext2D & { calls: Call[] };
}
export function fakeCanvas(): HTMLCanvasElement {
  const g = fakeContext();
  return { width: 0, height: 0, getContext: () => g } as unknown as HTMLCanvasElement;
}
