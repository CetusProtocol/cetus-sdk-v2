import BN from 'bn.js'
import Decimal from 'decimal.js'
import { CommonErrorCode, handleMessageError } from '../errors/errors'

export const ZERO = new BN(0)

export const ONE = new BN(1)

export const TWO = new BN(2)

export const U128 = TWO.pow(new BN(128))

export const U64_MAX = TWO.pow(new BN(64)).sub(ONE)

export const U128_MAX = TWO.pow(new BN(128)).sub(ONE)

/**
 * @category MathUtil
 */
export class MathUtil {
  static toX64BN(num: BN): BN {
    return num.mul(new BN(2).pow(new BN(64)))
  }

  static toX64Decimal(num: Decimal): Decimal {
    return num.mul(Decimal.pow(2, 64))
  }

  static toX64(num: Decimal): BN {
    return new BN(num.mul(Decimal.pow(2, 64)).floor().toFixed())
  }

  static fromX64(num: BN): Decimal {
    return new Decimal(num.toString()).mul(Decimal.pow(2, -64))
  }

  static fromX64Decimal(num: Decimal): Decimal {
    return num.mul(Decimal.pow(2, -64))
  }

  static fromX64BN(num: BN): BN {
    return num.div(new BN(2).pow(new BN(64)))
  }

  static shiftRightRoundUp(n: BN): BN {
    let result = n.shrn(64)

    if (n.mod(U64_MAX).gt(ZERO)) {
      result = result.add(ONE)
    }

    return result
  }

  static divRoundUp(n0: BN, n1: BN): BN {
    const hasRemainder = !n0.mod(n1).eq(ZERO)
    if (hasRemainder) {
      return n0.div(n1).add(new BN(1))
    }
    return n0.div(n1)
  }

  static subUnderflowU128(n0: BN, n1: BN): BN {
    if (n0.lt(n1)) {
      return n0.sub(n1).add(U128_MAX)
    }

    return n0.sub(n1)
  }

  static checkUnsignedSub(n0: BN, n1: BN): BN {
    const n = n0.sub(n1)
    if (n.isNeg()) {
      throw new Error('Unsigned integer sub overflow')
    }
    return n
  }

  static checkMul(n0: BN, n1: BN, limit: number): BN {
    const n = n0.mul(n1)
    if (this.isOverflow(n, limit)) {
      handleMessageError(CommonErrorCode.MultiplicationOverflow, 'Multiplication overflow')
    }
    return n
  }

  static checkMulDivFloor(n0: BN, n1: BN, denom: BN, limit: number): BN {
    if (denom.eq(ZERO)) {
      handleMessageError(CommonErrorCode.DivisionByZero, 'Divide by zero')
    }
    const n = n0.mul(n1).div(denom)
    if (this.isOverflow(n, limit)) {
      handleMessageError(CommonErrorCode.MultiplicationOverflow, 'Multiplication div overflow')
    }
    return n
  }

  static checkMulDivCeil(n0: BN, n1: BN, denom: BN, limit: number): BN {
    if (denom.eq(ZERO)) {
      throw new Error('Divide by zero')
    }
    const n = n0.mul(n1).add(denom.sub(ONE)).div(denom)
    if (this.isOverflow(n, limit)) {
      throw new Error('Multiplication div overflow')
    }
    return n
  }

  static checkMulDivRound(n0: BN, n1: BN, denom: BN, limit: number): BN {
    if (denom.eq(ZERO)) {
      handleMessageError(CommonErrorCode.DivisionByZero, 'Divide by zero')
    }
    const n = n0.mul(n1.add(denom.shrn(1))).div(denom)
    if (this.isOverflow(n, limit)) {
      handleMessageError(CommonErrorCode.MultiplicationOverflow, 'Multiplication div overflow')
    }
    return n
  }

  static checkMulShiftRight(n0: BN, n1: BN, shift: number, limit: number): BN {
    const n = n0.mul(n1).div(new BN(2).pow(new BN(shift)))
    // const n = n0.mul(n1).shrn(shift)
    if (this.isOverflow(n, limit)) {
      handleMessageError(CommonErrorCode.MultiplicationOverflow, 'Multiplication shift right overflow')
    }
    return n
  }

  static checkMulShiftRight64RoundUpIf(n0: BN, n1: BN, limit: number, round_up: boolean): BN {
    const p = n0.mul(n1)
    const shouldRoundUp = round_up && p.and(U64_MAX).gt(ZERO)
    const result = shouldRoundUp ? p.shrn(64).add(ONE) : p.shrn(64)
    if (this.isOverflow(result, limit)) {
      handleMessageError(CommonErrorCode.MultiplicationOverflow, 'Multiplication shift right overflow')
    }
    return result
  }

  static checkMulShiftLeft(n0: BN, n1: BN, shift: number, limit: number): BN {
    const n = n0.mul(n1).shln(shift)
    if (this.isOverflow(n, limit)) {
      handleMessageError(CommonErrorCode.MultiplicationOverflow, 'Multiplication shift left overflow')
    }
    return n
  }

  static checkDivRoundUpIf(n0: BN, n1: BN, round_up: boolean): BN {
    if (n1.eq(ZERO)) {
      handleMessageError(CommonErrorCode.DivisionByZero, 'Divide by zero')
    }
    if (round_up) {
      return this.divRoundUp(n0, n1)
    }
    return n0.div(n1)
  }

  static isOverflow(n: BN, bit: number): boolean {
    return n.gte(TWO.pow(new BN(bit)))
  }

  static sign(v: BN): number {
    const signBit = v.testn(127) ? 1 : 0
    return signBit
  }

  static is_neg(v: BN): boolean {
    return this.sign(v) === 1
  }

  static abs_u128(v: BN): BN {
    if (v.gt(ZERO)) {
      return v
    }
    return this.u128Neg(v.subn(1))
  }

  static u128Neg(v: BN): BN {
    return v.uxor(new BN('ffffffffffffffffffffffffffffffff', 16))
  }

  static neg(v: BN): BN {
    if (this.is_neg(v)) {
      return v.abs()
    }
    return this.negFrom(v)
  }

  static abs(v: BN): BN {
    if (this.sign(v) === 0) {
      return v
    }
    return this.u128Neg(v.sub(new BN(1)))
  }

  static negFrom(v: BN): BN {
    if (v.eq(ZERO)) {
      return v
    }
    return this.u128Neg(v).add(new BN(1)).or(new BN(1).shln(127))
  }

  /**
   * Convert u128 to i128
   * If the highest bit is 1, it represents a negative number: -(2^128 - bits)
   * If the highest bit is 0, it represents a positive number: bits
   * @param v - u128 value as BN
   * @returns i128 value as BN
   */
  static u128ToI128(v: BN): BN {
    const signBit = v.testn(127)
    if (signBit) {
      // Highest bit is 1, negative number: -(2^128 - v)
      return U128.sub(v).neg()
    } else {
      // Highest bit is 0, positive number
      return v
    }
  }
}
