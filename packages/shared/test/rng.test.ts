import { describe, it, expect } from "vitest";
import { RNG } from "../src/math/rng";

// The exact mulberry32 closure from reference/iron-meridian.html, inlined so we can
// prove our RNG class produces a bit for bit identical stream. This keeps every ported
// balance number behaving the way the mockup tuned it.
function mockupMulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("RNG", () => {
  it("matches the mockup mulberry32 stream exactly for several seeds", () => {
    for (const seed of [1337, 0, 1, -1, 42, 2 ** 31 - 1, -(2 ** 31)]) {
      const ref = mockupMulberry32(seed);
      const rng = new RNG(seed);
      for (let i = 0; i < 1000; i++) {
        expect(rng.next()).toBe(ref());
      }
    }
  });

  it("produces values in [0, 1)", () => {
    const rng = new RNG(12345);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("two instances with the same seed produce identical sequences", () => {
    const a = new RNG(777);
    const b = new RNG(777);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("snapshot and restore of ustate continues the stream identically", () => {
    const a = new RNG(9001);
    for (let i = 0; i < 500; i++) a.next();
    const saved = a.ustate;
    const expected = [a.next(), a.next(), a.next()];

    const b = new RNG(0);
    b.ustate = saved;
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });
});
