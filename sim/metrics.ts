export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Linear-interpolated percentile, p in [0, 1]. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? 0;
  // Skip interpolation on exact ranks, so infinite values (e.g. "never") don't become NaN.
  return lo === hi ? a : a + (b - a) * (idx - lo);
}

export function median(xs: readonly number[]): number {
  return percentile(xs, 0.5);
}

/**
 * Population Gini: Σ|xi − xj| / (2 n² μ). 0 = perfect equality. For n = 8, the maximum
 * (one member holds everything) is 1 − 1/n = 0.875.
 */
export function gini(xs: readonly number[]): number {
  const n = xs.length;
  const mu = mean(xs);
  if (n === 0 || mu === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  // O(n log n) form: Σ (2i − n − 1) x_(i) / (n² μ), with i counted from 1.
  let acc = 0;
  sorted.forEach((x, i) => {
    acc += (2 * (i + 1) - n - 1) * x;
  });
  return acc / (n * n * mu);
}
