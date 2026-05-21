import { CLOCK_ADDRESS, DETAILS_KEYS, fixCoinType, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { CetusVaultsSDK } from '../sdk'
import { handleError, handleMessageError, VaultsErrorCode } from '../errors'
import { Transaction } from '@mysten/sui/transactions'
import { RedeemOption, VaultsVestInfo, VaultVestNFT, VestCreateEvent } from '../types/vest'
import { VaultsUtils } from '../utils/vaults'
import { bcs } from '@mysten/sui/bcs'

export class VestModule implements IModule<CetusVaultsSDK> {
  protected _sdk: CetusVaultsSDK

  constructor(sdk: CetusVaultsSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async vestNftIsAvailable(vest_nft_id: string, vester_infos_handle: string): Promise<boolean> {
    try {
      const res = await this._sdk.FullClient.getDynamicField({
        parentId: vester_infos_handle,
        name: {
          type: '0x2::object::ID',
          bcs: bcs.Address.serialize(vest_nft_id).toBytes(),
        },
      })
      const passed = bcs.struct('CetusVaultVesterInfo', {
        is_pause: bcs.bool(),
      }).parse(res.dynamicField.value.bcs)
      return !passed.is_pause
    } catch (error) {
      console.log('vestNftIsAvailable error', error)
      return true
    }
  }

  /**
   * Get the vest create event list
   * @returns {Promise<VestCreateEvent[]>} The vest create event list
   */
  async getVestCreateEventList(): Promise<VestCreateEvent[]> {
    const { vest } = this._sdk.sdkOptions
    if (vest === undefined) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getVestCreateEventList',
      })
    }

    try {
      const moveEventType = `${vest.package_id}::vault_vester::CreateEvent`
      const objects = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: moveEventType })
      return objects.data.map((object: any) => {
        const parsedJson = object.parsedJson
        const item: VestCreateEvent = {
          clmm_vester_id: parsedJson.clmm_vester_id,
          lp_coin_type: fixCoinType(parsedJson.lp_coin_type.name, false),
          pool_id: parsedJson.pool_id,
          position_id: parsedJson.position_id,
          vault_id: parsedJson.vault_id,
          vault_vester_id: parsedJson.vault_vester_id,
        }

        const cacheKey = `${item.vault_id}-VestCreateEvent`
        this._sdk.updateCache(cacheKey, item)
        return item
      })
    } catch (error) {
      handleError(VaultsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getVestCreateEventList',
      })
    }
    return []
  }

  async getVaultsVestInfoList(vault_ids: string[]): Promise<VaultsVestInfo[]> {
    const { vest } = this._sdk.sdkOptions
    if (!vest) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getAssignedVaultsVestInfoList',
      })
    }
    const vest_ids: string[] = []

    for (const vault_id of vault_ids) {
      const event = await this.getVaultVestEvent(vault_id)
      vest_ids.push(event.vault_vester_id)
    }

    const vest_info_list: VaultsVestInfo[] = []

    const res = await this._sdk.FullClient.batchGetObjects(vest_ids, {
      json: true,
    })

    res.forEach((item) => {
      try {
        const vestInfo = VaultsUtils.parseVaultsVestInfo(item)
        vest_info_list.push(vestInfo)
        const cacheKey = `${vestInfo.id}-VaultsVestInfo`
        this._sdk.updateCache(cacheKey, vestInfo)
      } catch (error) {
        console.log('getVaultsVestInfoList error', error)
      }
    })
    return vest_info_list
  }

  /**
   * Get the vaults vest info
   * @param vault_id - The vault id
   * @param force_refresh - Whether to force refresh the cache
   * @returns {Promise<VaultsVestInfo>} The vaults vest info
   */
  async getVaultsVestInfo(vault_id: string, force_refresh = true): Promise<VaultsVestInfo> {
    const vest_id = (await this.getVaultVestEvent(vault_id)).vault_vester_id
    const cacheKey = `${vest_id}-VaultsVestInfo`
    const cacheValue = this._sdk.getCache<VaultsVestInfo>(cacheKey, force_refresh)
    if (cacheValue) {
      return cacheValue
    }

    try {
      const res = await this._sdk.FullClient.getObject({ objectId: vest_id, include: { json: true } })
      const vestInfo = VaultsUtils.parseVaultsVestInfo(res.object)
      this._sdk.updateCache(cacheKey, vestInfo)
      return vestInfo
    } catch (error) {
      return handleError(VaultsErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getVaultsVestInfo',
        [DETAILS_KEYS.REQUEST_PARAMS]: { vest_id },
      })
    }
  }

  /**
   * Get the vault vest event
   * @param vault_id - The vault id
   * @returns {VestCreateEvent} The vault vest event
   */
  async getVaultVestEvent(vault_id: string): Promise<VestCreateEvent> {
    const { vest } = this._sdk.sdkOptions
    if (!vest) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getVaultVestId',
      })
    }

    const { create_event_list } = getPackagerConfigs(vest)
    let event = create_event_list.find((item) => item.vault_id === vault_id)
    if (!event) {
      const cacheKey = `${vault_id}-VestCreateEvent`
      const cacheValue = this._sdk.getCache<VestCreateEvent>(cacheKey, false)
      if (cacheValue) {
        event = cacheValue
      } else {
        const eventList = await this.getVestCreateEventList()
        event = eventList.find((item) => item.vault_id === vault_id)
        this._sdk.updateCache(cacheKey, event)
      }
    }
    if (!event) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'vault_id not found in vest_ids_map', {
        [DETAILS_KEYS.METHOD_NAME]: 'getVaultVestId',
        [DETAILS_KEYS.REQUEST_PARAMS]: { vault_id },
      })
    }
    return event
  }

  /**
   * Get the vault vest nft list
   * @param owner - The owner address
   * @returns {Promise<VaultVestNFT[]>} The vault vest nft list
   */
  async getOwnerVaultVestNFT(owner: string): Promise<VaultVestNFT[]> {
    const { vest } = this._sdk.sdkOptions
    if (!vest) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getVaultVestId',
      })
    }

    const res = await this._sdk.FullClient.getOwnedObjectsByPage(owner, `${vest.package_id}::vault_vester::CetusVaultVester`)
    const vault_vest_nft_list: VaultVestNFT[] = []
    res.data.forEach((item: any) => {
      try {
        const vault_vest_nft = VaultsUtils.parseVaultVestNFT(item)
        vault_vest_nft_list.push(vault_vest_nft)
      } catch (error) {
        console.log('getPositionVesting error', error)
      }
    })
    return vault_vest_nft_list
  }

  /**
   * Build the redeem payload
   * @param options - The redeem options
   * @returns {Transaction} The redeem payload
   */
  async buildRedeemPayload(options: RedeemOption[], tx?: Transaction): Promise<Transaction> {
    const { vest } = this._sdk.sdkOptions
    const { clmm_vest } = this._sdk.ClmmSDK.sdkOptions

    if (!vest) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'buildRedeemPayload',
      })
    }

    if (!clmm_vest) {
      return handleMessageError(VaultsErrorCode.ConfigError, 'clmm_vest is not set config in clmm sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'buildRedeemPayload',
      })
    }

    const { versioned_id } = getPackagerConfigs(vest)
    const { versioned_id: clmm_versioned_id, clmm_vest_id } = getPackagerConfigs(clmm_vest)
    tx = tx || new Transaction()
    for (const option of options) {
      const { vault_id, vesting_nft_id, period, coin_type_a, coin_type_b } = option

      const vest_event = await this.getVaultVestEvent(vault_id)

      tx.moveCall({
        package: vest.published_at,
        module: 'vault_vester',
        function: 'redeem_coin',
        arguments: [
          tx.object(versioned_id),
          tx.object(vest_event.vault_vester_id),
          tx.object(vesting_nft_id),
          tx.object(clmm_versioned_id),
          tx.object(clmm_vest_id),
          tx.object(vest_event.pool_id),
          tx.pure.u16(period),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
    }

    return tx
  }
}
