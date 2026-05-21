import { d, extractStructTagFromType, normalizeCoinType } from '@cetusprotocol/common-sdk'
import type {
  BonusTypesV2,
  DividendManager,
  DividendReward,
  LockCetus,
  LockCetusVersion,
  LockUpManager,
  VeNFT,
  VeNFTDividendInfo,
} from '../types/xcetus_type'
import { ONE_DAY_SECONDS } from '../types/xcetus_type'

export class XCetusUtil {
  static buildVeNFTDividendInfo(fields: any): VeNFTDividendInfo {
    const veNFTDividendInfo: VeNFTDividendInfo = {
      id: fields.id.id,
      venft_id: fields.name,
      rewards: [],
    }

    fields.value.fields.value.fields.dividends.fields.contents.forEach((item: any) => {
      const periodRewards: any[] = []
      item.fields.value.fields.contents.forEach((reward: any) => {
        const rewardAmount = reward.fields.value
        if (d(rewardAmount).gt(0)) {
          periodRewards.push({
            coin_type: extractStructTagFromType(reward.fields.key.fields.name).source_address,
            amount: rewardAmount,
          })
        }
      })

      if (periodRewards.length > 0) {
        veNFTDividendInfo.rewards.push({
          period: Number(item.fields.key),
          rewards: periodRewards,
          version: 'v1',
        })
      }
    })

    return veNFTDividendInfo
  }

  static buildDividendManager(fields: any): DividendManager {
    const dividendManager: DividendManager = {
      id: fields.id,
      dividends: {
        id: fields.dividends.id,
        size: fields.dividends.size,
      },
      venft_dividends: {
        id: fields.venft_dividends.id,
        size: fields.venft_dividends.size,
      },
      bonus_types: [],
      start_time: Number(fields.start_time),
      interval_day: Number(fields.interval_day),
      balances: {
        id: fields.balances.id,
        size: fields.balances.size,
      },
      is_open: fields.is_open,
    }

    fields.bonus_types.forEach((item: any) => {
      dividendManager.bonus_types.push(extractStructTagFromType(item.name).source_address)
    })

    return dividendManager
  }

  static buildLockUpManager(fields: any): LockUpManager {
    const lockUpManager: LockUpManager = {
      id: fields.id,
      balance: fields.balance,
      treasury_manager: fields.treasury_manager,
      extra_treasury: fields.extra_treasury,
      lock_infos: {
        lock_handle_id: fields.lock_infos.id,
        size: Number(fields.lock_infos.size),
      },
      type_name: normalizeCoinType(fields.type_name.name),
      min_lock_day: Number(fields.min_lock_day),
      max_lock_day: Number(fields.max_lock_day),
      package_version: Number(fields.package_version),
      max_percent_numerator: Number(fields.max_percent_numerator),
      min_percent_numerator: Number(fields.min_percent_numerator),
    }

    return lockUpManager
  }

  static buildLockCetus(data: any, version: LockCetusVersion = 'v1'): LockCetus {
    const fields = data.json
    const lockCetus = {
      id: fields.id,
      type: extractStructTagFromType(data.type).source_address,
      version,
      locked_start_time: Number(fields.locked_start_time),
      locked_until_time: Number(fields.locked_until_time),
      cetus_amount: fields.balance,
      xcetus_amount: '0',
      lock_day: 0,
    }
    lockCetus.lock_day = (lockCetus.locked_until_time - lockCetus.locked_start_time) / ONE_DAY_SECONDS
    return lockCetus
  }

  static getAvailableXCetus(venft: VeNFT, locks: LockCetus[]): string {
    let lockAmount = d(0)
    locks.forEach((lock) => {
      lockAmount = lockAmount.add(lock.xcetus_amount)
    })

    return d(venft.xcetus_balance).sub(lockAmount).toString()
  }

  static getWaitUnLockCetus(locks: LockCetus[]): LockCetus[] {
    return locks.filter((lock) => {
      return !XCetusUtil.isLocked(lock)
    })
  }

  static getLockingCetus(locks: LockCetus[]): LockCetus[] {
    return locks.filter((lock) => {
      return XCetusUtil.isLocked(lock)
    })
  }

  static isLocked(lock: LockCetus): boolean {
    return lock.locked_until_time > Date.parse(new Date().toString()) / 1000
  }

  static buildDividendRewardTypeList(reward_list?: DividendReward[], reward_list_v2?: DividendReward[]): string[] {
    const uniqueItems = new Set<string>()
    reward_list?.forEach((obj) => {
      obj.rewards.forEach((item) => {
        uniqueItems.add(item.coin_type)
      })
    })
    reward_list_v2?.forEach((obj) => {
      obj.rewards.forEach((item) => {
        uniqueItems.add(item.coin_type)
      })
    })
    return Array.from(uniqueItems)
  }

  static buildDividendRewardTypeListV2(reward_list?: DividendReward[]): BonusTypesV2 {
    const uniqueItems: BonusTypesV2 = {}
    reward_list?.forEach((obj: DividendReward) => {
      if (obj.version === 'v2') {
        obj.rewards.forEach((item) => {
          if (uniqueItems[item.coin_type]) {
            uniqueItems[item.coin_type].push(obj.period)
          } else {
            uniqueItems[item.coin_type] = []
            uniqueItems[item.coin_type].push(obj.period)
          }
        })
      }
    })
    return uniqueItems
  }

  static getNextStartTime(dividend_manager: DividendManager): number {
    const currentTime = Date.now() / 1000
    const { start_time, interval_day } = dividend_manager

    const currentPeriod = Math.ceil((currentTime - start_time) / (interval_day * ONE_DAY_SECONDS))
    const nextStartTime = start_time + currentPeriod * interval_day * ONE_DAY_SECONDS

    return nextStartTime
  }
}
