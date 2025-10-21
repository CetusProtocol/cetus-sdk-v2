import { Transaction } from '@mysten/sui/transactions'
import { CLOCK_ADDRESS, DETAILS_KEYS, fixCoinType, getObjectFields, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { DlmmErrorCode, handleError } from '../errors/errors'
import { CetusDlmmSDK } from '../sdk'
import { BinStepConfig, DlmmConfigs, DlmmGlobalConfig, RewardWhiteListOption } from '../types/dlmm'
import { log } from 'console'

export class ConfigModule implements IModule<CetusDlmmSDK> {
  protected _sdk: CetusDlmmSDK

  constructor(sdk: CetusDlmmSDK) {
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
    const { dlmm_pool } = this._sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    const { reward_coin_types, type } = option

    reward_coin_types.forEach((reward_coin_type) => {
      tx.moveCall({
        target: `${dlmm_pool.published_at}::config::${type === 'add' ? 'add_reward_whitelist' : 'remove_reward_whitelist'}`,
        arguments: [tx.object(global_config_id), tx.object(versioned_id)],
        typeArguments: [reward_coin_type],
      })
    })

    return tx
  }

  async getBinStepConfigList(bin_steps_handle: string): Promise<BinStepConfig[]> {
    const res = await this._sdk.FullClient.getDynamicFields({
      parentId: bin_steps_handle,
    })

    const list: BinStepConfig[] = []

    const bin_step_ids = res.data.map((item) => item.objectId)

    if (bin_step_ids.length > 0) {
      const bin_step_configs = await this._sdk.FullClient.batchGetObjects(bin_step_ids, {
        showContent: true,
      })

      bin_step_configs.forEach((item) => {
        const fields = getObjectFields(item)
        const bin_step_config: BinStepConfig = {
          ...fields.value.fields,
        }
        list.push(bin_step_config)
      })
    }

    return list
  }

  /**
   * Get the list of bin step configs
   * @returns The list of bin step configs
   */
  async getDlmmGlobalConfig(): Promise<DlmmGlobalConfig> {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(dlmm_pool)
    try {
      const res = await this._sdk.FullClient.getObject({
        id: global_config_id,
        options: { showContent: true },
      })

      const fields = getObjectFields(res)

      const reward_config = fields.reward_config.fields

      const white_list: string[] =
        reward_config.reward_white_list?.fields?.contents?.map((item: any) => {
          return fixCoinType(item.fields.key.fields.name, false) as string
        }) || []

      const globalConfig: DlmmGlobalConfig = {
        id: fields.id.id,
        acl: {
          id: fields.acl.fields.permissions.fields.id.id,
          size: fields.acl.fields.permissions.fields.size,
        },
        allowed_list: {
          id: fields.allowed_list.fields.id.id,
          size: fields.allowed_list.fields.size,
        },
        denied_list: {
          id: fields.denied_list.fields.id.id,
          size: fields.denied_list.fields.size,
        },
        bin_steps: {
          id: fields.bin_steps.fields.id.id,
          size: fields.bin_steps.fields.size,
        },
        reward_white_list: white_list,
        blocked_position: {
          id: fields.restriction.fields.blocked_position.fields.permissions.fields.id.id,
          size: fields.restriction.fields.blocked_position.fields.permissions.fields.size,
        },
        blocked_user: {
          id: fields.restriction.fields.blocked_user.fields.permissions.fields.id.id,
          size: fields.restriction.fields.blocked_user.fields.permissions.fields.size,
        },
        min_reward_duration: Number(reward_config.min_reward_duration),
        non_manager_initialize_reward_cap: Number(reward_config.manager_reserved_reward_init_slots),
        reward_public: reward_config.reward_public,
      }

      return globalConfig
    } catch (error) {
      console.log('fetchGlobalConfig error: ', error)
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getBinStepConfigs',
        [DETAILS_KEYS.REQUEST_PARAMS]: global_config_id,
      })
    }
  }

  /**
   * Fetch the configs of the dlmm SDK
   * @returns The configs of the dlmm
   */
  async fetchDlmmSdkConfigs(): Promise<DlmmConfigs> {
    const { dlmm_pool } = this._sdk.sdkOptions
    const configs: DlmmConfigs = {
      registry_id: '',
      pools_id: '',
      global_config_id: '',
      versioned_id: '',
      admin_cap_id: '',
      partners_id: '',
    }

    const res = await this._sdk.FullClient.getObject({
      id: dlmm_pool.package_id,
      options: { showContent: true, showPreviousTransaction: true },
    })
    const tx_digest = res.data?.previousTransaction!
    const txRes = await this._sdk.FullClient.getTransactionBlock({ digest: tx_digest, options: { showEvents: true } })
    txRes.events?.forEach((event) => {
      const type = event.type
      const parsedJson = event.parsedJson as any

      if (type.includes('versioned::InitEvent')) {
        configs.versioned_id = parsedJson.versioned
      }

      if (type.includes('partner::InitPartnerEvent')) {
        configs.partners_id = parsedJson.partners_id
      }

      if (type.includes('config::InitEvent')) {
        configs.global_config_id = parsedJson.config_id
      }

      if (type.includes('admin_cap::InitEvent')) {
        configs.admin_cap_id = parsedJson.admin_cap_id
      }

      if (type.includes('registry::RegistryEvent')) {
        configs.registry_id = parsedJson.pools_id
      }
    })
    const registerRes = await this._sdk.FullClient.getObject({ id: configs.registry_id, options: { showContent: true } })
    const registerFields = getObjectFields(registerRes)
    configs.pools_id = registerFields.pools.fields.id.id

    return configs
  }
}
