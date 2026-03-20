import { SuiObjectResponse, CoinBalance } from '@mysten/sui/jsonRpc'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  asIntN,
  ClmmPoolUtil,
  CoinAssist,
  d,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  GAS_TYPE_ARG,
  getObjectFields,
  getObjectType,
  TickMath,
} from '@cetusprotocol/common-sdk'
import { FarmsPositionNFT } from '@cetusprotocol/farms-sdk'
import Decimal from 'decimal.js'
import { handleMessageError, VaultsErrorCode } from '../errors/errors'
import { CetusVaultsSDK } from '../sdk'
import { PROTOCOL_FEE_DENOMINATOR, Vault, VaultStatus } from '../types/vaults'
import { Pool, Position } from '@cetusprotocol/sui-clmm-sdk'
import { VaultsPosition, VaultsVestInfo, VaultVestNFT } from '../types/vest'

export class VaultsUtils {
  static calculatePositionShare(
    tick_lower: number,
    tick_upper: number,
    liquidity: string,
    price: string,
    effective_tick_lower: number,
    effective_tick_upper: number,
    current_sqrt_price: string
  ): string {
    if (tick_upper <= effective_tick_lower || tick_lower >= effective_tick_upper) {
      return '0'
    }
    let valid_tick_lower = 0
    if (tick_lower < effective_tick_lower) {
      valid_tick_lower = effective_tick_lower
    } else {
      valid_tick_lower = tick_lower
    }

    let valid_tick_upper = 0
    if (tick_upper < effective_tick_upper) {
      valid_tick_upper = tick_upper
    } else {
      valid_tick_upper = effective_tick_upper
    }

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(valid_tick_lower)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(valid_tick_upper)

    const { coin_amount_a, coin_amount_b } = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(liquidity),
      new BN(current_sqrt_price),
      lowerSqrtPrice,
      upperSqrtPrice,
      true
    )

    return d(coin_amount_a).mul(price).div(1000000000000).add(coin_amount_b).toString()
  }

  static generateNextTickRange(curr_index: number, span: number, tick_spacing: number) {
    const lower_index = curr_index - span / 2
    const upper_index = curr_index + span / 2

    return {
      new_tick_lower: VaultsUtils.getValidTickIndex(lower_index, tick_spacing),
      new_tick_upper: VaultsUtils.getValidTickIndex(upper_index, tick_spacing),
    }
  }

  static getValidTickIndex(tick_index: number, tick_spacing: number): number {
    if (tick_index % tick_spacing === 0) {
      return tick_index
    }

    let res: number
    if (tick_index > 0) {
      res = tick_index - (tick_index % tick_spacing) + tick_spacing
    } else if (tick_index < 0) {
      res = tick_index + (Math.abs(tick_index) % tick_spacing) - tick_spacing
    } else {
      res = tick_index
    }

    if (res % tick_spacing !== 0) {
      return handleMessageError(VaultsErrorCode.AssertionError, 'Assertion failed: res % tick_spacing == 0', {
        [DETAILS_KEYS.METHOD_NAME]: 'getValidTickIndex',
      })
    }

    if (Math.abs(res) < Math.abs(tick_index)) {
      return handleMessageError(VaultsErrorCode.AssertionError, 'Assertion failed: res.abs() >= tick_index', {
        [DETAILS_KEYS.METHOD_NAME]: 'getValidTickIndex',
      })
    }

    return res
  }

  /**
   * lp_amount = (total_lp_amount * delta_liquidity) / total_liquidity_in_vault
   * @param total_amount
   * @param current_liquidity
   * @param total_liquidity
   */
  static getLpAmountByLiquidity(vault: Vault, current_liquidity: string) {
    if (vault.total_supply === '0') {
      return current_liquidity
    }
    return d(vault.total_supply).mul(current_liquidity).div(vault.liquidity).toFixed(0, Decimal.ROUND_DOWN).toString()
  }

  /**
   * delta_liquidity = (lp_token_amount * total_liquidity_in_vault) / total_lp_amount
   * @param vault
   * @param current_amount
   * @returns
   */
  static getShareLiquidityByAmount(vault: Vault, current_amount: string) {
    if (vault.total_supply === '0') {
      return '0'
    }
    return d(current_amount).mul(vault.liquidity).div(vault.total_supply).toFixed(0, Decimal.ROUND_DOWN).toString()
  }

  static getProtocolFeeAmount(vault: Vault, amount: string) {
    return d(amount).mul(vault.protocol_fee_rate).div(PROTOCOL_FEE_DENOMINATOR).toFixed(0, Decimal.ROUND_CEIL)
  }

  static buildFarmsPositionNFT(fields: any): FarmsPositionNFT {
    const clmmFields = fields.clmm_postion.fields
    const farmsPositionNft: FarmsPositionNFT = {
      id: fields.id.id,
      url: clmmFields.url,
      pool_id: fields.pool_id,
      coin_type_a: extractStructTagFromType(clmmFields.coin_type_a.fields.name).full_address,
      coin_type_b: extractStructTagFromType(clmmFields.coin_type_b.fields.name).full_address,
      description: clmmFields.description,
      name: clmmFields.name,
      index: clmmFields.index,
      liquidity: clmmFields.liquidity,
      clmm_position_id: clmmFields.id.id,
      clmm_pool_id: clmmFields.pool,
      tick_lower_index: asIntN(BigInt(clmmFields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(clmmFields.tick_upper_index.fields.bits)),
      rewards: [],
    }
    return farmsPositionNft
  }

  static buildPool(objects: SuiObjectResponse): Vault {
    const fields = getObjectFields(objects)
    const type = getObjectType(objects) as string
    const { positions } = fields
    if (fields && positions.length > 0) {
      const farmsPosition = VaultsUtils.buildFarmsPositionNFT(positions[0].fields)!

      const masterNFT: Vault = {
        id: fields.id.id,
        pool_id: fields.pool,
        protocol_fee_rate: fields.protocol_fee_rate,
        is_pause: fields.is_pause,
        harvest_assets: {
          harvest_assets_handle: fields.harvest_assets.fields.id.id,
          size: Number(fields.harvest_assets.fields.size),
        },
        lp_token_type: extractStructTagFromType(type).type_arguments[0],
        total_supply: fields.lp_token_treasury.fields.total_supply.fields.value,
        liquidity: fields.liquidity,
        max_quota: fields.max_quota,
        status: fields.status === 1 ? VaultStatus.STATUS_RUNNING : VaultStatus.STATUS_REBALANCING,
        quota_based_type: fields.quota_based_type.fields.name,
        position: farmsPosition,
      }
      return masterNFT
    }
    return handleMessageError(VaultsErrorCode.BuildError, 'buildPool error', {
      [DETAILS_KEYS.METHOD_NAME]: 'buildPool',
    })
  }



  public static buildVaultBalance(wallet_address: string, vault: Vault, lp_token_balance: CoinBalance, clmm_pool: Pool) {
    const liquidity = VaultsUtils.getShareLiquidityByAmount(vault, lp_token_balance.totalBalance)
    const { tick_lower_index, tick_upper_index, coin_type_a, coin_type_b } = vault.position
    const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(tick_lower_index)
    const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(tick_upper_index)
    const amount_info = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(liquidity),
      new BN(clmm_pool.current_sqrt_price),
      lower_sqrt_price,
      upper_sqrt_price,
      true
    )
    return {
      vault_id: vault.id,
      clmm_pool_id: vault.pool_id,
      owner: wallet_address,
      lp_token_type: vault.lp_token_type,
      lp_token_balance: lp_token_balance.totalBalance,
      liquidity,
      tick_lower_index,
      tick_upper_index,
      amount_a: amount_info.coin_amount_a.toString(),
      amount_b: amount_info.coin_amount_b.toString(),
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
    }
  }

  static parseVaultsVestInfo(res: SuiObjectResponse): VaultsVestInfo {
    const fields = getObjectFields(res)

    const type = getObjectType(res) as string
    const structTag = extractStructTagFromType(type)

    const posFields = fields.position.fields
    const position: VaultsPosition = {
      id: posFields.id.id,
      pool_id: posFields.pool,
      index: posFields.index,
      liquidity: posFields.liquidity,
      tick_lower_index: asIntN(BigInt(posFields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(posFields.tick_upper_index.fields.bits)),
      coin_type_a: fixCoinType(posFields.coin_type_a.fields.name, false),
      coin_type_b: fixCoinType(posFields.coin_type_b.fields.name, false),
      name: posFields.name,
      description: posFields.description,
      url: posFields.url,
    }

    const global_vesting_periods = fields.global_vesting_periods.map((item: any) => {
      return {
        period: item.fields.period,
        release_time: item.fields.release_time,
        redeemed_amount: item.fields.redeemed_amount,
        cetus_amount: item.fields.cetus_amount,
      }
    })
    const vaultsVestInfo: VaultsVestInfo = {
      id: fields.id.id,
      vault_id: fields.vault_id,
      index: fields.index,
      lp_coin_type: fields.lp_coin_type.fields.name,
      allocated_lp_amount: fields.allocated_lp_amount,
      position,
      balance: fields.balance,
      total_supply: fields.total_supply,
      impaired_a: fields.impaired_a,
      impaired_b: fields.impaired_b,
      redeemed_amount: fields.redeemed_amount,
      url: fields.url,
      coin_type_a: fixCoinType(fields.coin_a.fields.name, false),
      coin_type_b: fixCoinType(fields.coin_b.fields.name, false),
      cetus_amount: fields.cetus_amount,
      start_time: fields.start_time,
      global_vesting_periods,
      vest_infos: {
        id: fields.vester_infos.fields.id,
        size: fields.vester_infos.fields.size,
      },
    }

    return vaultsVestInfo
  }

  static parseVaultVestNFT(res: SuiObjectResponse): VaultVestNFT {
    const fields = getObjectFields(res)
    const type = getObjectType(res) as string

    const vaultVestNFT: VaultVestNFT = {
      id: fields.id.id,
      vault_id: fields.vault_id,
      index: fields.index,
      lp_amount: fields.lp_amount,
      url: fields.url,
      redeemed_amount: fields.redeemed_amount,
      impaired_a: fields.impaired_a,
      impaired_b: fields.impaired_b,
      period_infos: fields.period_infos.map((item: any) => {
        return {
          period: item.fields.period,
          cetus_amount: item.fields.cetus_amount,
          is_redeemed: item.fields.is_redeemed,
        }
      }),
      name: fields.name,
      vester_id: fields.vester_id,
    }

    return vaultVestNFT
  }
}

/**
 * Calculate the swap amount needed to achieve target ratio
 * @param balanceA token A balance
 * @param balanceB token B balance
 * @param current_price current price: B per A (i.e., 1 A = current_price B)
 *   - This represents how many B tokens you get for 1 A token
 *   - Example: if 1 A = 2 B, then current_price = "2"
 * @param target_ratio target ratio: B / A (i.e., target B/A ratio)
 *   - This represents the desired ratio of B to A after swap
 *   - Example: if you want B/A = 1.5, then target_ratio = "1.5"
 * @returns Object containing:
 *   - swap_direction: 'A_TO_B' or 'B_TO_A'
 *   - swap_amount: Amount to swap (in the source token)
 *   - final_amount_a: Final amount of token A after swap
 *   - final_amount_b: Final amount of token B after swap
 *
 * Note: The function automatically determines swap direction based on current ratio vs target ratio:
 * - If current B/A < target B/A: swap A -> B (to increase B/A ratio)
 * - If current B/A > target B/A: swap B -> A (to decrease B/A ratio)
 */
export function calcExactSwapAmount(
  balanceA: string,
  balanceB: string,
  current_price: string, // B per A
  target_ratio: string // target B / A
) {
  const A0 = d(balanceA)
  const B0 = d(balanceB)
  const price = d(current_price)
  const target = d(target_ratio)

  // -----------------------------
  // 0. both zero
  // -----------------------------
  if (A0.eq(0) && B0.eq(0)) {
    return {
      swap_direction: 'A_TO_B',
      swap_amount: '0',
      final_amount_a: '0',
      final_amount_b: '0',
    }
  }

  // -----------------------------
  // 1. determine swap direction
  // -----------------------------
  let swapAToB: boolean

  if (A0.gt(0) && B0.gt(0)) {
    const currentR = B0.div(A0)
    swapAToB = currentR.lt(target)
  } else if (A0.gt(0)) {
    swapAToB = true
  } else {
    swapAToB = false
  }

  // -----------------------------
  // 2. one-side-zero analytic solve
  // -----------------------------
  // A = 0, B > 0, B -> A
  if (A0.eq(0) && !swapAToB) {
    // (B0 - x) / (x / price) = target
    // (B0 - x) * price / x = target
    // (B0 - x) * price = target * x
    // B0 * price = target * x + x * price
    // B0 * price = x * (target + price)
    // x = B0 * price / (target + price)
    const x = B0.mul(price).div(target.plus(price))

    if (x.lte(0) || x.gt(B0)) {
      return {
        swap_direction: 'B_TO_A',
        swap_amount: '0',
        final_amount_a: '0',
        final_amount_b: B0.toFixed(0),
      }
    }

    return {
      swap_direction: 'B_TO_A',
      swap_amount: x.toFixed(0),
      final_amount_a: x.div(price).toFixed(0),
      final_amount_b: B0.minus(x).toFixed(0),
    }
  }

  // B = 0, A > 0, A -> B
  if (B0.eq(0) && swapAToB) {
    // (x * price) / (A0 - x) = target
    // x = A0 * target / (price + target)
    const x = A0.mul(target).div(price.plus(target))

    if (x.lte(0) || x.gt(A0)) {
      return {
        swap_direction: 'A_TO_B',
        swap_amount: '0',
        final_amount_a: A0.toFixed(0),
        final_amount_b: '0',
      }
    }

    return {
      swap_direction: 'A_TO_B',
      swap_amount: x.toFixed(0),
      final_amount_a: A0.minus(x).toFixed(0),
      final_amount_b: x.mul(price).toFixed(0),
    }
  }

  // -----------------------------
  // 3. binary search setup
  // -----------------------------
  const maxSwap = swapAToB ? A0 : B0

  if (maxSwap.lte(0)) {
    return {
      swap_direction: swapAToB ? 'A_TO_B' : 'B_TO_A',
      swap_amount: '0',
      final_amount_a: A0.toFixed(0),
      final_amount_b: B0.toFixed(0),
    }
  }

  const maxR = target
  const minR = target.mul(0.999)

  let left = d(0)
  let right = maxSwap
  let best: Decimal | null = null

  function computeFinal(x: Decimal) {
    if (swapAToB) {
      // A -> B: x units of A can be exchanged for x * price units of B
      const A = A0.minus(x)
      const B = B0.plus(x.mul(price))
      return { A, B, R: B.div(A) }
    } else {
      // B -> A: x units of B can be exchanged for x / price units of A
      const A = A0.plus(x.div(price))
      const B = B0.minus(x)
      return { A, B, R: B.div(A) }
    }
  }

  // -----------------------------
  // 4. binary search
  // -----------------------------
  for (let i = 0; i < 120; i++) {
    const mid = left.plus(right).div(2)
    const { A, B, R } = computeFinal(mid)

    if (A.lte(0) || B.lte(0)) {
      right = mid
      continue
    }

    if (R.gt(maxR)) {
      // R > maxR: ratio too high, need to adjust swap amount
      if (swapAToB) {
        // A -> B: reduce swap amount to decrease ratio
        right = mid
      } else {
        // B -> A: increase swap amount to decrease ratio
        left = mid
      }
    } else if (R.lt(minR)) {
      // R < minR: ratio too low, need to adjust swap amount
      if (swapAToB) {
        // A -> B: increase swap amount to increase ratio
        left = mid
      } else {
        // B -> A: reduce swap amount to increase ratio
        right = mid
      }
    } else {
      best = mid
      right = mid
    }
  }

  // -----------------------------
  // 5. finalize
  // -----------------------------
  if (!best) {
    return {
      swap_direction: swapAToB ? 'A_TO_B' : 'B_TO_A',
      swap_amount: '0',
      final_amount_a: A0.toFixed(0),
      final_amount_b: B0.toFixed(0),
    }
  }

  const { A, B } = computeFinal(best)

  return {
    swap_direction: swapAToB ? 'A_TO_B' : 'B_TO_A',
    swap_amount: best.toFixed(0),
    final_amount_a: A.toFixed(0),
    final_amount_b: B.toFixed(0),
  }
}
