// Deterministic pseudo random number generator.
//
// This is the mulberry32 generator from the mockup (reference/iron-meridian.html),
// rewritten so its state is an explicit field instead of a closure variable. That
// lets the state live inside the simulation world, be hashed, be snapshotted, and be
// restored exactly. The generated stream is bit for bit identical to the mockup's
// mulberry32 for the same seed (verified by test/rng.test.ts), so ported balance
// numbers keep behaving the way the mockup tuned them.
//
// Rule for the whole @iron/shared package: never call Math.random. All randomness
// flows through an RNG instance that is part of the deterministic world state.

export class RNG {
  // Stored as a signed 32 bit integer (the result of `| 0`), advanced on every draw.
  state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  // Returns a float in [0, 1). Matches mulberry32 in the reference mockup exactly.
  next(): number {
    let a = this.state | 0;
    a = (a + 0x6d2b79f5) | 0;
    this.state = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer in [0, maxExclusive).
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  // Float in [min, max).
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  // True with probability p (p in [0, 1]).
  chance(p: number): boolean {
    return this.next() < p;
  }

  // Uniform pick from a non empty array.
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)]!;
  }

  // Read the raw state as an unsigned 32 bit value (for hashing and serialization).
  get ustate(): number {
    return this.state >>> 0;
  }

  // Restore from a previously captured unsigned state value.
  set ustate(v: number) {
    this.state = v | 0;
  }
}

// Convenience factory mirroring the mockup call site style: mulberry32(seed).
export function makeRng(seed: number): RNG {
  return new RNG(seed);
}
