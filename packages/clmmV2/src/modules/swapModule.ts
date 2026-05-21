// @ts-nocheck
import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import BN from 'bn.js'
import { CLOCK_ADDRESS, CoinAssist, d, DETAILS_KEYS, fixCoinType, getPackagerConfigs, IModule, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from '@cetusprotocol/common-sdk'
import { handleError, SwapErrorCode } from '../errors/errors'
import { CetusClmmV2SDK } from '../sdk'
import {
  PreSwapQuote,
  PreSwapQuoteOptions,
  StepResult,
  SwapOption,
} from '../types/clmm_type'
export const AMM_SWAP_MODULE = 'amm_swap'
export const POOL_STRUCT = 'Pool'

/**
 * Helper class to help interact with clmm pool swap with a swap router interface.
 */
export class SwapModule implements IModule<CetusClmmV2SDK> {
  protected _sdk: CetusClmmV2SDK

  constructor(sdk: CetusClmmV2SDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }



  async preSwapQuote(option: PreSwapQuoteOptions) {
    const { clmm_pool } = this.sdk.sdkOptions
    const { global_config_id, versioned_id } = getPackagerConfigs(clmm_pool)
    const { pool_id, a2b, by_amount_in, amount, coin_type_a, coin_type_b } = option

    const tx = new Transaction()

    const sqrtPriceLimit = a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE

    const typeArguments = [coin_type_a, coin_type_b]
    const args = [tx.object(pool_id), tx.pure.bool(a2b), tx.pure.bool(by_amount_in), tx.pure.u64(amount), tx.pure.u128(sqrtPriceLimit.toString()),
    tx.object(global_config_id),
    tx.object(versioned_id),
    tx.object(CLOCK_ADDRESS),
    ]

    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::flash_swap`,
      arguments: args,
      typeArguments,
    })

    const simulateRes: any = await this.sdk.FullClient.simulateTransaction({
      transaction: tx,
      checksEnabled: false,
      include: { events: true },
    })
    const txResult = simulateRes.Transaction ?? simulateRes.FailedTransaction
    if (!txResult) {
      return handleError(SwapErrorCode.FetchError, new Error('simulateTransaction returned empty result'), {
        [DETAILS_KEYS.METHOD_NAME]: 'fetchSwapQuote',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    const quoteInfo = this.transformSwapData({ events: txResult.events } as any)
    if (quoteInfo == null) {
      return handleError(SwapErrorCode.FetchError, new Error('No quote info'), {
        [DETAILS_KEYS.METHOD_NAME]: 'preSwapQuote',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }
    return quoteInfo
  }


  private transformSwapData(simulate_res: any): PreSwapQuote | undefined {
    const rewarderValueData: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('pool::SwapEvent')
    })

    for (let i = 0; i < rewarderValueData.length; i += 1) {
      const { parsedJson } = rewarderValueData[i]
      const swaps_steps: StepResult[] = parsedJson.steps.map((bin_swap: any) => {
        return bin_swap
      })
      const info: PreSwapQuote = {
        from: fixCoinType(parsedJson.from.name, false),
        target: fixCoinType(parsedJson.target.name, false),
        pool_id: parsedJson.pool,
        partner: parsedJson.partner,
        amount_in: parsedJson.amount_in,
        amount_out: parsedJson.amount_out,
        ref_fee_amount: parsedJson.ref_amount,
        protocol_fee_amount: parsedJson.protocol_fee_amount,
        fee_amount: parsedJson.fee_amount,
        vault_a_amount: parsedJson.vault_a_amount,
        vault_b_amount: parsedJson.vault_b_amount,
        before_sqrt_price: parsedJson.before_sqrt_price,
        after_sqrt_price: parsedJson.after_sqrt_price,
        fee_coin: fixCoinType(parsedJson.fee_coin.name, false),
        steps: swaps_steps,
      }

      return info
    }
    return undefined
  }
  swap(option: SwapOption): Transaction {
    const { router, clmm_pool } = this._sdk.sdkOptions
    const { a2b, amount_in, amount_out, by_amount_in, slippage, coin_type_a, coin_type_b, swap_partner, pool_id } = option

    const tx = new Transaction()

    const in_amount_limit = by_amount_in
      ? amount_in
      : d(amount_in)
        .mul(1 + slippage)
        .toFixed(0)

    const out_amount_limit = by_amount_in
      ? d(amount_out)
        .mul(1 - slippage)
        .toFixed(0)
      : amount_out

    const in_coin = CoinAssist.buildCoinWithBalance(BigInt(in_amount_limit), a2b ? coin_type_a : coin_type_b, tx)

    const { versioned_id, global_config_id } = getPackagerConfigs(clmm_pool)


    const sqrtPriceLimit = a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE

    if (swap_partner) {
      tx.moveCall({
        target: `${router.published_at}::swap::${a2b ? 'swap_a2b_with_partner' : 'swap_b2a_with_partner'}`,
        arguments: [
          tx.object(pool_id),
          tx.object(swap_partner),
          in_coin,
          tx.pure.bool(by_amount_in),
          tx.pure.u64(BigInt(by_amount_in ? amount_in : amount_out)),
          tx.pure.u64(BigInt(by_amount_in ? out_amount_limit : in_amount_limit)),
          tx.pure.u128(sqrtPriceLimit.toString()),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
    } else {
      tx.moveCall({
        target: `${router.published_at}::swap::${a2b ? 'swap_a2b' : 'swap_b2a'}`,
        arguments: [
          tx.object(pool_id),
          in_coin,
          tx.pure.bool(by_amount_in),
          tx.pure.u64(BigInt(by_amount_in ? amount_in : amount_out)),
          tx.pure.u64(BigInt(by_amount_in ? out_amount_limit : in_amount_limit)),
          tx.pure.u128(sqrtPriceLimit.toString()),
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
