export class DeterministicRandom {
  private value: number;

  constructor(seed: number) {
    this.value = (seed >>> 0) || 0x6d2b_79f5;
  }

  next(): number {
    let value = this.value;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.value = value >>> 0;
    return this.value / 0x1_0000_0000;
  }

  integer(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("random upper bound must be a positive integer");
    }
    return Math.floor(this.next() * maxExclusive);
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.integer(index + 1);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
}
