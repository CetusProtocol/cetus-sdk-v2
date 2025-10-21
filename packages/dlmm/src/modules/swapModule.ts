import { Transaction } from '@mysten/sui/transactions'
import { CLOCK_ADDRESS, CoinAssist, d, DETAILS_KEYS, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { DlmmErrorCode, handleError } from '../errors/errors'
import { CetusDlmmSDK } from '../sdk'
import { PreSwapOption, PreSwapQuote, SwapOption } from '../types/dlmm'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { parsedSwapQuoteData } from '../utils/parseData'

export class SwapModule implements IModule<CetusDlmmSDK> {
  protected _sdk: CetusDlmmSDK

  constructor(sdk: CetusDlmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async preSwapQuote(option: PreSwapOption): Promise<PreSwapQuote> {
    const { dlmm_pool } = this._sdk.sdkOptions
    const { pool_id, coin_type_a, coin_type_b, a2b, by_amount_in, in_amount } = option
    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)
    const tx = new Transaction()

    tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::flash_swap`,
      arguments: [
        tx.object(pool_id),
        tx.pure.bool(a2b),
        tx.pure.bool(by_amount_in),
        tx.pure.u64(in_amount),
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [coin_type_a, coin_type_b],
    })

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x0'),
    })

    if (simulateRes.error != null) {
      return handleError(DlmmErrorCode.FetchError, new Error(simulateRes.error), {
        [DETAILS_KEYS.METHOD_NAME]: 'fetchSwapQuote',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    const quoteInfo = parsedSwapQuoteData(simulateRes, a2b)
    if (quoteInfo == null) {
      return handleError(DlmmErrorCode.FetchError, new Error('No quote info'), {
        [DETAILS_KEYS.METHOD_NAME]: 'preSwapQuote',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }
    quoteInfo.a2b = a2b
    return quoteInfo
  }

  swapPayload(option: SwapOption): Transaction {
    const { dlmm_pool, dlmm_router } = this._sdk.sdkOptions
    const { quote_obj, coin_type_a, coin_type_b, by_amount_in, slippage, partner } = option
    const { pool_id, in_amount, out_amount, a2b } = quote_obj

    const tx = new Transaction()

    const in_amount_limit = by_amount_in
      ? in_amount
      : d(in_amount)
          .mul(1 + slippage)
          .toFixed(0)

    const out_amount_limit = by_amount_in
      ? d(out_amount)
          .mul(1 - slippage)
          .toFixed(0)
      : out_amount

    const in_coin = CoinAssist.buildCoinWithBalance(BigInt(in_amount_limit), a2b ? coin_type_a : coin_type_b, tx)

    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)

    console.log('🚀 ~ SwapModule ~ option:', {
      ...option,
      in_amount_limit,
      out_amount_limit,
    })

    if (partner) {
      tx.moveCall({
        target: `${dlmm_router.published_at}::swap::${a2b ? 'swap_a2b_with_partner' : 'swap_b2a_with_partner'}`,
        arguments: [
          tx.object(pool_id),
          tx.object(partner),
          in_coin,
          tx.pure.bool(by_amount_in),
          tx.pure.u64(BigInt(by_amount_in ? in_amount : out_amount)),
          tx.pure.u64(BigInt(by_amount_in ? out_amount_limit : in_amount_limit)),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
    } else {
      tx.moveCall({
        target: `${dlmm_router.published_at}::swap::${a2b ? 'swap_a2b' : 'swap_b2a'}`,
        arguments: [
          tx.object(pool_id),
          in_coin,
          tx.pure.bool(by_amount_in),
          tx.pure.u64(BigInt(by_amount_in ? in_amount : out_amount)),
          tx.pure.u64(BigInt(by_amount_in ? out_amount_limit : in_amount_limit)),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
    }

    tx.transferObjects([in_coin], this.sdk.getSenderAddress())

    return tx
  }
}
