// @ts-nocheck
import { DevInspectResults } from '@mysten/sui/jsonRpc'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import BN from 'bn.js'
import {
  CLOCK_ADDRESS,
  CoinAssist,
  d,
  DETAILS_KEYS,
  fixCoinType,
  getObjectFields,
  getPackagerConfigs,
  IModule,
  MathUtil,
  ZERO,
} from '@cetusprotocol/common-sdk'
import { ConfigErrorCode, handleMessageError } from '../errors/errors'
import { CetusClmmV2SDK } from '../sdk'
import {
  Pool,
  PosRewarderResult,
  CollectRewarderOptions,
  RewardPeriodEmission,
  AddRewardOption,
  InitRewardOption,
  RewardAccessOption
} from '../types'

/**
 * Helper class to help interact with clmm position rewaeder with a rewaeder router interface.
 */
export class RewarderModule implements IModule<CetusClmmV2SDK> {
  protected _sdk: CetusClmmV2SDK

  private growthGlobal: BN[]

  constructor(sdk: CetusClmmV2SDK) {
    this._sdk = sdk
    this.growthGlobal = [ZERO, ZERO, ZERO]
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

  initReward(option: InitRewardOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { clmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const { pool_id, reward_coin_types, coin_type_a, coin_type_b } = option

    reward_coin_types.forEach((reward_coin_type) => {
      tx.moveCall({
        target: `${clmm_pool.published_at}::pool::initialize_reward`,
        arguments: [tx.object(pool_id), tx.object(global_config_id), tx.object(versioned_id), tx.object(CLOCK_ADDRESS)],
        typeArguments: [coin_type_a, coin_type_b, reward_coin_type],
      })
    })

    return tx
  }

  buildRewardAccessPayload(option: RewardAccessOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { clmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const { pool_id, type, coin_type_a, coin_type_b } = option

    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::${type === 'to_public' ? 'make_reward_public' : 'make_reward_private'}`,
      arguments: [tx.object(pool_id), tx.object(global_config_id), tx.object(versioned_id)],
      typeArguments: [coin_type_a, coin_type_b],
    })

    return tx
  }


  addReward(option: AddRewardOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { clmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const { pool_id, reward_coin_type, reward_amount, start_time_seconds, end_time_seconds, coin_type_a, coin_type_b } = option
    const reward_coin = CoinAssist.buildCoinWithBalance(BigInt(reward_amount), reward_coin_type, tx)

    // const start_time_vec = tx.makeMoveVec({
    //   elements: start_time_seconds ? [tx.pure.u64(start_time_seconds)] : [],
    //   type: 'u64',
    // })
    tx.pure.option('u64', start_time_seconds)

    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::add_reward`,
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

  async fetchPosRewardersAmount(options: CollectRewarderOptions[], tx?: Transaction): Promise<Record<string, PosRewarderResult>> {
    tx = tx ? tx : new Transaction()

    for (const option of options) {
      this.collectRewarder(option, tx)
    }

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x'),
    })

    if (simulateRes.error != null) {
      handleMessageError(
        ConfigErrorCode.InvalidConfig,
        `fetch position rewards error code: ${simulateRes.error ?? 'unknown error'}, please check config and params`,
        {
          [DETAILS_KEYS.METHOD_NAME]: 'fetchPosRewardersAmount',
          [DETAILS_KEYS.REQUEST_PARAMS]: { options },
        }
      )
    }

    const rewarderData = this.parsedPosRewardData(simulateRes)


    return rewarderData
  }

  parsedPosRewardData(simulate_res: DevInspectResults): Record<string, PosRewarderResult> {
    const rewarderData: Record<string, PosRewarderResult> = {}
    const rewarderValueData: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('CollectRewardEvent')
    })

    for (let i = 0; i < rewarderValueData.length; i += 1) {
      const { parsedJson } = rewarderValueData[i]
      const { position, pool, amount, reward_type } = parsedJson
      const cachedPosRewarderResult = rewarderData[position]
      const fixedRewardType = fixCoinType(reward_type.name, false)
      if (cachedPosRewarderResult) {
        cachedPosRewarderResult.rewarder_amounts.push({
          amount_owned: amount,
          reward_type: fixedRewardType,
        })
      } else {
        rewarderData[position] = {
          position_id: position,
          pool_id: pool,
          rewarder_amounts: [{
            amount_owned: amount,
            reward_type: fixedRewardType,
          }],
        }
      }
    }

    return rewarderData
  }

  collectRewarder(option: CollectRewarderOptions, tx: Transaction) {
    const receive_rewarders = this.collectRewarderReturnCoins(option, tx)
    tx.transferObjects(receive_rewarders.map((rewarder) => rewarder.coin_object_id), this.sdk.getSenderAddress())
  }

  collectRewarderReturnCoins(option: CollectRewarderOptions, tx: Transaction) {
    const { clmm_pool } = this.sdk.sdkOptions
    const { pool_id, position_id, rewarder_coin_types, recalculate, coin_type_a, coin_type_b } = option
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const receive_rewarders: { coin_type: string, coin_object_id: TransactionObjectArgument, position_id: string }[] = []

    rewarder_coin_types.forEach((type) => {
      const rewarder_coin = tx.moveCall({
        target: `${clmm_pool.published_at}::pool::collect_reward`,
        typeArguments: [coin_type_a, coin_type_b, type],
        arguments: [
          tx.object(pool_id),
          tx.object(position_id),
          tx.pure.bool(recalculate),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
      })

      receive_rewarders.push({
        coin_type: type,
        coin_object_id: CoinAssist.fromBalance(rewarder_coin, type, tx),
        position_id: position_id,
      })
    })
    return receive_rewarders
  }
}
