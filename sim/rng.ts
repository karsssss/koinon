// Deterministic PRNG: xoshiro128** seeded via splitmix32 from an FNV-1a hash of labelled parts.
// Each behaviour draws from its own labelled stream, so adding a draw in one place does not
// reshuffle the others (ECONOMY.md §9).

export function hashLabels(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  const text = parts.join("␟");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`int(n) needs a positive integer, got ${n}`);
    return Math.floor(this.next() * n);
  }

  /** Uniform integer in [lo, hi]. */
  intBetween(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  bernoulli(p: number): boolean {
    return this.next() < p;
  }

  /** Knuth's method. Intended for small λ (offers per day). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new RangeError("pick() from an empty list");
    return item;
  }

  /** Fisher–Yates on a copy. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }
}

export function stream(seed: number, ...labels: readonly (string | number)[]): Rng {
  return new Rng(hashLabels(seed, ...labels));
}
