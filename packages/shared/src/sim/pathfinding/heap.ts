// Binary min-heap over integer node ids, keyed by an external Float64Array of costs.
// Keeping the key array external lets the pathfinder reuse one heap instance across many
// searches with zero per-search allocation.

export class MinHeap {
  private items: Int32Array;
  private size = 0;
  private keys: Float64Array;

  constructor(capacity: number, keys: Float64Array) {
    this.items = new Int32Array(capacity);
    this.keys = keys;
  }

  clear(): void {
    this.size = 0;
  }

  get length(): number {
    return this.size;
  }

  // Point the heap at a fresh key array (used when a map, and thus buffer size, changes).
  setKeys(keys: Float64Array): void {
    this.keys = keys;
  }

  push(node: number): void {
    let i = this.size++;
    this.items[i] = node;
    const keys = this.keys;
    const items = this.items;
    const k = keys[node]!;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[items[parent]!]! <= k) break;
      items[i] = items[parent]!;
      i = parent;
    }
    items[i] = node;
  }

  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0]!;
    const last = --this.size;
    if (last > 0) {
      const node = items[last]!;
      const k = keys[node]!;
      let i = 0;
      // Sift down.
      for (;;) {
        const left = 2 * i + 1;
        if (left >= last) break;
        const right = left + 1;
        let child = left;
        if (right < last && keys[items[right]!]! < keys[items[left]!]!) child = right;
        if (keys[items[child]!]! >= k) break;
        items[i] = items[child]!;
        i = child;
      }
      items[i] = node;
    }
    return top;
  }
}
