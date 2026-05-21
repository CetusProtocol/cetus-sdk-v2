import { CLOCK_ADDRESS, CoinAssist, DETAILS_KEYS, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { CetusClmmSDK } from '../sdk'
import { ClmmVestInfo, GetPositionVestOption, PositionVesting, RedeemOption } from '../types/vest'
import { handleError, handleMessageError, VestErrorCode } from '../errors'
import { VestUtils } from '../utils/vestUtils'
import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { GetPositionsVestingEventRaw } from '../utils/parse'

export class VestModule implements IModule<CetusClmmSDK> {
  protected _sdk: CetusClmmSDK

  constructor(sdk: CetusClmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Get the clmm vest info list
   * @returns {Promise<ClmmVestInfo[]>} The clmm vest info list
   */
  async getClmmVestInfoList(): Promise<ClmmVestInfo[]> {
    const { clmm_vest } = this._sdk.sdkOptions
    if (clmm_vest === undefined) {
      return handleMessageError(VestErrorCode.ClmmVestNotSet, 'clmm_vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getClmmVestInfo',
      })
    }

    const vestInfoList: ClmmVestInfo[] = []

    try {
      const moveEventType = `${clmm_vest.package_id}::clmm_vester::CreateEvent`
      const objects = await this._sdk.FullClient.queryEventsByPage({ MoveEventType: moveEventType })
      const warpIds = objects.data.map((object) => (object.parsedJson as any).clmm_vester_id)
      if (warpIds.length > 0) {
        const res = await this._sdk.FullClient.batchGetObjects(warpIds, { json: true })
        res.forEach((item) => {
          const vestInfo = VestUtils.parseClmmVestInfo(item)
          const cacheKey = `${vestInfo.id}-ClmmVestInfo`
          this._sdk.updateCache(cacheKey, vestInfo)
          vestInfoList.push(vestInfo)
        })
      }
      return vestInfoList
    } catch (error) {
      handleError(VestErrorCode.ClmmVestFetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getClmmVestInfoList',
      })
    }
    return []
  }

  /**
   * Get the clmm vest info
   * @param vest_id - The vest id
   * @returns {Promise<ClmmVestInfo>} The clmm vest info
   */
  async getClmmVestInfo(force_refresh = true): Promise<ClmmVestInfo> {
    const { clmm_vest } = this._sdk.sdkOptions
    if (clmm_vest === undefined) {
      return handleMessageError(VestErrorCode.ClmmVestNotSet, 'clmm_vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getClmmVestInfo',
      })
    }
    const { clmm_vest_id } = getPackagerConfigs(clmm_vest)

    const cacheKey = `${clmm_vest_id}-ClmmVestInfo`
    const cacheValue = this._sdk.getCache<ClmmVestInfo>(cacheKey, force_refresh)
    if (cacheValue) {
      return cacheValue
    }

    try {
      const res = await this._sdk.FullClient.getObject({ objectId: clmm_vest_id, include: { json: true } })
      const vestInfo = VestUtils.parseClmmVestInfo(res.object)
      this._sdk.updateCache(cacheKey, vestInfo)
      return vestInfo
    } catch (error) {
      return handleError(VestErrorCode.ClmmVestFetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getClmmVestInfo',
        [DETAILS_KEYS.REQUEST_PARAMS]: { clmm_vest_id },
      })
    }
  }

  async getPositionVesting(options: GetPositionVestOption[]): Promise<PositionVesting[]> {
    const { clmm_vest } = this._sdk.sdkOptions
    if (clmm_vest === undefined) {
      return handleMessageError(VestErrorCode.ClmmVestNotSet, 'clmm_vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'getPositionVesting',
      })
    }

    if (options.length === 0) {
      return []
    }

    const { clmm_vest_id } = getPackagerConfigs(clmm_vest)

    const tx = new Transaction()
    options.forEach((option) => {
      const { clmm_pool_id, coin_type_a, coin_type_b, clmm_position_ids } = option

      tx.moveCall({
        package: clmm_vest.published_at,
        module: 'clmm_vester',
        function: 'get_positions_vesting',
        typeArguments: [coin_type_a, coin_type_b],
        arguments: [tx.object(clmm_vest_id), tx.object(clmm_pool_id), tx.pure.vector('id', clmm_position_ids)],
      })
    })

    const simulateRes: any = await this.sdk.FullClient.sendSimulationTransaction(tx, normalizeSuiAddress('0x0'))

    const position_vesting_list: PositionVesting[] = []
    simulateRes.Transaction?.events?.forEach((event: any) => {
      if (event.eventType.includes('clmm_vester::GetPositionsVestingEvent')) {
        const parsed = GetPositionsVestingEventRaw.parse(event.bcs).data
        position_vesting_list.push(...parsed.map((item: any) => VestUtils.parsePositionVesting(item)))
      }
    })

    return position_vesting_list
  }

  /**
   * Build the redeem payload
   * @param options - The redeem options
   * @returns {Transaction} The redeem payload
   */
  buildRedeemPayload(options: RedeemOption[], tx?: Transaction): Transaction {
    const { clmm_vest } = this._sdk.sdkOptions
    if (clmm_vest === undefined) {
      return handleMessageError(VestErrorCode.ClmmVestNotSet, 'clmm_vest is not set config in sdk options', {
        [DETAILS_KEYS.METHOD_NAME]: 'buildRedeemVestPayload',
      })
    }

    const { versioned_id, clmm_vest_id, cetus_coin_type } = getPackagerConfigs(clmm_vest)
    tx = tx || new Transaction()

    options.forEach((option) => {
      const { clmm_pool_id, clmm_position_id, coin_type_a, coin_type_b, period } = option

      const balance = tx.moveCall({
        package: clmm_vest.published_at,
        module: 'clmm_vester',
        function: 'redeem',
        arguments: [
          tx.object(versioned_id),
          tx.object(clmm_vest_id),
          tx.object(clmm_pool_id),
          typeof clmm_position_id === 'string' ? tx.object(clmm_position_id) : clmm_position_id,
          tx.pure.u16(period),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
      const vest_coin = CoinAssist.fromBalance(balance, cetus_coin_type, tx)
      tx.transferObjects([vest_coin], this._sdk.getSenderAddress())
    })

    return tx
  }
}
