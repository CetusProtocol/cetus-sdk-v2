import { fixCoinType } from '@cetusprotocol/common-sdk'
import { bcs } from '@mysten/sui/bcs'
import { blake2b } from 'blakejs'
import { handleMessageError, PoolErrorCode } from '../errors/errors'

/**
 * Computes the CLMM pool key ID, matching `cetus_clmm::factory::new_pool_key`.
 * Coin types must be in canonical order: coin_type_a > coin_type_b (lexicographic).
 */
export function buildPoolKey(coin_type_a: string, coin_type_b: string, tick_spacing: number): string {
  let coinABytes = Buffer.from(fixCoinType(coin_type_a, true), 'utf8')
  const coinBBytes = Buffer.from(fixCoinType(coin_type_b, true), 'utf8')

  const lenA = coinABytes.length
  const lenB = coinBBytes.length

  let i = 0
  let checkPass = false

  while (i < lenB) {
    const byteB = coinBBytes[i]
    if (!checkPass && i < lenA) {
      const byteA = coinABytes[i]
      if (byteA < byteB) {
        handleMessageError(
          PoolErrorCode.InvalidCoinTypeSequence,
          `Invalid coin type sequence: coin_type_a must be lexicographically greater than coin_type_b.`,
          {
            coin_type_a,
            coin_type_b,
          }
        )
      }
      if (byteA > byteB) {
        checkPass = true
      }
    }
    coinABytes = Buffer.concat([coinABytes, Buffer.from([byteB])])
    i += 1
  }

  if (!checkPass) {
    if (lenA === lenB) {
      handleMessageError(PoolErrorCode.SameCoinType, `Same coin type: coin_type_a and coin_type_b must be different.`, {
        coin_type_a,
        coin_type_b,
      })
    }
    if (lenA < lenB) {
      handleMessageError(
        PoolErrorCode.InvalidCoinTypeSequence,
        `Invalid coin type sequence: coin_type_a must be lexicographically greater than coin_type_b.`,
        {
          coin_type_a,
          coin_type_b,
        }
      )
    }
  }

  const tickSpacingBytes = bcs.u32().serialize(tick_spacing).toBytes()
  const combinedBytes = Buffer.concat([coinABytes, Buffer.from(tickSpacingBytes)])

  const hash = blake2b(combinedBytes, undefined, 32)

  return `0x${Buffer.from(hash).toString('hex')}`
}
