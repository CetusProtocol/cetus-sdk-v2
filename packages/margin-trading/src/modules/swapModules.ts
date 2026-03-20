import Decimal from 'decimal.js'
import { CetusMarginTradingSDK } from '../sdk'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { FindRouterParams } from '@cetusprotocol/aggregator-sdk'
import BN from 'bn.js'
import { addHexPrefix, CoinAssist, d, getPackagerConfigs, removeHexPrefix } from '@cetusprotocol/common-sdk'
import { CalculateFlashLoanParams, FlashLoanParams, RepayFlashSwapParams, RouterSwapParams } from '../types'
import { handleError, MarginTradingErrorCode } from '../errors/errors'

export class SwapModules {
  protected _sdk: CetusMarginTradingSDK

  constructor(sdk: CetusMarginTradingSDK) {
    this._sdk = sdk
  }

  /**
   * Find router
   */
  public async findRouters(coin_type_a: string, coin_type_b: string, amount: string, by_amount_in: boolean, pools: string[]) {
    try {
      const findRouterParams: FindRouterParams = {
        from: coin_type_a,
        target: coin_type_b,
        amount: new BN(d(amount).toFixed(0).toString()),
        byAmountIn: by_amount_in,
        depth: 3,
      }
      const res = await this._sdk.AggregatorClient.findRouters(findRouterParams)
      if (res?.error?.code === 10001) {
        return {
          ...res,
          is_exceed: res.insufficientLiquidity,
        }
      }
      if (res?.insufficientLiquidity) {
        return {
          ...res,
          is_exceed: res.insufficientLiquidity,
        }
      }
      if (!res?.paths || res?.paths?.length === 0) {
        throw Error('Aggregator no router')
      }

      return {
        amount_in: res.amountIn.toString(),
        amount_out: res.amountOut.toString(),
        is_exceed: res.insufficientLiquidity,
        route_obj: res,
        by_amount_in: true,
        origin_res: res,
      }
    } catch (error) {
      try {
        if (pools) {
          const res: any = await this._sdk.AggregatorClient.swapInPools({
            from: coin_type_a,
            target: coin_type_b,
            amount: new BN(d(amount).toFixed(0).toString()),
            byAmountIn: by_amount_in,
            pools,
          })

          if (res) {
            return {
              amount_in: res.routeData.amountIn.toString(),
              amount_out: res.routeData.amountOut.toString(),
              is_exceed: res.isExceed,
              route_obj: res.routeData,
              by_amount_in: true,
              origin_res: res,
            }
          }
          return null
        }
        return null
      } catch (e) {
        return null
      }
    }
  }

  /**
   * Execute router swap
   */
  public routerSwap = async (params: RouterSwapParams) => {
    const { slippage, txb, input_coin, router } = params
    const tx = txb || new Transaction()
    if (router) {
      return await this._sdk.AggregatorClient.routerSwap({ router, inputCoin: input_coin, slippage, txb: tx })
    }
  }

  /**
   * Check if swap is needed and handle swap logic
   * @param params Parameter object
   * @returns Swap result
   */
  async handleSwapLogic(params: {
    is_long: boolean
    is_quote: boolean
    amount: string
    base_token: string
    quote_token: string
    swap_clmm_pool: string
    slippage: number
    tx: Transaction
  }) {
    const { is_long, is_quote, amount, base_token, quote_token, swap_clmm_pool = '', slippage, tx } = params

    // Check if swap is needed
    const hasSwap = (is_long && is_quote) || (!is_long && !is_quote)

    let depositCoin: any
    let swapOutCoin: any
    let initDepositAmount = amount

    if (hasSwap) {
      // Long positions need to convert to base, short positions need to convert to quote
      // Determine swap from and to
      const from = is_long && is_quote ? quote_token : base_token
      const to = is_long && is_quote ? base_token : quote_token
      const routers = await this.findRouters(from, to, amount, true, [swap_clmm_pool])
      initDepositAmount = routers?.amount_out.toString()
      if (routers) {
        const inputCoin = CoinAssist.buildCoinWithBalance(BigInt(amount), from, tx)
        swapOutCoin = await this.routerSwap({
          router: routers.route_obj,
          slippage,
          input_coin: inputCoin,
          txb: tx,
        })
        depositCoin = swapOutCoin
      }
    } else {
      depositCoin = CoinAssist.buildCoinWithBalance(BigInt(amount.toString()), is_quote ? quote_token : base_token, tx)
    }

    return {
      has_swap: hasSwap,
      input_coin: depositCoin,
      init_deposit_amount: initDepositAmount,
    }
  }

  async handleSwap(params: {
    from: string
    to: string
    amount: string
    input_coin?: TransactionObjectArgument
    swap_clmm_pool: string
    slippage: number
    tx: Transaction
  }) {
    const { swap_clmm_pool = '', slippage, amount, from, to, tx, input_coin } = params

    // Find router
    const routers: any = await this.findRouters(from, to, amount, true, [swap_clmm_pool])
    const amountOut = routers.amount_out.toString()
    const swapOutCoin = await this.routerSwap({
      router: routers.route_obj,
      slippage,
      input_coin: input_coin || CoinAssist.buildCoinWithBalance(BigInt(amount), from, tx),
      txb: tx,
    })

    return {
      swap_out_coin: swapOutCoin,
      amount_out: amountOut,
    }
  }

  /**
   * Execute flash loan
   */
  flashLoan = (params: FlashLoanParams) => {
    console.log('🚀🚀🚀 ~ swapModules.ts:183 ~ SwapModules ~ params:', params)
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const { global_config_id } = getPackagerConfigs(this._sdk.ClmmSDK.sdkOptions.clmm_pool)
    const { amount, clmm_pool: clmmPool, clmm_pool_coin_type_a, clmm_pool_coin_type_b, flash_loan_coin, tx, amount_u64 } = params
    const isLoanA = addHexPrefix(clmm_pool_coin_type_a) === flash_loan_coin
    console.log('🚀🚀🚀 ~ swapModules.ts:188 ~ SwapModules ~ isLoanA:', isLoanA)

    const [balanceA, balanceB, receipt] = tx.moveCall({
      target: `${clmm_pool.published_at}::pool::flash_loan`,
      arguments: [tx.object(global_config_id), tx.object(clmmPool), tx.pure.bool(isLoanA), amount_u64 ? amount_u64 : tx.pure.u64(amount.toString())],
      typeArguments: [clmm_pool_coin_type_a, clmm_pool_coin_type_b],
    })
    return {
      balance_a: balanceA,
      balance_b: balanceB,
      receipt,
      is_loan_a: isLoanA,
      loan_coin_type: isLoanA ? clmm_pool_coin_type_a : clmm_pool_coin_type_b,
    }
  }

  /** Get flash loan pool */
  getFlashLoanPool = async (flash_loan_coin: string, flash_amount: string) => {
    console.log('🚀🚀🚀 ~ swapModules.ts:201 ~ SwapModules ~ flash_amount:', flash_amount, flash_loan_coin)
    try {
      const res = await fetch(
        `https://api-sui.cetus.zone/v3/sui/margin_trading/pools?coin_type=${flash_loan_coin}&min_amount=${flash_amount}`
      )
      const { data } = await res.json()
      console.log('🚀🚀🚀 ~ swapModules.ts:206 ~ SwapModules ~ data:', data)
      if (data && data.length > 0) {
        return {
          clmm_pool_coin_type_a: data[0].coin_type_a,
          clmm_pool_coin_type_b: data[0].coin_type_b,
          clmm_pool: data[0].pool_id,
          clmm_fee_tier: d(data[0].fee_rate).div(1000000).toString(),
        }
      } else {
        handleError(MarginTradingErrorCode.FlashLoanPoolNotFound, 'FlashLoanPoolNotFound')
        return {
          clmm_pool_coin_type_a: '',
          clmm_pool_coin_type_b: '',
          clmm_pool: '',
          clmm_fee_tier: '',
        }
      }
    } catch (error) {
      handleError(MarginTradingErrorCode.FetchError, error as Error)
      return {
        clmm_pool_coin_type_a: '',
        clmm_pool_coin_type_b: '',
        clmm_pool: '',
        clmm_fee_tier: '',
      }
    }
  }

  /**
   * Repay flash loan
   */
  public repayFlashLoan = (params: RepayFlashSwapParams) => {
    const { clmm_pool } = this._sdk.ClmmSDK.sdkOptions
    const { global_config_id } = getPackagerConfigs(this._sdk.ClmmSDK.sdkOptions.clmm_pool)
    const { tx, repay_base, repay_quote, receipt, clmm_pool: clmmPool, clmm_pool_coin_type_a, clmm_pool_coin_type_b } = params
    tx.moveCall({
      target: `${clmm_pool.published_at}::pool::repay_flash_loan`,
      arguments: [tx.object(global_config_id), tx.object(clmmPool), repay_base, repay_quote, receipt],
      typeArguments: [clmm_pool_coin_type_a, clmm_pool_coin_type_b],
    })

    return tx
  }

  /**
   * Calculate flash loan
   */
  async calculateFlashLoan(params: CalculateFlashLoanParams) {
    const { is_long, leverage, base_token, quote_token, deposit_amount, reserve, base_token_decimal, quote_token_decimal } = params

    // Get oracle price
    const priceUpdateData = await this._sdk.SuiLendModule.getLatestPriceFeeds(reserve)
    const quotePrice = priceUpdateData && priceUpdateData[removeHexPrefix(quote_token)]?.price
    const basePrice = priceUpdateData && priceUpdateData[removeHexPrefix(base_token)]?.price

    // For long positions calculate base to quote rate, for short positions calculate quote to base rate
    const rate = is_long ? d(basePrice).div(d(quotePrice)).toString() : d(quotePrice).div(d(basePrice)).toString()

    // Flash loan amount = user deposit amount * (leverage - 1) * rate / (baseTokenDecimal / quoteTokenDecimal)
    console.log(
      '🚀🚀🚀 ~ swapModules.ts:267 ~ SwapModules ~ calculateFlashLoan ~ deposit_amount:',
      deposit_amount,
      rate,
      base_token_decimal,
      quote_token_decimal
    )
    const flashAmount = d(deposit_amount)
      .mul(d(leverage).sub(1))
      .mul(rate)
      .div(10 ** (is_long ? base_token_decimal : quote_token_decimal))
      .mul(10 ** (is_long ? quote_token_decimal : base_token_decimal))
      .toDP(0, Decimal.ROUND_UP)
      .toString()
    console.log(
      '🚀🚀🚀 ~ swapModules.ts:274 ~ SwapModules ~ calculateFlashLoan ~ flashAmount:',
      d(deposit_amount)
        .mul(d(leverage).sub(1))
        .mul(rate)
        .div(10 ** (is_long ? base_token_decimal : quote_token_decimal))
        .mul(10 ** (is_long ? quote_token_decimal : base_token_decimal))
        .toString(),
      flashAmount
    )

    // Coin to borrow for flash loan
    const flashLoanCoin = is_long ? quote_token : base_token
    const { clmm_pool_coin_type_a, clmm_fee_tier, clmm_pool, clmm_pool_coin_type_b } = await this.getFlashLoanPool(
      flashLoanCoin,
      flashAmount
    )
    // Whether to borrow tokenA from clmm pool
    const isFlashA = clmm_pool_coin_type_a === flashLoanCoin
    // Flash loan fee
    const flashLoanFee = d(flashAmount).mul(clmm_fee_tier).toString()

    return {
      flash_amount: flashAmount,
      rate,
      quote_price: quotePrice,
      base_price: basePrice,
      flash_loan_coin: flashLoanCoin,
      is_flash_a: isFlashA,
      flash_loan_fee: flashLoanFee,
      clmm_pool,
      clmm_pool_coin_type_a,
      clmm_pool_coin_type_b,
      clmm_fee_tier,
    }
  }
}
