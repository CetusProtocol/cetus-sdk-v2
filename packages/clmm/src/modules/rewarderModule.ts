import { DevInspectResults } from '@mysten/sui/client'
import { Transaction, TransactionArgument, TransactionObjectArgument } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import BN from 'bn.js'
import {
  BuildCoinResult,
  CLOCK_ADDRESS,
  CoinAssist,
  DETAILS_KEYS,
  getPackagerConfigs,
  IModule,
  MathUtil,
  normalizeCoinType,
  ZERO,
} from '@cetusprotocol/common-sdk'
import { ConfigErrorCode, handleMessageError } from '../errors/errors'
import { CetusClmmSDK } from '../sdk'
import {
  CollectFeesQuote,
  CollectRewarderParams,
  FetchPosFeeParams,
  FetchPosRewardParams,
  Pool,
  Position,
  PosRewarderResult,
  RewarderAmountOwned,
  TickData,
  CollectRewarderAndReturnCoinParams
} from '../types'
import { ClmmFetcherModule, ClmmIntegratePoolV2Module, ClmmIntegratePoolV3Module } from '../types/sui'
import { PositionUtils } from '../utils/positionUtils'
import { buildTransferCoin } from '../utils/common'

/**
 * Helper class to help interact with clmm position rewaeder with a rewaeder router interface.
 */
export class RewarderModule implements IModule<CetusClmmSDK> {
  protected _sdk: CetusClmmSDK

  private growthGlobal: BN[]

  constructor(sdk: CetusClmmSDK) {
    this._sdk = sdk
    this.growthGlobal = [ZERO, ZERO, ZERO]
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Gets the emissions for the given pool every day.
   *
   * @param {string} pool_id The object ID of the pool.
   * @returns {Promise<Array<{emissions: number, coinAddress: string}>>} A promise that resolves to an array of objects with the emissions and coin address for each rewarder.
   */
  async emissionsEveryDay(pool_id: string) {
    const currentPool: Pool = await this.sdk.Pool.getPool(pool_id)
    const rewarderInfos = currentPool.rewarder_infos
    if (!rewarderInfos) {
      return null
    }

    const emissionsEveryDay = []
    for (const rewarderInfo of rewarderInfos) {
      const emissionSeconds = MathUtil.fromX64(new BN(rewarderInfo.emissions_per_second))
      emissionsEveryDay.push({
        emissions: Math.floor(emissionSeconds.toNumber() * 60 * 60 * 24),
        coin_type: rewarderInfo.coin_type,
      })
    }

    return emissionsEveryDay
  }

  /**
   * Fetches the Position reward amount for a given list of addresses.
   * @param {string[]}position_ids An array of position object id.
   * @returns {Promise<Record<string, RewarderAmountOwned[]>>} A Promise that resolves with the fetched position reward amount for the specified position object ids.
   */
  async batchFetchPositionRewarders(position_ids: string[]): Promise<Record<string, RewarderAmountOwned[]>> {
    const posRewardParamsList: FetchPosRewardParams[] = []
    for (const id of position_ids) {
      const position = await this._sdk.Position.getPositionById(id, false)
      const pool = await this._sdk.Pool.getPool(position.pool, false)
      posRewardParamsList.push({
        pool_id: pool.id,
        position_id: position.pos_object_id,
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        rewarder_types: pool.rewarder_infos.map((rewarder) => rewarder.coin_type),
      })
    }

    const positionMap: Record<string, RewarderAmountOwned[]> = {}

    if (posRewardParamsList.length > 0) {
      const result: PosRewarderResult[] = await this.fetchPosRewardersAmount(posRewardParamsList)
      for (const posRewarderInfo of result) {
        positionMap[posRewarderInfo.position_id] = posRewarderInfo.rewarder_amounts
      }
      return positionMap
    }
    return positionMap
  }

  /**
   * Fetch the position rewards for a given pool.
   * @param {Pool}pool Pool object
   * @param {string}position_id Position object id
   * @returns {Promise<RewarderAmountOwned[]>} A Promise that resolves with the fetched position reward amount for the specified position object id.
   */
  async fetchPositionRewarders(pool: Pool, position_id: string): Promise<RewarderAmountOwned[]> {
    const param = {
      pool_id: pool.id,
      position_id: position_id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      rewarder_types: pool.rewarder_infos.map((rewarder) => rewarder.coin_type),
    }

    const result = await this.fetchPosRewardersAmount([param])

    return result[0].rewarder_amounts
  }

  /**
   * Fetches the Position fee amount for a given list of addresses.
   * @param position_ids An array of position object id.
   * @returns {Promise<Record<string, CollectFeesQuote>>} A Promise that resolves with the fetched position fee amount for the specified position object ids.
   * @deprecated This method is deprecated and may be removed in future versions. Use alternative methods if available.
   */
  async batchFetchPositionFees(position_ids: string[]): Promise<Record<string, CollectFeesQuote>> {
    return await this._sdk.Position.batchFetchPositionFees(position_ids)
  }

  /**
   * Fetches the Position fee amount for a given list of addresses.
   * @param params  An array of FetchPosFeeParams objects containing the target addresses and their corresponding amounts.
   * @returns
   */
  async fetchPosFeeAmount(params: FetchPosFeeParams[]): Promise<CollectFeesQuote[]> {
    return await this._sdk.Position.fetchPosFeeAmount(params)
  }

  public buildFetchPosReward(params: FetchPosRewardParams, tx: Transaction) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const typeArguments = [params.coin_type_a, params.coin_type_b]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.pure.address(params.position_id),
      tx.object(CLOCK_ADDRESS),
    ]
    tx.moveCall({
      target: `${integrate.published_at}::${ClmmFetcherModule}::fetch_position_rewards`,
      arguments: args,
      typeArguments,
    })
  }

  /**
   * Fetches the Position reward amount for a given list of addresses.
   * @param params  An array of FetchPosRewardParams objects containing the target addresses and their corresponding amounts.
   * @returns
   */
  async fetchPosRewardersAmount(params: FetchPosRewardParams[]) {
    const tx = new Transaction()

    for (const paramItem of params) {
      this.buildFetchPosReward(paramItem, tx)
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
          [DETAILS_KEYS.REQUEST_PARAMS]: { params },
        }
      )
    }

    const rewarderData = this.parsedPosRewardData(simulateRes)

    const result: PosRewarderResult[] = []

    for (let i = 0; i < params.length; i += 1) {
      const rewarder = rewarderData[params[i].position_id]
      if (rewarder) {
        const posRewarderResult: PosRewarderResult = {
          pool_id: params[i].pool_id,
          position_id: params[i].position_id,
          rewarder_amounts: rewarder.rewarder_amount.map((amount: string, index: number) => {
            return {
              amount_owned: amount,
              coin_type: params[i].rewarder_types[index],
            }
          }),
        }
        result.push(posRewarderResult)
      }
    }

    return result
  }

  parsedPosRewardData(simulate_res: DevInspectResults) {
    const rewarderData: Record<string, { position_id: string; rewarder_amount: string[] }> = {}
    const rewarderValueData: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('fetcher_script::FetchPositionRewardsEvent')
    })

    for (let i = 0; i < rewarderValueData.length; i += 1) {
      const { parsedJson } = rewarderValueData[i]
      const posObj = {
        position_id: parsedJson.position_id,
        rewarder_amount: parsedJson.data,
      }
      rewarderData[parsedJson.position_id] = posObj
    }

    return rewarderData
  }

  /**
   * Fetches the pool reward amount for a given account and pool object id.
   * @param {string} account - The target account.
   * @param {string} pool_object_id - The target pool object id.
   * @returns {Promise<number|null>} - A Promise that resolves with the fetched pool reward amount for the specified account and pool, or null if the fetch is unsuccessful.
   */
  async fetchPoolRewardersAmount(account: string, pool_object_id: string) {
    const pool: Pool = await this.sdk.Pool.getPool(pool_object_id)
    const positions = await this.sdk.Position.getPositionList(account, [pool_object_id])

    const params: FetchPosRewardParams[] = []

    for (const position of positions) {
      params.push({
        pool_id: pool.id,
        position_id: position.pos_object_id,
        rewarder_types: pool.rewarder_infos.map((rewarder) => rewarder.coin_type),
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
      })
    }

    const result = await this.fetchPosRewardersAmount(params)

    const rewarderAmount = [ZERO, ZERO, ZERO]

    if (result != null) {
      for (const posRewarderInfo of result) {
        for (let j = 0; j < posRewarderInfo.rewarder_amounts.length; j += 1) {
          rewarderAmount[j] = rewarderAmount[j].add(new BN(posRewarderInfo.rewarder_amounts[j].amount_owned))
        }
      }
    }
    return rewarderAmount
  }

  private async getPoolLowerAndUpperTicks(ticks_handle: string, positions: Position[]): Promise<TickData[][]> {
    const lower_ticks: TickData[] = []
    const upper_ticks: TickData[] = []

    for (const pos of positions) {
      const tick_lower = await this.sdk.Pool.getTickDataByIndex(ticks_handle, pos.tick_lower_index)
      const tick_upper = await this.sdk.Pool.getTickDataByIndex(ticks_handle, pos.tick_upper_index)
      lower_ticks.push(tick_lower!)
      upper_ticks.push(tick_upper!)
    }

    return [lower_ticks, upper_ticks]
  }

  /**
   * Collect rewards from Position.
   * @param params
   * @returns
   */
  async collectRewarderPayload(params: CollectRewarderParams): Promise<Transaction> {
    const allCoinAsset = await this.sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress(), null)
    let tx = new Transaction()

    tx = PositionUtils.createCollectRewarderAndFeeParams(this._sdk, tx, params, allCoinAsset)
    return tx
  }

  /**
   * batch Collect rewards from Position.
   * @param params
   * @param tx
   * @param input_coin_a
   * @param input_coin_b
   * @returns
   */
  async batchCollectRewardsPayload(
    params: CollectRewarderParams[],
    tx?: Transaction,
    input_coin_a?: TransactionObjectArgument,
    input_coin_b?: TransactionObjectArgument
  ) {
    const all_coin_asset = await this.sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress(), null)
    tx = tx || new Transaction()
    const coin_id_maps: Record<string, BuildCoinResult> = {}
    params.forEach((item) => {
      const coin_type_a = normalizeCoinType(item.coin_type_a)
      const coin_type_b = normalizeCoinType(item.coin_type_b)

      if (item.collect_fee) {
        let coin_a_input = coin_id_maps[coin_type_a]
        if (coin_a_input == null) {
          if (input_coin_a == null) {
            coin_a_input = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coin_type_a, false)
          } else {
            coin_a_input = {
              target_coin: input_coin_a,
              remain_coins: [],
              is_mint_zero_coin: false,
              target_coin_amount: '0',
              selected_coins: [],
            }
          }

          coin_id_maps[coin_type_a] = coin_a_input
        }

        let coin_b_input = coin_id_maps[coin_type_b]
        if (coin_b_input == null) {
          if (input_coin_b == null) {
            coin_b_input = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coin_type_b, false)
          } else {
            coin_b_input = {
              target_coin: input_coin_b,
              remain_coins: [],
              is_mint_zero_coin: false,
              target_coin_amount: '0',
              selected_coins: [],
            }
          }

          coin_id_maps[coin_type_b] = coin_b_input
        }

        tx = this._sdk.Position.createCollectFeeNoSendPayload(
          {
            pool_id: item.pool_id,
            pos_id: item.pos_id,
            coin_type_a: item.coin_type_a,
            coin_type_b: item.coin_type_b,
          },
          tx!,
          coin_a_input.target_coin,
          coin_b_input.target_coin
        )
      }
      const primaryCoinInputs: TransactionObjectArgument[] = []
      item.rewarder_coin_types.forEach((type) => {
        const coinType = normalizeCoinType(type)
        let coinInput = coin_id_maps[type]
        if (coinInput === undefined) {
          coinInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coinType, false)
          coin_id_maps[coinType] = coinInput
        }
        primaryCoinInputs.push(coinInput.target_coin)
      })

      tx = this.createCollectRewarderNoSendPayload(item, tx!, primaryCoinInputs)
    })

    Object.keys(coin_id_maps).forEach((key) => {
      const value = coin_id_maps[key]
      if (value.is_mint_zero_coin) {
        buildTransferCoin(this.sdk, tx!, value.target_coin, key, this.sdk.getSenderAddress())
      }
    })

    return tx
  }

  createCollectRewarderPayload(params: CollectRewarderParams, tx: Transaction, primary_coin_inputs: TransactionArgument[]) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const clmm_configs = getPackagerConfigs(clmm_pool)
    const type_arguments = [params.coin_type_a, params.coin_type_b]
    params.rewarder_coin_types.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::collect_reward`,
          typeArguments: [...type_arguments, type],
          arguments: [
            tx.object(clmm_configs.global_config_id),
            tx.object(params.pool_id),
            tx.object(params.pos_id),
            tx.object(clmm_configs.global_vault_id),
            primary_coin_inputs[index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }

  createCollectRewarderNoSendPayload(params: CollectRewarderParams, tx: Transaction, primary_coin_inputs: TransactionArgument[]) {
    const { clmm_pool, integrate } = this.sdk.sdkOptions
    const clmm_configs = getPackagerConfigs(clmm_pool)
    const type_arguments = [params.coin_type_a, params.coin_type_b]
    params.rewarder_coin_types.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::${ClmmIntegratePoolV3Module}::collect_reward`,
          typeArguments: [...type_arguments, type],
          arguments: [
            tx.object(clmm_configs.global_config_id),
            tx.object(params.pool_id),
            tx.object(params.pos_id),
            tx.object(clmm_configs.global_vault_id),
            primary_coin_inputs[index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }

  createCollectRewarderAndReturnCoinPayload(params: CollectRewarderAndReturnCoinParams, tx: Transaction) {
    const { clmm_pool } = this.sdk.sdkOptions
    const clmm_configs = getPackagerConfigs(clmm_pool)
    const type_arguments = [params.coin_type_a, params.coin_type_b]
    const args = [
      tx.object(getPackagerConfigs(clmm_pool).global_config_id),
      tx.object(params.pool_id),
      tx.object(params.pos_id),
      tx.object(clmm_configs.global_vault_id),
      tx.pure.bool(true),
      tx.object(CLOCK_ADDRESS),
    ]

    const rewarder_coin = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::collect_reward`,
      typeArguments: [...type_arguments, params.rewarder_coin_type],
      arguments: args,
    })
    return rewarder_coin
  }
}
