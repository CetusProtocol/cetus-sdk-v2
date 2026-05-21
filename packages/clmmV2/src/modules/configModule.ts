// @ts-nocheck
import { Transaction } from '@mysten/sui/transactions'
import { CACHE_TIME_24H, d, DETAILS_KEYS, extractStructTagFromType, fixCoinType, getObjectFields, getObjectPreviousTransactionDigest, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { ConfigErrorCode, handleError } from '../errors/errors'
import { CetusClmmV2SDK } from '../sdk'
import { ClmmGlobalConfig, ClmmV2Config, DynamicFee, DynamicFeeConfig, FeeScheduler, FeeSchedulerMode, FeeTier, RewardWhiteListOption } from '../types/clmm_type'

export class ConfigModule implements IModule<CetusClmmV2SDK> {
  protected _sdk: CetusClmmV2SDK

  constructor(sdk: CetusClmmV2SDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Build the payload for adding or removing reward white list
   * @param option - The option for adding or removing reward white list
   * @param tx - The transaction to add the reward white list to
   * @returns The transaction for adding or removing reward white list
   */
  buildRewardWhiteListPayload(option: RewardWhiteListOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { clmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)

    const { reward_coin_types, type } = option

    reward_coin_types.forEach((reward_coin_type) => {
      tx.moveCall({
        target: `${clmm_pool.published_at}::config::${type === 'add' ? 'add_reward_whitelist' : 'remove_reward_whitelist'}`,
        arguments: [tx.object(global_config_id), tx.object(versioned_id)],
        typeArguments: [reward_coin_type],
      })
    })

    return tx
  }

  async getFeeTiers(feeTiersHandle: string): Promise<FeeTier[]> {
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(feeTiersHandle)

    const warpIds = res.data.map((item: any) => item.objectId)
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { showContent: true })

    const feeTiers: FeeTier[] = []
    objects.forEach((item: any) => {
      const fields = getObjectFields(item)
      const valueFields = fields.value.fields

      feeTiers.push({
        id: fields.id.id,
        tick_spacing: valueFields.tick_spacing,
        fee_rate: valueFields.fee_rate,
        allow_dynamic_fee: valueFields.allow_dynamic_fee,
        protocol_fee_rate: valueFields.protocol_fee_rate,
        fee_tier: d(valueFields.fee_rate).div(1_000_000_000).toString(),
      })
    })


    return feeTiers
  }

  async getFeeTiersByTickSpacing(feeTiersHandle: string): Promise<Record<string, FeeTier[]>> {
    const feeTiers = await this.getFeeTiers(feeTiersHandle)

    const feeTierMap: Record<string, FeeTier[]> = {}
    feeTiers.forEach((tier) => {
      const key = tier.fee_tier
      if (!feeTierMap[key]) {
        feeTierMap[key] = []
      }
      feeTierMap[key].push(tier)
    })

    return feeTierMap
  }

  async getDynamicFees(dynamicFeeHandle: string): Promise<DynamicFeeConfig[]> {
    const res = await this._sdk.FullClient.getDynamicFieldsByPage(dynamicFeeHandle)
    const dynamicFees: DynamicFeeConfig[] = []
    const warpIds = res.data.map((item: any) => item.objectId)
    const objects = await this._sdk.FullClient.batchGetObjects(warpIds, { showContent: true })

    objects.forEach((item: any) => {
      const fields = getObjectFields(item)
      const valueFields = fields.value.fields
      console.log('🚀 ~ objects.forEach ~ valueFields:', valueFields)

      dynamicFees.push({
        bin_step: valueFields.bin_step,
        bin_step_u128: valueFields.bin_step_u128,
        filter_period: valueFields.filter_period,
        decay_period: valueFields.decay_period,
        reduction_factor: valueFields.reduction_factor,
        variable_fee_control: valueFields.variable_fee_control,
        max_volatility_accumulator: valueFields.max_volatility_accumulator,
      })
    })
    return dynamicFees
  }

  /**
   * Gets the ClmmConfig object for the given package object ID.
   * @param {boolean} force_refresh Whether to force a refresh of the cache.
   * @returns the ClmmConfig object.
   */
  async getClmmConfigs(force_refresh = false): Promise<ClmmV2Config> {
    const { package_id } = this._sdk.sdkOptions.clmm_pool
    const cacheKey = `${package_id}_getInitEvent`
    const cacheData = this._sdk.getCache<ClmmV2Config>(cacheKey, force_refresh)
    if (cacheData !== undefined) {
      return cacheData
    }
    const packageObject = await this._sdk.FullClient.getObject({
      id: package_id,
      options: { showPreviousTransaction: true },
    })

    const previousTx = getObjectPreviousTransactionDigest(packageObject) as string

    const objects = (await this._sdk.FullClient.queryEventsByPage({ Transaction: previousTx })).data

    const clmmConfig: ClmmV2Config = {
      global_config_id: '',
      registry_id: '',
      versioned_id: '',
      admin_cap_id: '',
      partners_id: '',
    }

    if (objects.length > 0) {
      objects.forEach((item: any) => {
        const fields = item.parsedJson as any

        if (item.type) {
          switch (extractStructTagFromType(item.type).full_address) {
            case `${package_id}::config::InitEvent`:
              clmmConfig.global_config_id = fields.global_config_id
              break
            case `${package_id}::versioned::InitEvent`:
              clmmConfig.versioned_id = fields.versioned
              break
            case `${package_id}::admin_cap::InitEvent`:
              clmmConfig.admin_cap_id = fields.admin_cap_id
              break
            case `${package_id}::partner::InitPartnerEvent`:
              clmmConfig.partners_id = fields.partners
              break
            case `${package_id}::registry::InitEvent`:
              clmmConfig.registry_id = fields.registry
              break
            default:
              break
          }
        }
      })
      this._sdk.updateCache(cacheKey, clmmConfig, CACHE_TIME_24H)
      return clmmConfig
    }

    return clmmConfig
  }

  /**
   * Get the list of bin step configs
   * @returns The list of bin step configs
   */
  async getClmmGlobalConfig(): Promise<ClmmGlobalConfig> {
    const { clmm_pool } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(clmm_pool)
    try {
      const res = await this._sdk.FullClient.getObject({
        objectId: global_config_id,
        include: { json: true },
      })

      const fields = getObjectFields(res)
      const fee_schedulers_handle = fields.fee_schedulers.fields.id.id

      const fee_schedulers = await this._sdk.FullClient.getDynamicFieldsByPage(fee_schedulers_handle)
      const fee_schedulers_objects = await this._sdk.FullClient.batchGetObjects(fee_schedulers.data.map((item: any) => item.objectId), { showContent: true })
      const fee_schedulers_data = fee_schedulers_objects.map((item: any) => {
        const fields = getObjectFields(item)
        const feeSchedulerFields = fields.value.fields
        const feeScheduler: FeeScheduler = {
          base_fee: fields.name.fields.base_fee,
          cliff_fee_numerator: feeSchedulerFields.cliff_fee_numerator,
          number_of_period: feeSchedulerFields.number_of_period,
          period_frequency: feeSchedulerFields.period_frequency,
          reduction_factor: feeSchedulerFields.reduction_factor,
          fee_scheduler_mode: feeSchedulerFields.fee_scheduler_mode.variant === "Linear" ? FeeSchedulerMode.Linear : FeeSchedulerMode.Exponential,
        }
        return feeScheduler
      })
      const reward_config = fields.reward_config.fields

      const reward_white_list: string[] =
        reward_config.reward_white_list?.contents?.map((item: any) => {
          return fixCoinType(item.key.name, false) as string
        }) || []

      const globalConfig: ClmmGlobalConfig = {
        id: fields.id,
        acl_handle: {
          id: fields.acl.permissions.id,
          size: fields.acl.permissions.size,
        },
        allowed_list_handle: {
          id: fields.allowed_list.id,
          size: fields.allowed_list.size,
        },
        fee_tiers_handle: {
          id: fields.base_fees.id,
          size: fields.base_fees.size,
        },
        before_version: fields.before_version,
        denied_list_handle: {
          id: fields.denied_list.id,
          size: fields.denied_list.size,
        },
        dynamic_fees_handle: {
          id: fields.dynamic_fees.id,
          size: fields.dynamic_fees.size,
        },
        fee_schedulers: fee_schedulers_data,


        blocked_position_handle: {
          id: fields.restriction.blocked_position.permissions.id,
          size: fields.restriction.blocked_position.permissions.size,
        },
        blocked_user_handle: {
          id: fields.restriction.blocked_user.permissions.id,
          size: fields.restriction.blocked_user.permissions.size,
        },
        reward_public: reward_config.reward_public,

        manager_reserved_reward_init_slots: reward_config.manager_reserved_reward_init_slots,
        min_reward_duration: reward_config.min_reward_duration,
        reward_whitelist: reward_white_list
      }

      return globalConfig
    } catch (error) {
      console.log('fetchGlobalConfig error: ', error)
      return handleError(ConfigErrorCode.InvalidConfig, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getClmmGlobalConfig',
        [DETAILS_KEYS.REQUEST_PARAMS]: global_config_id,
      })
    }
  }

}
