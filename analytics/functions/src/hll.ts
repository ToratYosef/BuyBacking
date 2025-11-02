const REGISTER_COUNT = 64; // power of two
const REGISTER_BITS = Math.log2(REGISTER_COUNT);

function fnv1a64(input: string): bigint {
  const data = Buffer.from(input, "utf8");
  let hash = 0xcbf29ce484222325n;
  for (const byte of data) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}

function leadingZeros(value: bigint, width: number): number {
  if (value === 0n) {
    return width;
  }
  const bits = value.toString(2).padStart(width, "0");
  let count = 0;
  for (const bit of bits) {
    if (bit === "0") {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

export class TinyHLL {
  private readonly registers: Uint8Array;

  constructor(registers?: Uint8Array) {
    this.registers = registers ? new Uint8Array(registers) : new Uint8Array(REGISTER_COUNT);
  }

  static from(values: Iterable<string>): TinyHLL {
    const hll = new TinyHLL();
    for (const value of values) {
      hll.add(value);
    }
    return hll;
  }

  static fromBase64(encoded: string): TinyHLL {
    const buf = Buffer.from(encoded, "base64");
    return new TinyHLL(new Uint8Array(buf));
  }

  clone(): TinyHLL {
    return new TinyHLL(this.registers);
  }

  add(value: string): void {
    const hash = fnv1a64(value);
    const index = Number(hash & BigInt(REGISTER_COUNT - 1));
    const remainder = hash >> BigInt(REGISTER_BITS);
    const rank = leadingZeros(remainder, 64 - REGISTER_BITS) + 1;
    const current = this.registers[index];
    if (rank > current) {
      this.registers[index] = rank;
    }
  }

  merge(other: TinyHLL): void {
    for (let i = 0; i < this.registers.length; i += 1) {
      if (other.registers[i] > this.registers[i]) {
        this.registers[i] = other.registers[i];
      }
    }
  }

  count(): number {
    const m = this.registers.length;
    let sum = 0;
    let zeros = 0;
    for (const register of this.registers) {
      sum += 2 ** -register;
      if (register === 0) {
        zeros += 1;
      }
    }
    const alpha = 0.709;
    let estimate = alpha * m * m * (1 / sum);

    if (estimate <= 2.5 * m && zeros > 0) {
      estimate = m * Math.log(m / zeros);
    }

    return Math.round(estimate);
  }

  toBase64(): string {
    return Buffer.from(this.registers).toString("base64");
  }
}

export class UniqueAccumulator {
  private exact: Set<string> | null = new Set();

  private sketch: TinyHLL | null = null;

  private readonly exactCap: number;

  constructor(exactCap = 20000) {
    this.exactCap = exactCap;
  }

  addValues(values: Iterable<string>): void {
    if (this.sketch) {
      for (const value of values) {
        this.sketch.add(value);
      }
      return;
    }

    if (!this.exact) {
      this.exact = new Set();
    }

    for (const value of values) {
      this.exact.add(value);
      if (this.exact.size > this.exactCap) {
        this.promoteToSketch();
        break;
      }
    }
  }

  addSketch(encoded: string): void {
    const sketch = TinyHLL.fromBase64(encoded);
    if (!this.sketch) {
      this.promoteToSketch();
    }
    this.sketch!.merge(sketch);
  }

  private promoteToSketch(): void {
    if (this.sketch) {
      return;
    }
    this.sketch = new TinyHLL();
    if (this.exact) {
      for (const value of this.exact) {
        this.sketch.add(value);
      }
    }
    this.exact = null;
  }

  count(): number {
    if (this.sketch) {
      return this.sketch.count();
    }
    return this.exact?.size ?? 0;
  }
}
