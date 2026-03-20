import { SuiObjectResponse } from '@mysten/sui/jsonRpc'
import { ClmmVestInfo, PositionVesting } from '../types/vest'
import { asIntN, d, extractStructTagFromType, fixCoinType, getObjectFields, getObjectType } from '@cetusprotocol/common-sdk'
import { PoolLiquiditySnapshot, PositionSnapshot } from '../types/clmm_type'

export const BPS = 10000
export class VestUtils {
  static parseClmmVestInfo(res: SuiObjectResponse): ClmmVestInfo {
    const fields = getObjectFields(res)
    const type = getObjectType(res) as any
    const structTag = extractStructTagFromType(type)

    const global_vesting_periods = fields.global_vesting_periods.map((item: any) => {
      return {
        period: item.fields.period,
        release_time: item.fields.release_time,
        redeemed_amount: item.fields.redeemed_amount,
        percentage: d(item.fields.percentage).div(BPS).toNumber(),
      }
    })

    const vestInfo: ClmmVestInfo = {
      id: fields.id.id,
      balance: fields.balance,
      global_vesting_periods,
      total_value: fields.total_value,
      total_cetus_amount: fields.total_cetus_amount,
      redeemed_amount: fields.redeemed_amount,
      start_time: fields.start_time,
      type: structTag.full_address,
      positions: {
        id: fields.positions.fields.id,
        size: fields.positions.fields.size,
      },
    }
    return vestInfo
  }

  static parsePositionVesting(fields: any): PositionVesting {
    const info: PositionVesting = {
      position_id: fields.position_id,
      cetus_amount: fields.cetus_amount,
      redeemed_amount: fields.redeemed_amount,
      is_paused: fields.is_paused,
      impaired_a: fields.impaired_a,
      impaired_b: fields.impaired_b,
      period_details: fields.period_details,
      coin_type_a: fixCoinType(fields.coin_a.name, false),
      coin_type_b: fixCoinType(fields.coin_b.name, false),
    }

    return info
  }

  static parsePoolLiquiditySnapshot(res: SuiObjectResponse): PoolLiquiditySnapshot {
    const fields = getObjectFields(res)
    const info: PoolLiquiditySnapshot = {
      current_sqrt_price: fields.current_sqrt_price,
      remove_percent: d(fields.remove_percent).div(1000000).toString(),
      snapshots: {
        id: fields.snapshots.fields.id.id,
        size: fields.snapshots.fields.size,
      },
    }

    return info
  }

  static parsePositionSnapshot(res: SuiObjectResponse): PositionSnapshot {
    const fields = getObjectFields(res)
    const subFields = fields.value.fields.value.fields
    const info: PositionSnapshot = {
      position_id: fields.name,
      liquidity: subFields.liquidity,
      tick_lower_index: asIntN(BigInt(subFields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(subFields.tick_upper_index.fields.bits)),
      fee_owned_a: subFields.fee_owned_a,
      fee_owned_b: subFields.fee_owned_b,
      value_cut: subFields.value_cut,
      rewards: subFields.rewards,
    }

    return info
  }
}
