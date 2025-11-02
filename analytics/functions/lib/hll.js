"use strict";

const REGISTER_COUNT = 64;
const REGISTER_BITS = Math.log2(REGISTER_COUNT);

function fnv1a64(input) {
  const data = Buffer.from(input, "utf8");
  let hash = 0xcbf29ce484222325n;
  for (const byte of data) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}

function leadingZeros(value, width) {
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

class TinyHLL {
  constructor(registers) {
    this.registers = registers ? new Uint8Array(registers) : new Uint8Array(REGISTER_COUNT);
  }

  static from(values) {
    const hll = new TinyHLL();
    for (const value of values) {
      hll.add(value);
    }
    return hll;
  }

  static fromBase64(encoded) {
    const buf = Buffer.from(encoded, "base64");
    return new TinyHLL(new Uint8Array(buf));
  }

  clone() {
    return new TinyHLL(this.registers);
  }

  add(value) {
    const hash = fnv1a64(value);
    const index = Number(hash & BigInt(REGISTER_COUNT - 1));
    const remainder = hash >> BigInt(REGISTER_BITS);
    const rank = leadingZeros(remainder, 64 - REGISTER_BITS) + 1;
    const current = this.registers[index];
    if (rank > current) {
      this.registers[index] = rank;
    }
  }

  merge(other) {
    for (let i = 0; i < this.registers.length; i += 1) {
      if (other.registers[i] > this.registers[i]) {
        this.registers[i] = other.registers[i];
      }
    }
  }

  count() {
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

  toBase64() {
    return Buffer.from(this.registers).toString("base64");
  }
}

class UniqueAccumulator {
  constructor(exactCap = 20000) {
    this.exact = new Set();
    this.sketch = null;
    this.exactCap = exactCap;
  }

  addValues(values) {
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

  addSketch(encoded) {
    const sketch = TinyHLL.fromBase64(encoded);
    if (!this.sketch) {
      this.promoteToSketch();
    }
    this.sketch.merge(sketch);
  }

  promoteToSketch() {
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

  count() {
    if (this.sketch) {
      return this.sketch.count();
    }
    return this.exact ? this.exact.size : 0;
  }
}

module.exports = { TinyHLL, UniqueAccumulator };
