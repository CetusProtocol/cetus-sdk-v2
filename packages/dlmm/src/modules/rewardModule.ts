import { Transaction } from '@mysten/sui/transactions'
import {
  asIntN,
  asUintN,
  CLOCK_ADDRESS,
  CoinAssist,
  d,
  getObjectFields,
  getPackagerConfigs,
  IModule,
  MathUtil,
} from '@cetusprotocol/common-sdk'
import { CetusDlmmSDK } from '../sdk'
import { AddRewardOption, InitRewardOption, RewardAccessOption, RewardPeriodEmission, RewardWhiteListOption } from '../types/dlmm'
import BN from 'bn.js'

export class RewardModule implements IModule<CetusDlmmSDK> {
  protected _sdk: CetusDlmmSDK

  constructor(sdk: CetusDlmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async getRewardPeriodEmission(
    period_emission_handle: string,
    curr_emission_per_second: string,
    last_updated_time: number
  ): Promise<RewardPeriodEmission[]> {
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(period_emission_handle)
    const result: RewardPeriodEmission[] = []
    const warpIds = res.data.map((item) => item.objectId)
    if (warpIds.length > 0) {
      const warRes = await this._sdk.FullClient.batchGetObjects(warpIds, {
        showContent: true,
      })

      warRes.forEach((item) => {
        const fields = getObjectFields(item)
        const emission_rate = MathUtil.u128ToI128(new BN(fields.value.fields.value.fields.bits)).toString()
        const time = fields.name
        const visualizedTime = new Date(Number(time) * 1000).toLocaleString()
        const emissions_per = MathUtil.fromX64(new BN(emission_rate)).toString()
        const rewardPeriodEmission: RewardPeriodEmission = {
          emissions_per_second: '0',
          emissions_per_day: '0',
          emissions_per,
          time,
          visualized_time: visualizedTime,
        }
        result.push(rewardPeriodEmission)
      })
    }
    const sortedList = result.sort((a, b) => Number(a.time) - Number(b.time))
    const newNodeList: RewardPeriodEmission[] = []

    newNodeList.push({
      emissions_per_second: curr_emission_per_second,
      emissions_per_day: d(curr_emission_per_second)
        .mul(60 * 60 * 24)
        .toString(),
      emissions_per: '0',
      time: last_updated_time.toString(),
      visualized_time: new Date(last_updated_time * 1000).toLocaleString(),
    })

    let last_emission_rate = curr_emission_per_second
    for (let i = 0; i < sortedList.length; i++) {
      const item = sortedList[i]
      if (d(item.time).lte(last_updated_time)) {
        continue
      }
      last_emission_rate = d(last_emission_rate).add(d(item.emissions_per)).toString()
      const emissions_per_day = d(last_emission_rate)
        .mul(60 * 60 * 24)
        .toString()
      if (d(last_emission_rate).lt(0)) {
        item.emissions_per_second = '0'
        item.emissions_per_day = '0'
      } else {
        item.emissions_per_second = last_emission_rate
        item.emissions_per_day = emissions_per_day
      }
      newNodeList.push(item)
    }

    return newNodeList
  }

  /**
   * Add reward to a pool
   * @param options - The options for adding reward
   * @returns The transaction for adding reward
   */
  addRewardPayload(option: AddRewardOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { dlmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    const { pool_id, reward_coin_type, reward_amount, start_time_seconds, end_time_seconds, coin_type_a, coin_type_b } = option
    const reward_coin = CoinAssist.buildCoinWithBalance(BigInt(reward_amount), reward_coin_type, tx)

    // const start_time_vec = tx.makeMoveVec({
    //   elements: start_time_seconds ? [tx.pure.u64(start_time_seconds)] : [],
    //   type: 'u64',
    // })
    tx.pure.option('u64', start_time_seconds)

    tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::add_reward`,
      arguments: [
        tx.object(pool_id),
        reward_coin,
        tx.pure.option('u64', start_time_seconds),
        tx.pure.u64(end_time_seconds),
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [coin_type_a, coin_type_b, reward_coin_type],
    })

    return tx
  }

  /**
   * Initialize reward for a pool
   * @param option - The option for initializing reward
   * @param tx - The transaction to add the reward to
   * @returns The transaction for initializing reward
   */
  initRewardPayload(option: InitRewardOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { dlmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    const { pool_id, reward_coin_types, coin_type_a, coin_type_b } = option

    reward_coin_types.forEach((reward_coin_type) => {
      tx.moveCall({
        target: `${dlmm_pool.published_at}::pool::initialize_reward`,
        arguments: [tx.object(pool_id), tx.object(global_config_id), tx.object(versioned_id), tx.object(CLOCK_ADDRESS)],
        typeArguments: [coin_type_a, coin_type_b, reward_coin_type],
      })
    })

    return tx
  }

  /**
   * Build the payload for making reward public or private
   * @param option - The option for making reward public or private
   * @param tx - The transaction to make the reward public or private
   * @returns The transaction for making reward public or private
   */
  buildRewardAccessPayload(option: RewardAccessOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { dlmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    const { pool_id, type, coin_type_a, coin_type_b } = option

    tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::${type === 'to_public' ? 'make_reward_public' : 'make_reward_private'}`,
      arguments: [tx.object(pool_id), tx.object(global_config_id), tx.object(versioned_id)],
      typeArguments: [coin_type_a, coin_type_b],
    })

    return tx
  }
}
