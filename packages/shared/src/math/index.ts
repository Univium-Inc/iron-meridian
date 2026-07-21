// Pure math helpers ported from the mockup (reference/iron-meridian.html).
// All DOM free and side effect free so they run identically in Node and the browser.

export const TWO_PI = Math.PI * 2;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(x0: number, y0: number, x1: number, y1: number): number {
  return Math.hypot(x1 - x0, y1 - y0);
}

// Squared distance, for comparisons that do not need the sqrt.
export function dist2(x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return dx * dx + dy * dy;
}

// Smallest signed angle difference from a to b, in (-PI, PI].
export function angDiff(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

// Rotate cur toward tgt by at most rate*dt radians, without overshooting.
export function turnToward(cur: number, tgt: number, rate: number, dt: number): number {
  const d = angDiff(cur, tgt);
  const m = rate * dt;
  if (Math.abs(d) <= m) return tgt;
  return cur + Math.sign(d) * m;
}

// Normalize an angle into [0, 2*PI).
export function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}
