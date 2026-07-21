// Deterministic state hashing.
//
// The hash is a 32 bit FNV-1a over a canonical byte serialization of the world. It
// uses the same quantization the M5 network layer will use (positions to centimeters,
// angles to a single byte), so the hash certifies exactly the state that would travel
// over the wire. Two worlds that hash equal are indistinguishable to a client.

import { TWO_PI } from "../math";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// Growable byte sink that also knows how to push quantized game quantities.
export class HashWriter {
  private h = FNV_OFFSET;

  byte(b: number): void {
    this.h ^= b & 0xff;
    this.h = Math.imul(this.h, FNV_PRIME);
  }

  // Little endian 32 bit integer.
  int32(v: number): void {
    const n = v | 0;
    this.byte(n & 0xff);
    this.byte((n >>> 8) & 0xff);
    this.byte((n >>> 16) & 0xff);
    this.byte((n >>> 24) & 0xff);
  }

  uint32(v: number): void {
    this.int32(v | 0);
  }

  // Position component quantized to centimeters (matches the network encoding).
  posCm(worldUnits: number): void {
    this.int32(Math.round(worldUnits * 100));
  }

  // Angle quantized to one byte over a full turn (matches the network encoding).
  angleByte(radians: number): void {
    let a = radians % TWO_PI;
    if (a < 0) a += TWO_PI;
    this.byte(Math.round((a / TWO_PI) * 256) & 0xff);
  }

  // Final unsigned 32 bit digest.
  digest(): number {
    return this.h >>> 0;
  }
}
