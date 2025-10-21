import { Transaction } from '@mysten/sui/transactions'
import { CLOCK_ADDRESS, d, DETAILS_KEYS, fixCoinType, getObjectFields, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { DlmmErrorCode, handleError } from '../errors/errors'
import { parsePartner } from '../utils'
import { CetusDlmmSDK } from '../sdk'
import { ClaimRefFeeOption, CreatePartnerOption, Partner, UpdateRefFeeRateOption, UpdateTimeRangeOption } from '../types/dlmm'
import { BASIS_POINT } from '../types/constants'

export class PartnerModule implements IModule<CetusDlmmSDK> {
  protected _sdk: CetusDlmmSDK

  constructor(sdk: CetusDlmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  /**
   * Get a list of partners.
   * @returns {Promise<Partner[]>} A promise that resolves to an array of Partner objects.
   */
  async getPartnerList(): Promise<Partner[]> {
    const allPartner: Partner[] = []
    const { dlmm_pool } = this._sdk.sdkOptions
    const { partners_id } = getPackagerConfigs(dlmm_pool)
    try {
      const res = await this._sdk.FullClient.getObject({ id: partners_id, options: { showContent: true } })
      const fields = getObjectFields(res)
      const warpIds = fields.partners.fields.contents.map((item: any) => {
        return item.fields.value
      })

      if (warpIds.length > 0) {
        const res = await this._sdk.FullClient.batchGetObjects(warpIds, {
          showContent: true,
          showType: true,
        })
        res.forEach((item) => {
          const partner = parsePartner(item)
          allPartner.push(partner)
        })
      }
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPartnerList',
        [DETAILS_KEYS.REQUEST_PARAMS]: partners_id,
      })
    }

    return allPartner
  }

  /**
   * Get the partner cap ID for a given owner and partner ID.
   * @param owner - The owner of the partner.
   * @param partner_id - The ID of the partner.
   * @returns A promise that resolves to the partner cap ID or undefined if not found.
   */
  async getPartnerCapId(owner: string, partner_id: string): Promise<string> {
    const { dlmm_pool } = this._sdk.sdkOptions
    try {
      const cacheKey = `partner_cap_id_${owner}_${partner_id}`
      const cached = this._sdk.getCache<string>(cacheKey)
      if (cached) {
        return cached
      }
      const res = await this._sdk.FullClient.getOwnedObjects({
        owner,
        options: {
          showContent: true,
          showType: true,
        },
        filter: {
          StructType: `${dlmm_pool.package_id}::partner::PartnerCap`,
        },
      })
      let partnerCapId = undefined
      res.data.forEach((item) => {
        const fields = getObjectFields(item)
        if (fields.partner_id === partner_id) {
          partnerCapId = fields.id.id
          this._sdk.updateCache(cacheKey, partnerCapId)
        }
      })
      if (!partnerCapId) {
        return handleError(DlmmErrorCode.NotFound, new Error('Partner cap not found'), {
          [DETAILS_KEYS.METHOD_NAME]: 'getPartnerCapId',
          [DETAILS_KEYS.REQUEST_PARAMS]: {
            owner,
            partner_id,
          },
        })
      }
      return partnerCapId
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPartnerCapId',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          owner,
          partner_id,
        },
      })
    }
  }

  /**
   * Get the balance of a partner
   * @param partner_balance_handle - The handle of the partner balance
   * @returns A promise that resolves to an array of { coin_type: string; balance: string } objects.
   */
  async getPartnerBalance(partner_balance_handle: string) {
    try {
      const res = await this._sdk.FullClient.getDynamicFieldsByPage(partner_balance_handle)

      const balanceList: { coin_type: string; balance: string }[] = []

      const warpIds = res.data.map((item) => item.objectId)

      if (warpIds.length > 0) {
        const res = await this._sdk.FullClient.batchGetObjects(warpIds, {
          showContent: true,
          showType: true,
        })
        res.forEach((item) => {
          const fields = getObjectFields(item)
          console.log(fields)
          balanceList.push({
            coin_type: fixCoinType(fields.name, false),
            balance: fields.value,
          })
        })
      }
      return balanceList
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPartnerBalance',
        [DETAILS_KEYS.REQUEST_PARAMS]: partner_balance_handle,
      })
    }
  }

  /**
   * Get a partner by its object ID.
   * @param {string} partner_id The object ID of the partner to get.
   * @returns {Promise<Partner>} A promise that resolves to a Partner object.
   */
  async getPartner(partner_id: string): Promise<Partner> {
    try {
      const res = await this._sdk.FullClient.getObject({ id: partner_id, options: { showContent: true } })
      const partner = parsePartner(res)
      return partner
    } catch (error) {
      return handleError(DlmmErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPartner',
        [DETAILS_KEYS.REQUEST_PARAMS]: partner_id,
      })
    }
  }

  /**
   * Update the ref fee rate of a partner
   * @param option - The option for updating the ref fee rate
   * @returns The transaction for updating the ref fee rate
   */
  updateRefFeeRatePayload(option: UpdateRefFeeRateOption, tx?: Transaction): Transaction {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { partner_id, ref_fee_rate } = option

    const { global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    tx = tx || new Transaction()

    const ref_fee_rate_raw = d(ref_fee_rate).mul(BASIS_POINT)
    if (ref_fee_rate_raw.gt(BASIS_POINT)) {
      return handleError(DlmmErrorCode.InvalidParams, new Error('ref_fee_rate is cannot be greater than 1'), {
        [DETAILS_KEYS.METHOD_NAME]: 'updateRefFeeRatePayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    tx.moveCall({
      target: `${dlmm_pool.published_at}::partner::update_ref_fee_rate`,
      arguments: [tx.object(partner_id), tx.pure.u64(ref_fee_rate_raw.toNumber()), tx.object(global_config_id), tx.object(versioned_id)],
      typeArguments: [],
    })

    return tx
  }

  /**
   * Create a claim ref fee payload
   * @param option - The option for claiming ref fee
   * @returns The transaction for claiming ref fee
   */
  async claimRefFeePayload(option: ClaimRefFeeOption) {
    const { partner_id, partner_cap_id, fee_coin_types } = option
    const { dlmm_pool } = this._sdk.sdkOptions
    const { versioned_id } = getPackagerConfigs(dlmm_pool)

    const tx = new Transaction()

    let partnerCapId = partner_cap_id
    if (!partnerCapId) {
      partnerCapId = await this.getPartnerCapId(this._sdk.getSenderAddress(), partner_id)
    }

    fee_coin_types.forEach((coin_type) => {
      tx.moveCall({
        target: `${dlmm_pool.published_at}::partner::claim_ref_fee`,
        arguments: [tx.object(partner_id), tx.object(partnerCapId), tx.object(versioned_id)],
        typeArguments: [coin_type],
      })
    })

    return tx
  }

  updateTimeRangePayload(option: UpdateTimeRangeOption, tx?: Transaction): Transaction {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { partner_id, start_time, end_time } = option

    const { global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    tx = tx || new Transaction()

    const startTimeInSeconds = start_time > 1e12 ? Math.floor(start_time / 1000) : start_time
    const endTimeInSeconds = end_time > 1e12 ? Math.floor(end_time / 1000) : end_time

    if (endTimeInSeconds <= startTimeInSeconds) {
      return handleError(DlmmErrorCode.InvalidParams, new Error('end_time must be greater than start_time'), {
        [DETAILS_KEYS.METHOD_NAME]: 'createPartnerPayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    tx.moveCall({
      target: `${dlmm_pool.published_at}::partner::update_time_range`,
      arguments: [
        tx.object(partner_id),
        tx.pure.u64(startTimeInSeconds),
        tx.pure.u64(endTimeInSeconds),
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [],
    })

    return tx
  }

  /**
   * Create a partner
   * @param option - The option for creating a partner
   * @returns The transaction for creating a partner
   */
  createPartnerPayload(option: CreatePartnerOption): Transaction {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { name, ref_fee_rate, start_time, end_time, recipient } = option

    const { partners_id, global_config_id, versioned_id } = getPackagerConfigs(dlmm_pool)

    const tx = new Transaction()

    const ref_fee_rate_raw = d(ref_fee_rate).mul(BASIS_POINT)
    if (ref_fee_rate_raw.gt(BASIS_POINT)) {
      return handleError(DlmmErrorCode.InvalidParams, new Error('ref_fee_rate is cannot be greater than 1'), {
        [DETAILS_KEYS.METHOD_NAME]: 'createPartnerPayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    const startTimeInSeconds = start_time > 1e12 ? Math.floor(start_time / 1000) : start_time
    const endTimeInSeconds = end_time > 1e12 ? Math.floor(end_time / 1000) : end_time

    if (endTimeInSeconds <= startTimeInSeconds) {
      return handleError(DlmmErrorCode.InvalidParams, new Error('end_time must be greater than start_time'), {
        [DETAILS_KEYS.METHOD_NAME]: 'createPartnerPayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    tx.moveCall({
      target: `${dlmm_pool.published_at}::partner::create_partner`,
      arguments: [
        tx.object(partners_id),
        tx.pure.string(name),
        tx.pure.u64(ref_fee_rate_raw.toNumber()),
        tx.pure.u64(startTimeInSeconds),
        tx.pure.u64(endTimeInSeconds),
        tx.pure.address(recipient),
        tx.object(global_config_id),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })

    return tx
  }
}
