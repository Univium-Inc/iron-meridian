// Rolling tick-time profiler. The server tick budget is 20ms at 800 entities on a
// shared-cpu box (enforced from M2 with a --bench script). Even at M0 we measure so the
// budget is visible from day one.

export class TickProfiler {
  private samples: number[] = [];
  private readonly cap: number;

  constructor(windowSize = 200) {
    this.cap = windowSize;
  }

  add(ms: number): void {
    this.samples.push(ms);
    if (this.samples.length > this.cap) this.samples.shift();
  }

  get avg(): number {
    if (this.samples.length === 0) return 0;
    let s = 0;
    for (const v of this.samples) s += v;
    return s / this.samples.length;
  }

  get max(): number {
    let m = 0;
    for (const v of this.samples) if (v > m) m = v;
    return m;
  }
}
