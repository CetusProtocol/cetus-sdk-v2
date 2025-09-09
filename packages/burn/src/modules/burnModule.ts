import { CLOCK_ADDRESS, DETAILS_KEYS, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { Transaction } from '@mysten/sui/transactions'
import { BurnErrorCode, handleError } from '../errors/errors'
import type { CetusBurnSDK } from '../sdk'
import type { BurnParams, CollectFeeParams, CollectRewardParams, RedeemVestParams } from '../types/burn'
import { BurnUtils } from '../utils'

export class BurnModule implements IModule<CetusBurnSDK> {
  protected _sdk: CetusBurnSDK

  constructor(sdk: CetusBurnSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * @description Get the list of pools that have been burned.
   * @returns
   */
  async getBurnPoolList() {
    try {
      const { burn } = this._sdk.sdkOptions
      // TODO positionTableId is a constant, it can be written in the configuration later
      const { manager_id } = getPackagerConfigs(burn)
      const object: any = await this._sdk.FullClient.getObject({
        id: manager_id,
        options: {
          showType: true,
          showContent: true,
        },
      })

      const positionTableId = object?.data?.content?.fields?.position?.fields?.id?.id

      const positionTableData = await this._sdk.FullClient.getDynamicFieldsByPage(positionTableId)

      const burnPools = positionTableData?.data?.map((item: any) => {
        return item?.name?.value
      })

      return burnPools
    } catch (error) {
      console.log('getBurnPoolList ~ error:', error)
      handleError(BurnErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getBurnPoolList',
      })
    }
  }

  /**
   * @description Get the position handle for a given pool.
   * @param pool_id - The pool ID.
   * @returns
   */
  private async getPositionHandle(pool_id: string) {
    const { burn } = this._sdk.sdkOptions
    const { burn_pool_handle } = getPackagerConfigs(burn)
    const cacheKey = `getPosHandle_${pool_id}`
    let posHandle = this._sdk.getCache<string>(cacheKey)
    if (posHandle) {
      return posHandle
    }
    try {
      const posHandleRes: any = await this._sdk.FullClient.getDynamicFieldObject({
        parentId: burn_pool_handle,
        name: {
          type: '0x2::object::ID',
          value: pool_id,
        },
      })
      posHandle = posHandleRes.data.content.fields.value.fields.id.id

      if (posHandle) {
        this._sdk.updateCache(cacheKey, posHandle)
      }

      return posHandle
    } catch (error) {
      handleError(BurnErrorCode.InvalidPoolId, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPositionHandle',
        [DETAILS_KEYS.REQUEST_PARAMS]: { pool_id },
      })
    }
  }

  /**
   * @description Get the list of burned positions for a given pool.
   * @param pool_id - The pool ID.
   * @returns
   */
  async getPoolBurnPositionList(pool_id: string) {
    try {
      const posHandle = await this.getPositionHandle(pool_id)
      if (posHandle === undefined) {
        handleError(BurnErrorCode.InvalidPoolId, `${pool_id} is a invalid pool id, please check it and try another valid pool id`, {
          [DETAILS_KEYS.METHOD_NAME]: 'getPositionHandle',
          [DETAILS_KEYS.REQUEST_PARAMS]: { pool_id },
        })
      }

      const positionTableData = await this._sdk.FullClient.getDynamicFieldsByPage(posHandle as string)

      const warpPosIds = positionTableData?.data?.map((item: any) => {
        return item.objectId
      })

      if (warpPosIds.length > 0) {
        const warpPosRes = await this._sdk.FullClient.batchGetObjects(warpPosIds, { showContent: true })

        const burnedPositionIds = warpPosRes.map((item: any) => {
          return item.data.content.fields.value.fields.burned_position_id
        })

        const burnedPositionsRes = await this._sdk.FullClient.batchGetObjects(burnedPositionIds, { showContent: true })

        const burnPositionList = burnedPositionsRes?.map((item: any) => {
          const info = BurnUtils.buildBurnPositionNFT(item?.data?.content?.fields)
          return info
        })
        return burnPositionList
      }

      return []
    } catch (error: any) {
      console.log('getPoolBurnPositionList ~ error:', error)
      handleError(BurnErrorCode.InvalidPoolId, `${pool_id} is a invalid pool id, please check it and try another valid pool id`, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolBurnPositionList',
        [DETAILS_KEYS.REQUEST_PARAMS]: { pool_id },
      })
    }
  }

  /**
   * @description Get the list of burned positions for a given account.
   * @param account_address - The account address.
   * @returns
   */
  async getBurnPositionList(account_address: string) {
    const { package_id } = this._sdk.sdkOptions.burn
    try {
      const ownerRes = await this._sdk.FullClient.getOwnedObjectsByPage(account_address, {
        options: { showType: true, showContent: true, showOwner: true, showDisplay: true },
        filter: {
          MatchAny: [
            {
              StructType: `${package_id}::lp_burn::CetusLPBurnProof`,
            },
          ],
        },
      })
      const burnPositionList = ownerRes?.data?.map((item: any) => {
        const info = BurnUtils.buildBurnPositionNFT(item?.data?.content?.fields)
        return info
      })
      return burnPositionList
    } catch (error) {
      handleError(BurnErrorCode.InvalidAccountAddress, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getBurnPositionList',
        [DETAILS_KEYS.REQUEST_PARAMS]: { account_address },
      })
    }
  }

  /**
   * @description Get the burned position information for a given position ID.
   * @param pos_id - The position ID.
   * @returns
   */
  async getBurnPosition(pos_id: string) {
    try {
      const object: any = await this._sdk.FullClient.getObject({ id: pos_id, options: { showContent: true, showType: true } })

      if (object?.data?.content?.fields) {
        const info = BurnUtils.buildBurnPositionNFT(object?.data?.content?.fields)
        return info
      }

      return null
    } catch (error) {
      handleError(BurnErrorCode.InvalidPositionId, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getBurnPosition',
        [DETAILS_KEYS.REQUEST_PARAMS]: { pos_id },
      })
    }
  }

  /**
   * @description Create a burn payload for a given pool and position.
   * @param params - The burn parameters.
   * @param tx - The transaction object.
   * @returns
   */
  createBurnPayload(params: BurnParams, tx?: Transaction) {
    tx = tx || new Transaction()

    const positionArg = typeof params.pos_id === 'string' ? tx.object(params.pos_id) : params.pos_id

    const { burn } = this._sdk.sdkOptions
    const { manager_id } = getPackagerConfigs(burn)
    const target = `${burn.published_at}::lp_burn::burn`
    tx.moveCall({
      target,
      arguments: [tx.object(manager_id), tx.object(params.pool_id), positionArg],
      typeArguments: [params.coin_type_a, params.coin_type_b],
    })

    return tx
  }

  /**
   * When the position is burned, a CetusLPBurnProof will be returned. Compared to the burn_lp function,
   * this V2 version does not require the pool object as a parameter, making it more convenient to use.
   * The function will automatically verify the position's validity through the position object itself.
   * This design also allows users to create a pool, add liquidity, and burn the position all within one transaction.
   *
   * @param {string | TransactionObjectArgument} pos - The LP position to be burned,
   *        either as an object argument or its ID (string).
   * @param {Transaction} [tx] - An optional `Transaction` object; if not provided, a new one is created.
   * @returns {CetusLPBurnProof} - The CetusLPBurnProof object ID .
   */
  createBurnLPV2Payload(pos: string | TransactionObjectArgument, tx?: Transaction): TransactionObjectArgument {
    tx = tx || new Transaction()

    const positionArg = typeof pos === 'string' ? tx.object(pos) : pos

    const { burn } = this._sdk.sdkOptions
    const { manager_id } = getPackagerConfigs(burn)

    const target = `${burn.published_at}::lp_burn::burn_lp_v2`
    const [cetusLPBurnProof] = tx.moveCall({
      target,
      arguments: [tx.object(manager_id), positionArg],
      typeArguments: [],
    })

    return cetusLPBurnProof
  }

  /**
   * @description Create a collect fee payload for a given pool and position.
   * @param params - The collect fee parameters.
   * @param tx - The transaction object.
   * @returns
   */
  createCollectFeePayload(params: CollectFeeParams, tx?: Transaction) {
    tx = tx || new Transaction()

    const { burn } = this._sdk.sdkOptions
    const { manager_id, clmm_global_config } = getPackagerConfigs(burn)
    const target = `${burn.published_at}::lp_burn::collect_fee`

    const coins = tx.moveCall({
      target,
      arguments: [tx.object(manager_id), tx.object(clmm_global_config), tx.object(params.pool_id), tx.object(params.pos_id)],
      typeArguments: [params.coin_type_a, params.coin_type_b],
    })

    tx.transferObjects([coins[0], coins[1]], tx.pure.address(params.account))

    return tx
  }

  /**
   * @description Create a collect reward payload for a given pool and position.
   * @param params - The collect reward parameters.
   * @param tx - The transaction object.
   * @returns
   */
  createCollectRewardPayload(params: CollectRewardParams, tx?: Transaction) {
    tx = tx || new Transaction()

    const { burn } = this._sdk.sdkOptions
    const { manager_id, clmm_global_config, clmm_global_vault_id } = getPackagerConfigs(burn)

    const target = `${burn.published_at}::lp_burn::collect_reward`

    for (let i = 0; i < params.rewarder_coin_types?.length; i++) {
      const item = params.rewarder_coin_types?.[i]
      const coin = tx.moveCall({
        target,
        arguments: [
          tx.object(manager_id),
          tx.object(clmm_global_config),
          tx.object(params.pool_id),
          tx.object(params.pos_id),
          tx.object(clmm_global_vault_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [params.coin_type_a, params.coin_type_b, item],
      })

      tx.transferObjects([coin], tx.pure.address(params.account))
    }

    return tx
  }

  /**
   * @description Create a redeem vest payload for a given pool and position.
   * @param params - The redeem vest parameters.
   * @param tx - The transaction object.
   * @returns
   */
  redeemVestPayload(params: RedeemVestParams[], tx?: Transaction) {
    tx = tx || new Transaction()
    const { burn } = this._sdk.sdkOptions

    for (const param of params) {
      const { clmm_versioned_id, clmm_vester_id, clmm_pool_id, burn_position_id, period, coin_type_a, coin_type_b } = param
      const coin = tx.moveCall({
        package: burn.published_at,
        module: 'lp_burn',
        function: 'redeem',
        arguments: [
          tx.object(clmm_versioned_id),
          tx.object(clmm_vester_id),
          tx.object(clmm_pool_id),
          tx.object(burn_position_id),
          tx.pure.u16(period),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })

      tx.transferObjects([coin], tx.pure.address(this._sdk.getSenderAddress()))
    }

    return tx
  }

  /**
   * @description Create a collect fee payload for a given pool and position.
   * @param params - The collect fee parameters.
   * @param tx - The transaction object.
   * @returns
   */
  createCollectFeesPayload(paramsList: CollectFeeParams[], tx?: Transaction) {
    tx = tx || new Transaction()

    for (const params of paramsList) {
      this.createCollectFeePayload(params, tx)
    }

    return tx
  }

  /**
   * @description Create a collect reward payload for a given pool and position.
   * @param params - The collect reward parameters.
   * @param tx - The transaction object.
   * @returns
   */
  createCollectRewardsPayload(params: CollectRewardParams[], tx?: Transaction) {
    tx = tx || new Transaction()

    const { burn } = this._sdk.sdkOptions
    const { manager_id, clmm_global_config, clmm_global_vault_id } = getPackagerConfigs(burn)

    const target = `${burn.published_at}::lp_burn::collect_reward`
    for (let j = 0; j < params.length; j++) {
      const item = params[j]
      for (let i = 0; i < item.rewarder_coin_types?.length; i++) {
        const items = item.rewarder_coin_types?.[i]
        const coin = tx.moveCall({
          target,
          arguments: [
            tx.object(manager_id),
            tx.object(clmm_global_config),
            tx.object(item.pool_id),
            tx.object(item.pos_id),
            tx.object(clmm_global_vault_id),
            tx.object(CLOCK_ADDRESS),
          ],
          typeArguments: [item.coin_type_a, item.coin_type_b, items],
        })

        tx.transferObjects([coin], tx.pure.address(item.account))
      }
    }

    return tx
  }
}
