import { DevInspectResults } from '@mysten/sui/client'
import type { TransactionArgument, TransactionObjectArgument } from '@mysten/sui/transactions'
import { Transaction } from '@mysten/sui/transactions'
import type { CollectRewarderParams } from '@cetusprotocol/sui-clmm-sdk'
import { buildTransferCoin, ClmmIntegratePoolV2Module } from '@cetusprotocol/sui-clmm-sdk'
import type { BuildCoinResult, CoinAsset, DataPage, PaginationArgs } from '@cetusprotocol/common-sdk'
import {
  asUintN,
  CLOCK_ADDRESS,
  CoinAssist,
  DETAILS_KEYS,
  extractStructTagFromType,
  getPackagerConfigs,
  IModule,
  normalizeCoinType,
  removeHexPrefix,
} from '@cetusprotocol/common-sdk'
import { FarmsErrorCode, handleError } from '../errors/errors'
import type { CetusFarmsSDK } from '../sdk'
import type {
  AddLiquidityFixCoinParams,
  AddLiquidityParams,
  ClaimFeeAndClmmRewardParams,
  CollectClmmRewardParams,
  CollectFeeParams,
  FarmsConfigs,
  FarmsDepositParams,
  FarmsPool,
  FarmsPositionNFT,
  FarmsWithdrawParams,
  HarvestFeeAndClmmRewarderParams,
  HarvestParams,
  OpenPositionAddLiquidityStakeParams,
  PositionRewardInfo,
  RemoveLiquidityParams,
  RewarderConfig,
} from '../types/farmsType'
import { FarmsUtils } from '../utils/farms'

/**
 * Helper class to help interact with farm pools with a router interface.
 */
export class FarmsModule implements IModule<CetusFarmsSDK> {
  protected _sdk: CetusFarmsSDK

  constructor(sdk: CetusFarmsSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Get the list of farm pools
   * @param pagination_args
   * @returns
   */
  public async getFarmsPoolList(pagination_args: PaginationArgs = 'all'): Promise<DataPage<FarmsPool>> {
    const { package_id } = this._sdk.sdkOptions.farms
    const dataPage: DataPage<FarmsPool> = {
      data: [],
      has_next_page: false,
    }

    try {
      const objects = await this._sdk.FullClient.queryEventsByPage(
        { MoveEventType: `${package_id}::pool::CreatePoolEvent` },
        pagination_args
      )
      const poolObjectIds = objects.data.map((object: any) => object.parsedJson.pool_id)
      dataPage.has_next_page = objects.has_next_page
      dataPage.next_cursor = objects.next_cursor
      if (poolObjectIds.length > 0) {
        const objectDataResponses = await this._sdk.FullClient.batchGetObjects(poolObjectIds, { showType: true, showContent: true })
        for (const item of objectDataResponses) {
          const pool = FarmsUtils.buildFarmsPool(item)
          if (pool) {
            pool.rewarders = await this.getFarmsRewarderConfig(
              pool.clmm_pool_id,
              pool.rewarders.map((item) => item.reward_coin)
            )
            dataPage.data.push(pool)
            this._sdk.updateCache(pool.id, pool)
          }
        }
      }
    } catch (error) {
      console.log('getFarmsPoolList error ', error)
      return handleError(FarmsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getFarmsPoolList',
      })
    }

    return dataPage
  }

  /**
   * Get a specific farm pool
   * @param id
   * @param force_refresh
   * @returns
   */
  public async getFarmsPool(id: string, force_refresh = false): Promise<FarmsPool> {
    const cache_data = this._sdk.getCache<FarmsPool>(id, force_refresh)
    if (cache_data) {
      return cache_data
    }
    try {
      const res = await this._sdk.FullClient.getObject({ id, options: { showType: true, showContent: true } })
      const pool = FarmsUtils.buildFarmsPool(res.data)
      if (pool) {
        pool.rewarders = await this.getFarmsRewarderConfig(
          pool.clmm_pool_id,
          pool.rewarders.map((item) => item.reward_coin)
        )
        this._sdk.updateCache(pool.id, pool)
      }
      return pool
    } catch (error) {
      return handleError(FarmsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getFarmsPool',
        [DETAILS_KEYS.REQUEST_PARAMS]: { id },
      })
    }
  }

  /**
   * Get the rewarder configuration for farm pools
   * @param pool_id
   * @param reward_coins
   * @param force_refresh
   * @returns
   */
  public async getFarmsRewarderConfig(pool_id: string, reward_coins: string[], force_refresh = false): Promise<RewarderConfig[]> {
    const { farms } = this._sdk.sdkOptions
    const rewarder_configs: RewarderConfig[] = []

    for (const coin_type of reward_coins) {
      const cache_key = `getFarmsRewarderConfig_${coin_type}_${pool_id}`
      const cache_data = this._sdk.getCache<RewarderConfig>(cache_key, force_refresh)
      if (cache_data) {
        rewarder_configs.push(cache_data)
      } else {
        try {
          const res: any = await this._sdk.FullClient.getDynamicFieldObject({
            parentId: getPackagerConfigs(farms).rewarder_manager_handle,
            name: {
              type: '0x1::type_name::TypeName',
              value: removeHexPrefix(coin_type),
            },
          })
          const { fields } = res.data.content.fields.value.fields.value

          const config: RewarderConfig = {
            reward_coin: coin_type,
            last_reward_time: fields.last_reward_time,
            emission_per_second: fields.emission_per_second,
            total_allocate_point: fields.total_allocate_point,
            allocate_point: '',
          }

          const poolsHandler = fields.pools.fields.id.id

          const res1: any = await this._sdk.FullClient.getDynamicFieldObject({
            parentId: poolsHandler,
            name: {
              type: '0x2::object::ID',
              value: pool_id,
            },
          })
          const { allocate_point } = res1.data.content.fields.value.fields.value.fields
          config.allocate_point = allocate_point

          this._sdk.updateCache(cache_key, config)
          rewarder_configs.push(config)
        } catch (error) {
          console.log(error)
        }
      }
    }
    return rewarder_configs
  }

  /**
   * Get the list of owned farm position NFTs
   * @param owner
   * @param assign_pools
   * @param calculate_farming_rewards
   * @param pagination_args
   * @returns If assign_pools is not empty, returns Record<string, FarmsPositionNFT[]>
   */
  public async getOwnedFarmsPositionNFTList(
    owner: string,
    assign_pools: string[] = [],
    calculate_farming_rewards = false,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<FarmsPositionNFT> | Record<string, FarmsPositionNFT[]>> {
    try {
      const { package_id } = this._sdk.sdkOptions.farms
      const data_page: DataPage<FarmsPositionNFT> = {
        data: [],
        has_next_page: false,
      }
      let data_map: Record<string, FarmsPositionNFT[]> = {}
      const filter_list: FarmsPositionNFT[] = []
      const is_assign_pools = assign_pools.length > 0

      const objects = await this._sdk.FullClient.getOwnedObjectsByPage(
        owner,
        {
          filter: {
            StructType: `${package_id}::pool::WrappedPositionNFT`,
          },
          options: {
            showContent: true,
          },
        },
        pagination_args
      )
      data_page.has_next_page = objects.has_next_page
      data_page.next_cursor = objects.next_cursor

      for (const object of objects.data) {
        const farms_position_nft = FarmsUtils.buildFarmsPositionNFT(object)
        if (farms_position_nft) {
          if (is_assign_pools) {
            if (assign_pools.includes(farms_position_nft.pool_id)) {
              filter_list.push(farms_position_nft)
              let pool_nft_list = data_map[farms_position_nft.pool_id]
              if (pool_nft_list) {
                pool_nft_list.push(farms_position_nft)
              } else {
                pool_nft_list = [farms_position_nft]
              }
              data_map[farms_position_nft.pool_id] = pool_nft_list
            }
          } else {
            filter_list.push(farms_position_nft)
          }
        }
      }

      if (calculate_farming_rewards && filter_list.length > 0) {
        const reward_map = await this.calculateFarmingRewards(
          filter_list.map((item) => {
            return {
              pool_id: item.pool_id,
              position_nft_id: item.id,
              clmm_pool_id: item.clmm_pool_id,
            }
          })
        )
        if (is_assign_pools) {
          data_map = {}
          filter_list.forEach((item) => {
            const rewards = reward_map[item.id]
            if (rewards) {
              item.rewards = reward_map[item.id]
            }

            let pool_nft_list = data_map[item.pool_id]
            if (pool_nft_list) {
              pool_nft_list.push(item)
            } else {
              pool_nft_list = [item]
            }
            data_map[item.pool_id] = pool_nft_list
          })
        } else {
          filter_list.forEach((item) => {
            const rewards = reward_map[item.id]
            if (rewards) {
              item.rewards = reward_map[item.id]
            }
          })
        }
      }
      if (is_assign_pools) {
        return data_map
      }
      data_page.data = filter_list
      return data_page
    } catch (error) {
      return handleError(FarmsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getOwnedFarmsPositionNFTList',
      })
    }
  }

  /**
   * Get position information
   * @param owner
   * @param pagination_args
   * @param calculate_farming_rewards
   * @returns
   */
  public async getFarmsPositionNFT(position_nft_id: string, calculate_farming_rewards = true): Promise<FarmsPositionNFT> {
    try {
      const object = await this._sdk.FullClient.getObject({ id: position_nft_id, options: { showContent: true, showType: true } })

      const farms_position_nft = FarmsUtils.buildFarmsPositionNFT(object)

      if (calculate_farming_rewards && farms_position_nft) {
        const reward_map = await this.calculateFarmingRewards([
          {
            pool_id: farms_position_nft.pool_id,
            position_nft_id: farms_position_nft.id,
          },
        ])

        const rewards = reward_map[farms_position_nft.id]
        if (rewards) {
          farms_position_nft.rewards = reward_map[farms_position_nft.id]
        }
      }

      return farms_position_nft
    } catch (error) {
      return handleError(FarmsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getFarmsPositionNFT',
        [DETAILS_KEYS.REQUEST_PARAMS]: { position_nft_id },
      })
    }
  }

  buildCalculateFarmingReward(params: HarvestParams, tx: Transaction) {
    const { farms } = this._sdk.sdkOptions
    const { rewarder_manager_id, global_config_id } = getPackagerConfigs(farms)
    tx.moveCall({
      target: `${farms.published_at}::router::accumulated_position_rewards`,
      typeArguments: [],
      arguments: [
        tx.object(global_config_id),
        tx.object(rewarder_manager_id),
        tx.object(params.pool_id),
        tx.pure.address(params.position_nft_id),
        tx.object(CLOCK_ADDRESS),
      ],
    })
  }

  parsedPosRewardData(simulate_res: DevInspectResults) {
    const rewarder_data: Record<string, PositionRewardInfo[]> = {}
    const rewarder_value_data: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('AccumulatedPositionRewardsEvent')
    })

    for (let i = 0; i < rewarder_value_data.length; i += 1) {
      const { parsedJson } = rewarder_value_data[i]

      const reward_infos: PositionRewardInfo[] = []
      parsedJson.rewards.contents.forEach((item: any) => {
        reward_infos.push({
          rewarder_type: extractStructTagFromType(item.key.name).full_address,
          rewarder_amount: item.value,
        })
      })
      rewarder_data[parsedJson.wrapped_position_id] = reward_infos
    }

    return rewarder_data
  }

  /**
   * Calculate farming rewards
   * @param params
   * @param tx
   * @returns
   */
  public async calculateFarmingRewards(params: HarvestParams[], tx?: Transaction): Promise<Record<string, PositionRewardInfo[]>> {
    tx = tx || new Transaction()

    params.forEach((item) => {
      if (tx) {
        this.buildCalculateFarmingReward(item, tx)
      }
    })
    const rewardMap: Record<string, PositionRewardInfo[]> = {}

    try {
      const simulateRes: any = await this._sdk.FullClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: this._sdk.getSenderAddress(),
      })

      const rewarderData = this.parsedPosRewardData(simulateRes)
      return rewarderData
    } catch (error) {
      return handleError(FarmsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'calculateFarmingRewards',
        [DETAILS_KEYS.REQUEST_PARAMS]: { params },
      })
    }

    return rewardMap
  }

  /**
   * Deposit amount to farm position
   * @param params
   * @param tx
   * @returns
   */
  depositPayload(params: FarmsDepositParams, tx?: Transaction): Transaction {
    const { farms } = this.sdk.sdkOptions

    tx = tx || new Transaction()

    const { global_config_id, rewarder_manager_id } = getPackagerConfigs(farms)

    const nftId = tx.moveCall({
      target: `${farms.published_at}::pool::deposit_v2`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: [
        tx.object(global_config_id),
        tx.object(rewarder_manager_id),
        tx.object(params.pool_id),
        tx.object(params.clmm_pool_id),
        typeof params.clmm_position_id === 'string' ? tx.object(params.clmm_position_id) : params.clmm_position_id,
        tx.object(CLOCK_ADDRESS),
      ],
    })
    tx.transferObjects([nftId], tx.pure.address(this._sdk.getSenderAddress()))
    return tx
  }

  /**
   * Withdraw amount from farm position
   * @param params
   * @param tx
   * @returns
   */
  async withdrawPayload(params: FarmsWithdrawParams, tx?: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions

    const { global_config_id, rewarder_manager_id } = getPackagerConfigs(farms)

    tx = tx || new Transaction()
    // Unstake position and harvest farms rewards
    tx = await this.harvestPayload(
      {
        pool_id: params.pool_id,
        position_nft_id: params.position_nft_id,
      },
      tx
    )

    tx.moveCall({
      target: `${farms.published_at}::router::withdraw`,
      typeArguments: [],
      arguments: [
        tx.object(global_config_id),
        tx.object(rewarder_manager_id),
        tx.object(params.pool_id),
        tx.object(params.position_nft_id),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    return tx
  }

  async withdrawReturnPayload(params: FarmsWithdrawParams, tx: Transaction): Promise<TransactionObjectArgument> {
    const { farms } = this.sdk.sdkOptions

    const { global_config_id, rewarder_manager_id } = getPackagerConfigs(farms)

    tx = tx || new Transaction()
    // Unstake position and harvest farms rewards
    tx = await this.harvestPayload(
      {
        pool_id: params.pool_id,
        position_nft_id: params.position_nft_id,
      },
      tx
    )

    return tx.moveCall({
      target: `${farms.published_at}::pool::withdraw`,
      typeArguments: [],
      arguments: [
        tx.object(global_config_id),
        tx.object(rewarder_manager_id),
        tx.object(params.pool_id),
        tx.object(params.position_nft_id),
        tx.object(CLOCK_ADDRESS),
      ],
    })
  }

  /**
   * Batch harvest Farms rewards
   * @param params
   * @param tx
   * @returns
   */
  async batchHarvestPayload(params: HarvestParams[], tx?: Transaction): Promise<Transaction> {
    tx = tx || new Transaction()
    for (const p of params) {
      await this.harvestPayload(p, tx)
    }
    return tx
  }

  /**
   * Batch harvest Farms rewards and CLMM rewards
   * @param farms_list
   * @param clmm_list
   * @returns
   */
  async batchHarvestAndClmmFeePayload(
    farms_list: HarvestFeeAndClmmRewarderParams[],
    clmm_list: CollectRewarderParams[]
  ): Promise<Transaction> {
    const tx = new Transaction()
    const coinIdMaps: Record<string, BuildCoinResult> = {}
    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.ClmmSDK.getSenderAddress(), null)

    for (const item of clmm_list) {
      this.collectClmmFeeInternal(item, coinIdMaps, tx, allCoinAsset)
      this.collectClmmRewardInternal(item, coinIdMaps, tx, allCoinAsset)
    }

    const { farms } = this.sdk.sdkOptions
    const { global_config_id, rewarder_manager_id } = getPackagerConfigs(farms)
    for (const item of farms_list) {
      const farmsPool = await this.getFarmsPool(item.pool_id, false)
      if (farmsPool === undefined) {
        throw Error(`not found ${item.pool_id}`)
      }

      if (item.collect_fee) {
        this.collectFeeInternal(item, coinIdMaps, tx, allCoinAsset)
      }

      if (item.clmm_rewarder_types.length > 0) {
        await this.collectRewardInternal(item, coinIdMaps, tx, allCoinAsset)
      }

      if (item.collect_farms_rewarder) {
        farmsPool.rewarders.forEach((rewardCoin) => {
          if (tx) {
            tx.moveCall({
              target: `${farms.published_at}::router::harvest`,
              typeArguments: [rewardCoin.reward_coin],
              arguments: [
                tx.object(global_config_id),
                tx.object(rewarder_manager_id),
                tx.object(item.pool_id),
                tx.object(item.position_nft_id),
                tx.object(CLOCK_ADDRESS),
              ],
            })
          }
        })
      }
    }

    Object.keys(coinIdMaps).forEach((key) => {
      const value: any = coinIdMaps[key]
      const { original_spited_coin } = value
      if (value.is_mint_zero_coin || (original_spited_coin && original_spited_coin?.$kind === 'GasCoin')) {
        buildTransferCoin(this._sdk.ClmmSDK, tx!, value.target_coin, key, this._sdk.getSenderAddress())
      }
    })

    return tx
  }

  private async collectRewardInternal(
    item: HarvestFeeAndClmmRewarderParams,
    coin_id_maps: Record<string, BuildCoinResult>,
    tx: Transaction,
    all_coin_asset: CoinAsset[]
  ) {
    const primaryCoinInputs: TransactionObjectArgument[] = []
    item.clmm_rewarder_types.forEach((type) => {
      const coinType = normalizeCoinType(type)
      let coinInput = coin_id_maps[type]
      if (coinInput === undefined) {
        coinInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coinType, false)
        coin_id_maps[coinType] = coinInput
      }
      primaryCoinInputs.push(coinInput.target_coin)
    })

    await this.collectClmmRewardNoSendPayload(item, tx)
  }

  private collectFeeInternal(
    item: HarvestFeeAndClmmRewarderParams,
    coin_id_maps: Record<string, BuildCoinResult>,
    tx: Transaction,
    all_coin_asset: CoinAsset[]
  ) {
    const { farms } = this.sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(farms)
    const { clmm_pool, integrate } = this.sdk.ClmmSDK.sdkOptions
    const clmmConfig = getPackagerConfigs(clmm_pool)
    const coin_type_a = normalizeCoinType(item.coin_type_a)
    const coin_type_b = normalizeCoinType(item.coin_type_b)

    let coinAInput = coin_id_maps[coin_type_a]
    if (coinAInput === undefined) {
      coinAInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coin_type_a, false)
      coin_id_maps[coin_type_a] = coinAInput
    }

    let coinBInput = coin_id_maps[coin_type_b]
    if (coinBInput === undefined) {
      coinBInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coin_type_b, false)
      coin_id_maps[coin_type_b] = coinBInput
    }

    tx.moveCall({
      target: `${integrate.published_at}::stable_farming::collect_fee`,
      typeArguments: [item.coin_type_a, item.coin_type_b],
      arguments: [
        tx.object(global_config_id),
        tx.object(clmmConfig.global_config_id),
        tx.object(item.clmm_pool_id),
        tx.object(item.position_nft_id),
        coinAInput.target_coin,
        coinBInput.target_coin,
      ],
    })
  }

  private collectClmmRewardInternal(
    item: CollectRewarderParams,
    coin_id_maps: Record<string, BuildCoinResult>,
    tx: Transaction,
    all_coin_asset: CoinAsset[]
  ) {
    const primaryCoinInputs: TransactionObjectArgument[] = []
    item.rewarder_coin_types.forEach((type) => {
      const coinType = normalizeCoinType(type)
      let coinInput = coin_id_maps[coinType]
      if (coinInput === undefined) {
        coinInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coinType, false)
        coin_id_maps[coinType] = coinInput
      }
      primaryCoinInputs.push(coinInput.target_coin)
    })

    this._sdk.ClmmSDK.Rewarder.createCollectRewarderNoSendPayload(item, tx!, primaryCoinInputs)
  }

  private collectClmmFeeInternal(
    item: CollectRewarderParams,
    coin_id_maps: Record<string, BuildCoinResult>,
    tx: Transaction,
    all_coin_asset: CoinAsset[]
  ) {
    if (item.collect_fee) {
      const coin_type_a = normalizeCoinType(item.coin_type_a)
      const coin_type_b = normalizeCoinType(item.coin_type_b)
      let coinAInput = coin_id_maps[coin_type_a]
      if (coinAInput === undefined) {
        coinAInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coin_type_a, false)
        coin_id_maps[coin_type_a] = coinAInput
      }

      let coinBInput = coin_id_maps[coin_type_b]
      if (coinBInput === undefined) {
        coinBInput = CoinAssist.buildCoinForAmount(tx!, all_coin_asset!, BigInt(0), coin_type_b, false)
        coin_id_maps[coin_type_b] = coinBInput
      }

      this._sdk.ClmmSDK.Position.createCollectFeeNoSendPayload(
        {
          pool_id: item.pool_id,
          pos_id: item.pos_id,
          coin_type_a: item.coin_type_a,
          coin_type_b: item.coin_type_b,
        },
        tx!,
        coinAInput.target_coin,
        coinBInput.target_coin
      )
    }
  }

  /**
   * Harvest Farms rewards
   * @param params
   * @returns
   */
  async harvestPayload(params: HarvestParams | HarvestFeeAndClmmRewarderParams, tx?: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions

    tx = tx || new Transaction()
    const farmsPool = await this.getFarmsPool(params.pool_id, false)

    const { global_config_id, rewarder_manager_id } = getPackagerConfigs(farms)

    const isCollectFee = 'collect_fee' in params

    if (isCollectFee) {
      if (params.collect_fee || params.clmm_rewarder_types.length > 0) {
        const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
        tx = await this.buildCollectRewarderAndFeeParams(
          {
            clmm_pool_id: params.clmm_pool_id,
            position_nft_id: params.position_nft_id,
            coin_type_a: params.coin_type_a,
            coin_type_b: params.coin_type_b,
            collect_fee: params.collect_fee,
            clmm_rewarder_types: params.clmm_rewarder_types,
          },
          tx,
          allCoinAsset
        )
      }
    }

    farmsPool.rewarders.forEach((rewardCoin) => {
      if (tx) {
        tx.moveCall({
          target: `${farms.published_at}::router::harvest`,
          typeArguments: [rewardCoin.reward_coin],
          arguments: [
            tx.object(global_config_id),
            tx.object(rewarder_manager_id),
            tx.object(params.pool_id),
            tx.object(params.position_nft_id),
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })

    return tx
  }

  async claimFeeAndClmmReward(params: ClaimFeeAndClmmRewardParams): Promise<Transaction> {
    const tx = new Transaction()

    // Harvest fee / CLMM rewards
    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
    await this.buildCollectRewarderAndFeeParams(
      {
        clmm_pool_id: params.clmm_pool_id,
        position_nft_id: params.position_nft_id,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
        collect_fee: params.collect_fee,
        clmm_rewarder_types: params.clmm_rewarder_types,
      },
      tx,
      allCoinAsset
    )

    return tx
  }

  /**
   * Open position, add liquidity and stake
   * @param params
   */
  async openPositionAddLiquidityStakePayload(params: OpenPositionAddLiquidityStakeParams): Promise<Transaction> {
    const tx = new Transaction()
    const { clmm_pool, integrate } = this._sdk.ClmmSDK.sdkOptions
    const clmmPoolConfig = getPackagerConfigs(clmm_pool)
    // Open position
    const posId = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::open_position`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: [
        tx.object(clmmPoolConfig.global_config_id),
        tx.object(params.clmm_pool_id),
        tx.pure.u32(Number(asUintN(BigInt(params.tick_lower)).toString())),
        tx.pure.u32(Number(asUintN(BigInt(params.tick_upper)).toString())),
      ],
    })

    // Add liquidity
    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
    const primaryCoinAInputs = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_a), params.coin_type_a, false)
    const primaryCoinBInputs = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_b), params.coin_type_b, false)

    tx.moveCall({
      target: `${integrate.published_at}::${ClmmIntegratePoolV2Module}::add_liquidity_by_fix_coin`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: [
        tx.object(clmmPoolConfig.global_config_id),
        tx.object(params.clmm_pool_id),
        posId,
        primaryCoinAInputs.target_coin,
        primaryCoinBInputs.target_coin,
        tx.pure.u64(params.amount_a.toString()),
        tx.pure.u64(params.amount_b.toString()),
        tx.pure.bool(params.fix_amount_a),
        tx.object(CLOCK_ADDRESS),
      ],
    })

    // Stake position
    this.depositPayload(
      {
        pool_id: params.pool_id,
        clmm_position_id: posId,
        clmm_pool_id: params.clmm_pool_id,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
      },
      tx
    )

    return tx
  }

  /**
   * Add liquidity
   * @param params
   * @param tx
   * @returns
   */
  async addLiquidityPayload(params: AddLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions
    const { clmm_pool } = this.sdk.ClmmSDK.sdkOptions

    tx = tx || new Transaction()

    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)

    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())

    const primaryCoinAInputs = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_limit_a), params.coin_type_a, false)

    const primaryCoinBInputs = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_limit_b), params.coin_type_b, false)

    // Harvest rewards
    if (params.collect_rewarder) {
      tx = await this.harvestPayload(
        {
          pool_id: params.pool_id,
          position_nft_id: params.position_nft_id,
          clmm_pool_id: params.clmm_pool_id,
        },
        tx
      )
    }

    // Harvest fee / clmm rewards
    if (params.collect_fee || params.clmm_rewarder_types.length > 0) {
      const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      tx = await this.buildCollectRewarderAndFeeParams(
        {
          clmm_pool_id: params.clmm_pool_id,
          position_nft_id: params.position_nft_id,
          coin_type_a: params.coin_type_a,
          coin_type_b: params.coin_type_b,
          collect_fee: params.collect_fee,
          clmm_rewarder_types: params.clmm_rewarder_types,
        },
        tx,
        allCoinAsset,
        primaryCoinAInputs.remain_coins,
        primaryCoinBInputs.remain_coins
      )
    }

    tx.moveCall({
      target: `${farms.published_at}::router::add_liquidity`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: [
        tx.object(farmsConfig.global_config_id),
        tx.object(clmmConfig.global_config_id),
        tx.object(farmsConfig.rewarder_manager_id),
        tx.object(params.pool_id),
        tx.object(params.clmm_pool_id),
        tx.object(params.position_nft_id),
        primaryCoinAInputs.target_coin,
        primaryCoinBInputs.target_coin,
        tx.pure.u64(params.amount_limit_a),
        tx.pure.u64(params.amount_limit_b),
        tx.pure.u128(params.delta_liquidity),
        tx.object(CLOCK_ADDRESS),
      ],
    })
    return tx
  }

  /**
   * Add liquidity with fixed token amount
   * @param params
   * @param tx
   * @returns
   */
  async addLiquidityFixCoinPayload(params: AddLiquidityFixCoinParams, tx?: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions
    const { clmm_pool } = this.sdk.ClmmSDK.sdkOptions

    tx = tx || new Transaction()

    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)

    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())

    const primaryCoinAInputs = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_a), params.coin_type_a, false)

    const primaryCoinBInputs = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(params.amount_b), params.coin_type_b, false)

    // Harvest rewards
    if (params.collect_rewarder) {
      tx = await this.harvestPayload(
        {
          pool_id: params.pool_id,
          position_nft_id: params.position_nft_id,
          clmm_pool_id: params.clmm_pool_id,
        },
        tx
      )
    }

    // Harvest fee / clmm rewards
    if (params.collect_fee || params.clmm_rewarder_types.length > 0) {
      const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      tx = await this.buildCollectRewarderAndFeeParams(
        {
          clmm_pool_id: params.clmm_pool_id,
          position_nft_id: params.position_nft_id,
          coin_type_a: params.coin_type_a,
          coin_type_b: params.coin_type_b,
          collect_fee: params.collect_fee,
          clmm_rewarder_types: params.clmm_rewarder_types,
        },
        tx,
        allCoinAsset,
        primaryCoinAInputs.remain_coins,
        primaryCoinBInputs.remain_coins
      )
    }

    tx.moveCall({
      target: `${farms.published_at}::router::add_liquidity_fix_coin`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: [
        tx.object(farmsConfig.global_config_id),
        tx.object(clmmConfig.global_config_id),
        tx.object(farmsConfig.rewarder_manager_id),
        tx.object(params.pool_id),
        tx.object(params.clmm_pool_id),
        tx.object(params.position_nft_id),
        primaryCoinAInputs.target_coin,
        primaryCoinBInputs.target_coin,
        tx.pure.u64(params.amount_a.toString()),
        tx.pure.u64(params.amount_b.toString()),
        tx.pure.bool(params.fix_amount_a),
        tx.object(CLOCK_ADDRESS),
      ],
    })
    return tx
  }

  /**
   * Remove liquidity
   * @param params
   * @param tx
   * @returns
   */
  async removeLiquidityPayload(params: RemoveLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions
    const { clmm_pool } = this.sdk.ClmmSDK.sdkOptions

    console.log('removeLiquidityPayload params: ', params)

    tx = tx || new Transaction()

    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)

    // Harvest rewards
    if (params.collect_rewarder) {
      tx = await this.harvestPayload(
        {
          pool_id: params.pool_id,
          position_nft_id: params.position_nft_id,
          clmm_pool_id: params.clmm_pool_id,
        },
        tx
      )
    }
    // Harvest fee / clmm rewards
    if (params.clmm_rewarder_types.length > 0) {
      const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      tx = await this.buildCollectRewarderAndFeeParams(
        {
          clmm_pool_id: params.clmm_pool_id,
          position_nft_id: params.position_nft_id,
          coin_type_a: params.coin_type_a,
          coin_type_b: params.coin_type_b,
          collect_fee: false, // Remove liquidity will harvest fee
          clmm_rewarder_types: params.clmm_rewarder_types,
        },
        tx,
        allCoinAsset
      )
    }
    // Close position will unstake position and remove all liquidity
    if (params.close_position) {
      if (params.clmm_position_id === undefined) {
        throw Error(`close_position need clmm_position_id`)
      }
      const [balanceA, balanceB] = tx.moveCall({
        target: `${farms.published_at}::pool::close_position_v2`,
        typeArguments: [params.coin_type_a, params.coin_type_b],
        arguments: [
          tx.object(farmsConfig.global_config_id),
          tx.object(farmsConfig.rewarder_manager_id),
          tx.object(params.pool_id),
          tx.object(clmmConfig.global_config_id),
          tx.object(params.clmm_pool_id),
          tx.object(params.position_nft_id),
          tx.pure.u64(params.min_amount_a),
          tx.pure.u64(params.min_amount_b),
          tx.object(CLOCK_ADDRESS),
        ],
      })
      const coinA = CoinAssist.fromBalance(balanceA, params.coin_type_a, tx)
      const coinB = CoinAssist.fromBalance(balanceB, params.coin_type_b, tx)
      tx.transferObjects([coinA, coinB], tx.pure.address(this._sdk.getSenderAddress()))
    } else {
      // Remove all liquidity will harvest fee
      tx.moveCall({
        target: `${farms.published_at}::router::remove_liquidity`,
        typeArguments: [params.coin_type_a, params.coin_type_b],
        arguments: [
          tx.object(farmsConfig.global_config_id),
          tx.object(clmmConfig.global_config_id),
          tx.object(farmsConfig.rewarder_manager_id),
          tx.object(params.pool_id),
          tx.object(params.clmm_pool_id),
          tx.object(params.position_nft_id),
          tx.pure.u128(params.delta_liquidity),
          tx.pure.u64(params.min_amount_a),
          tx.pure.u64(params.min_amount_b),
          tx.object(CLOCK_ADDRESS),
        ],
      })

      if (params.unstake) {
        // Unstake position
        this.withdrawPayload({
          pool_id: params.pool_id,
          position_nft_id: params.position_nft_id,
        })
      }
    }

    return tx
  }

  /**
   * Build parameters for collecting rewards and fees
   * @param params
   * @param tx
   * @param all_coin_assets
   * @param all_coin_asset_a
   * @param all_coin_asset_b
   * @returns
   */
  public async buildCollectRewarderAndFeeParams(
    params: {
      collect_fee: boolean
      clmm_pool_id: string
      position_nft_id: string
      coin_type_a: string
      coin_type_b: string
      clmm_rewarder_types: string[]
    },
    tx: Transaction,
    all_coin_assets: CoinAsset[],
    all_coin_asset_a?: CoinAsset[],
    all_coin_asset_b?: CoinAsset[]
  ): Promise<Transaction> {
    if (all_coin_asset_a === undefined) {
      all_coin_asset_a = [...all_coin_assets]
    }
    if (all_coin_asset_b === undefined) {
      all_coin_asset_b = [...all_coin_assets]
    }
    const coin_type_a = normalizeCoinType(params.coin_type_a)
    const coin_type_b = normalizeCoinType(params.coin_type_b)
    if (params.collect_fee) {
      // const primaryCoinAInput = CoinAssist.buildCoinForAmount(tx, allCoinAssetA, BigInt(0), coin_type_a!, false)
      // allCoinAssetA = primaryCoinAInput.remain_coins

      // const primaryCoinBInput = CoinAssist.buildCoinForAmount(tx, allCoinAssetB, BigInt(0), coin_type_b!, false)
      // allCoinAssetB = primaryCoinBInput.remain_coins

      this.collectFeePayload(
        {
          clmm_pool_id: params.clmm_pool_id,
          position_nft_id: params.position_nft_id,
          // coin_a: primaryCoinAInput.target_coin,
          // coin_b: primaryCoinBInput.target_coin,
          coin_type_a: params.coin_type_a,
          coin_type_b: params.coin_type_b,
        },
        tx
      )
    }

    const primary_coin_inputs: TransactionArgument[] = []
    params.clmm_rewarder_types.forEach((type) => {
      switch (normalizeCoinType(type)) {
        case coin_type_a:
          primary_coin_inputs.push(CoinAssist.buildCoinForAmount(tx, all_coin_asset_a!, BigInt(0), type, false).target_coin)
          break
        case coin_type_b:
          primary_coin_inputs.push(CoinAssist.buildCoinForAmount(tx, all_coin_asset_b!, BigInt(0), type, false).target_coin)
          break
        default:
          primary_coin_inputs.push(CoinAssist.buildCoinForAmount(tx, all_coin_assets, BigInt(0), type, false).target_coin)
          break
      }
    })

    this.collectClmmRewardPayload(
      {
        clmm_pool_id: params.clmm_pool_id,
        position_nft_id: params.position_nft_id,
        clmm_rewarder_types: params.clmm_rewarder_types,
        coin_type_a: params.coin_type_a,
        coin_type_b: params.coin_type_b,
        reward_coins: primary_coin_inputs,
      },
      tx
    )

    return tx
  }

  /**
   * Collect fees
   * @param params
   * @param tx
   * @returns
   */
  collectFeePayload(params: CollectFeeParams, tx?: Transaction): Transaction {
    const { farms } = this.sdk.sdkOptions
    const { clmm_pool } = this.sdk.ClmmSDK.sdkOptions

    tx = tx || new Transaction()

    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)

    tx.moveCall({
      target: `${farms.published_at}::router::collect_fee`,
      typeArguments: [params.coin_type_a, params.coin_type_b],
      arguments: [
        tx.object(farmsConfig.global_config_id),
        tx.object(clmmConfig.global_config_id),
        tx.object(params.clmm_pool_id),
        tx.object(params.position_nft_id),
        // params.coin_a!,
        // params.coin_b!,
      ],
    })
    return tx
  }

  /**
   * Collect CLMM rewards
   * @param params
   * @param tx
   * @returns
   */
  async collectClmmRewardPayload(params: CollectClmmRewardParams, tx?: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions
    const { clmm_pool } = this.sdk.ClmmSDK.sdkOptions

    tx = tx || new Transaction()
    let primaryCoinInputs = params.reward_coins
    if (params.clmm_rewarder_types.length > 0 && primaryCoinInputs === undefined) {
      primaryCoinInputs = []
      const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      params.clmm_rewarder_types.forEach((type) => {
        primaryCoinInputs!.push(CoinAssist.buildCoinForAmount(tx!, allCoinAsset!, BigInt(0), type, false).target_coin)
      })
    }

    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)
    params.clmm_rewarder_types?.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${farms.published_at}::router::collect_clmm_reward`,
          typeArguments: [type, params.coin_type_a, params.coin_type_b],
          arguments: [
            tx.object(farmsConfig.global_config_id),
            tx.object(clmmConfig.global_config_id),
            tx.object(params.clmm_pool_id!),
            tx.object(params.position_nft_id),
            tx.object(clmmConfig.global_vault_id),
            primaryCoinInputs![index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }

  private async collectClmmRewardNoSendPayload(params: CollectClmmRewardParams, tx: Transaction): Promise<Transaction> {
    const { farms } = this.sdk.sdkOptions
    const { clmm_pool, integrate } = this.sdk.ClmmSDK.sdkOptions

    let primaryCoinInputs = params.reward_coins
    if (params.clmm_rewarder_types.length > 0 && primaryCoinInputs === undefined) {
      primaryCoinInputs = []
      const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this._sdk.getSenderAddress())
      params.clmm_rewarder_types.forEach((type) => {
        primaryCoinInputs!.push(CoinAssist.buildCoinForAmount(tx!, allCoinAsset!, BigInt(0), type, false).target_coin)
      })
    }

    const farmsConfig = getPackagerConfigs(farms)
    const clmmConfig = getPackagerConfigs(clmm_pool)
    params.clmm_rewarder_types?.forEach((type, index) => {
      if (tx) {
        tx.moveCall({
          target: `${integrate.published_at}::stable_farming::collect_clmm_reward`,
          typeArguments: [type, params.coin_type_a, params.coin_type_b],
          arguments: [
            tx.object(farmsConfig.global_config_id),
            tx.object(clmmConfig.global_config_id),
            tx.object(params.clmm_pool_id!),
            tx.object(params.position_nft_id),
            tx.object(clmmConfig.global_vault_id),
            primaryCoinInputs![index],
            tx.object(CLOCK_ADDRESS),
          ],
        })
      }
    })
    return tx
  }

  /**
   * Get farm configurations
   * @returns
   */
  async getFarmsConfigs(): Promise<FarmsConfigs> {
    const { package_id } = this._sdk.sdkOptions.farms
    const config: FarmsConfigs = {
      global_config_id: '',
      rewarder_manager_id: '',
      rewarder_manager_handle: '',
    }

    const initEventObjs = (await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::config::InitConfigEvent` })).data

    if (initEventObjs.length > 0) {
      const fields = initEventObjs[0].parsedJson as any
      config.global_config_id = fields.global_config_id
      config.admin_cap_id = fields.admin_cap_id
    }

    const rewarderEventObjs = (
      await this._sdk.FullClient.queryEventsByPage({ MoveEventType: `${package_id}::rewarder::InitRewarderManagerEvent` })
    ).data
    if (rewarderEventObjs.length > 0) {
      const fields = rewarderEventObjs[0].parsedJson as any
      config.rewarder_manager_id = fields.id

      const res: any = await this._sdk.FullClient.getObject({ id: config.rewarder_manager_id, options: { showContent: true } })
      config.rewarder_manager_handle = res.data.content.fields.rewarders.fields.id.id
    }

    return config
  }
}
