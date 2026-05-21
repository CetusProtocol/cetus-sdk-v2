// @ts-nocheck
import { BuildRouterSwapParamsV3, FindRouterParams, PreSwapLpChangeParams } from '@cetusprotocol/aggregator-sdk'
import { Transaction } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  asUintN,
  ClmmPoolUtil,
  CLOCK_ADDRESS,
  CoinAsset,
  CoinAssist,
  convertScientificToDecimal,
  d,
  DETAILS_KEYS,
  fromDecimalsAmount,
  getPackagerConfigs,
  IModule,
  TickMath,
  toDecimalsAmount,
} from '@cetusprotocol/common-sdk'
import Decimal from 'decimal.js'
import { handleError, handleMessageError, ZapErrorCode } from '../errors/errors'
import { CetusClmmV2SDK } from '../sdk'
import {
  BaseDepositOptions,
  CalculationDepositResult,
  CalculationWithdrawResult,
  defaultSwapSlippage,
  DepositOptions,
  FixedOneSideOptions,
  FlexibleBothOptions,
  OnlyCoinAOptions,
  OnlyCoinBOptions,
  SwapResult,
  WithdrawCalculationOptions,
  WithdrawOptions,
} from '../types/zap'
import { calculateLiquidityAmountEnough, calculateLiquidityAmountSide, verifySwapData } from '../utils/zap'

/**
 * ZapModule handles interactions with clmm pools within the system.
 */
export class ZapModule implements IModule<CetusClmmV2SDK> {
  protected _sdk: CetusClmmV2SDK

  constructor(sdk: CetusClmmV2SDK) {
    this._sdk = sdk
  }

  /**
   * Returns the associated SDK instance
   */
  get sdk() {
    return this._sdk
  }

  /**
   * Builds a transaction payload for withdrawing liquidity from a pool
   * @param options Withdrawal options including:
   *   - withdraw_obj: Pre-calculated withdrawal amounts and parameters
   *   - pool_id: ID of the liquidity pool
   *   - pos_id: Position ID to withdraw from
   *   - close_pos: Whether to close the position after withdrawal
   *   - collect_fee: Whether to collect accumulated fees
   *   - collect_rewarder_types: Types of rewards to collect
   *   - coin_type_a: Type of coin A in the pool
   *   - coin_type_b: Type of coin B in the pool
   *   - slippage: Maximum acceptable slippage percentage
   * @param tx Optional existing transaction to add withdrawal operations to
   * @returns Transaction object containing the withdrawal payload
   */
  async buildWithdrawPayload(options: WithdrawOptions, tx: Transaction) {
    console.log('🚀 ~ ZapModule ~ buildWithdrawPayload ~ options:', options)
    const { clmm_pool } = this._sdk.sdkOptions
    const {
      withdraw_obj,
      pool_id,
      pos_id,
      close_pos,
      collect_fee,
      collect_rewarder_types,
      coin_type_a,
      coin_type_b,
      slippage,
      swap_slippage = defaultSwapSlippage,
    } = options
    const { swap_result, amount_a, amount_b, mode, burn_liquidity } = withdraw_obj

    tx = tx || new Transaction()

    // Calculate minimum receive amounts considering slippage
    const amount_a_limit = d(amount_a)
      .mul(1 - slippage)
      .toFixed(0)
    const amount_b_limit = d(amount_b)
      .mul(1 - slippage)
      .toFixed(0)

    // Handle fixed one-side mode
    const { coin_a: receiveCoinA, coin_b: receiveCoinB } = this._sdk.Position.removeLiquidity(
      {
        pool_id,
        position_id: pos_id,
        coin_type_a,
        coin_type_b,
        collect_fee,
        delta_liquidity: burn_liquidity,
        min_amount_a: amount_a_limit,
        min_amount_b: amount_b_limit,
        rewarder_coin_types: collect_rewarder_types,
        is_return_coins: true,
        close_position: close_pos,
      }, tx)!

    if (mode === 'FixedOneSide') {
      tx.transferObjects([receiveCoinA, receiveCoinB], this._sdk.getSenderAddress())
      return
    }


    // Execute token swap if needed
    if (swap_result?.route_obj) {
      const is_receive_coin_a = mode === 'OnlyCoinA'
      const swapCoinObjectId = is_receive_coin_a ? receiveCoinB : receiveCoinA

      const routerParamsV3: BuildRouterSwapParamsV3 = {
        router: swap_result.route_obj,
        inputCoin: swapCoinObjectId,
        slippage: swap_slippage,
        txb: tx,
      }

      const toCoin = await this._sdk.AggregatorClient.fixableRouterSwapV3(routerParamsV3)

      tx.transferObjects([is_receive_coin_a ? receiveCoinA : receiveCoinB, toCoin], this._sdk.getSenderAddress())
    } else {
      tx.transferObjects([receiveCoinA, receiveCoinB], this._sdk.getSenderAddress())
    }


    return tx
  }

  /**
   * Build transaction payload for depositing liquidity
   *
   * This function determines whether to use single-sided or single-coin deposit based on whether
   * a token swap is needed. If no swap is required (swap_result.route_obj is undefined), it uses
   * single-sided deposit. Otherwise, it uses single-coin deposit with swap.
   *
   * @param options - Deposit options including:
   *                  - deposit_obj: Pre-calculated deposit amounts and parameters
   *                  - pool_id: ID of the liquidity pool
   *                  - coin_type_a/b: Coin types for the trading pair
   *                  - tick_lower/upper: Price range boundaries
   *                  - slippage: Maximum acceptable price slippage
   *                  - pos_obj?: Optional existing position details
   * @param tx - Optional transaction object to add operations to
   * @returns Transaction object with deposit operations
   */
  async buildDepositPayload(options: DepositOptions, tx?: Transaction): Promise<Transaction> {
    console.log('🚀 ~ ZapModule ~ buildDepositOptions ~ options:', options)

    const { deposit_obj } = options
    const { mode } = deposit_obj

    // Create new transaction if none provided
    tx = tx || new Transaction()

    // FixedOneSide mode
    if (mode === 'FixedOneSide') {
      // No swap needed - use single-sided deposit
      return await this.buildDepositOneSidePayload(options, tx)
    }

    // OnlyCoinA or OnlyCoinB mode
    if (mode === 'OnlyCoinA' || mode === 'OnlyCoinB') {
      return await this.buildDepositOnlyCoinPayload(options, tx)
    }

    // This branch will always throw an error
    return handleMessageError(ZapErrorCode.UnsupportedDepositMode, `Unsupported deposit mode: ${mode}`, {
      [DETAILS_KEYS.REQUEST_PARAMS]: options,
      [DETAILS_KEYS.METHOD_NAME]: 'buildDepositPayload',
    }) as never
  }




  /**
   * Build transaction payload for single-sided deposit
   *
   * This function constructs a transaction payload for depositing liquidity with fixed amounts
   * of one token. It handles both opening new positions and adding to existing ones.
   *
   * @private
   * @param options - Deposit options including:
   *                  - pool_id: ID of the liquidity pool
   *                  - slippage: Maximum acceptable price slippage
   *                  - coin_type_a/b: Coin types for the trading pair
   *                  - pos_obj: Optional existing position details
   *                  - deposit_obj: Pre-calculated deposit amounts and parameters
   * @param tx - Transaction object to add operations to
   * @returns Transaction object with single-sided deposit operations
   */
  private async buildDepositOneSidePayload(options: DepositOptions, tx: Transaction) {
    const { pos_obj, deposit_obj, coin_type_a, coin_type_b, pool_id, tick_lower, tick_upper } = options
    const { amount_a, amount_b, amount_limit_a, amount_limit_b, fixed_liquidity_coin_a } = deposit_obj

    const is_open_position = pos_obj === undefined

    const isOverRange = d(amount_a).eq(0) || d(amount_b).eq(0)

    const fixed_amount_a = isOverRange ? amount_a : fixed_liquidity_coin_a ? amount_a : amount_limit_a
    const fixed_amount_b = isOverRange ? amount_b : fixed_liquidity_coin_a ? amount_b : amount_limit_b

    const existingPosition = pos_obj
    if (!is_open_position && !existingPosition) {
      return handleMessageError(ZapErrorCode.ParameterError, 'pos_obj is required for existing position deposit', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'buildDepositOneSidePayload',
      }) as never
    }

    this._sdk.Position.addLiquidityFixCoin({
      pool_id,
      coin_type_a,
      coin_type_b,
      amount_a: fixed_amount_a,
      amount_b: fixed_amount_b,
      fix_amount_a: false,
      position: is_open_position ? {
        tick_lower: tick_lower.toString(),
        tick_upper: tick_upper.toString(),
      } : {
        position_id: existingPosition.pos_id,
        collect_fee: existingPosition.collect_fee || false,
        rewarder_coin_types: existingPosition.collect_rewarder_types || []

      }
    }, tx)



    return tx
  }



  /**
   * Build transaction payload for depositing with only one coin type
   * This function handles the deposit process where a user provides only one type of coin,
   * which is then partially swapped to obtain the other required coin for liquidity provision.
   *
   * @private
   * @param options - Deposit options including pool details, slippage, coin types and amounts
   * @param tx - Transaction object to add operations to
   * @returns Transaction object with single-coin deposit operations
   */
  private async buildDepositOnlyCoinPayload(options: DepositOptions, tx: Transaction) {
    const { swap_slippage = defaultSwapSlippage, coin_type_a, coin_type_b, pos_obj, deposit_obj, pool_id, tick_lower, tick_upper } = options

    const { amount_a, amount_b, mode, fixed_liquidity_coin_a, swap_result, original_input_amount_a, original_input_amount_b } = deposit_obj

    // Convert tick ranges to unsigned integers
    const isOpenPosition = pos_obj === undefined

    // Determine which coin is being provided
    const isOnlyCoinA = mode === 'OnlyCoinA'

    // Get all available coins owned by sender
    const allCoinAsset = await this._sdk.FullClient.getOwnerCoinAssets(this.sdk.getSenderAddress())

    // Execute token swap to obtain the other required coin
    const { swap_in_amount, swap_out_amount, route_obj } = swap_result!

    let coinInput

    const isOverRange = d(amount_a).eq(0) || d(amount_b).eq(0)

    const swap_out_amount_limit = d(swap_out_amount)
      .mul(1 - swap_slippage)
      .toFixed(0)

    const original_input_amount = isOnlyCoinA ? original_input_amount_a : original_input_amount_b

    const fixed_amount_a = isOnlyCoinA ? d(original_input_amount).sub(swap_in_amount).toFixed(0) : swap_out_amount_limit
    const fixed_amount_b = isOnlyCoinA ? swap_out_amount_limit : d(original_input_amount).sub(swap_in_amount).toFixed(0)

    console.log('🚀 ~ ZapModule ~ buildDepositOnlyCoinPayload ~ fixed_amount_a:', fixed_amount_a)
    console.log('🚀 ~ ZapModule ~ buildDepositOnlyCoinPayload ~ fixed_amount_b:', fixed_amount_b)

    if (isOnlyCoinA) {
      coinInput = CoinAssist.buildMultiCoinInput(tx, allCoinAsset, coin_type_a, [BigInt(swap_in_amount), BigInt(fixed_amount_a)])
    } else {
      coinInput = CoinAssist.buildMultiCoinInput(tx, allCoinAsset, coin_type_b, [BigInt(swap_in_amount), BigInt(fixed_amount_b)])
    }

    // Build coin object for the swap input
    const swapCoinObject = CoinAssist.getCoinAmountObjId(coinInput, swap_in_amount)

    // Configure and execute the swap via router
    const routerParamsV3: BuildRouterSwapParamsV3 = {
      router: route_obj,
      slippage: swap_slippage,
      txb: tx,
      inputCoin: swapCoinObject,
    }
    const swap_out_coin = await this._sdk.AggregatorClient.fixableRouterSwapV3(routerParamsV3)

    // Prepare primary coin inputs for liquidity provision
    const primaryCoinAInputs = isOnlyCoinA ? CoinAssist.getCoinAmountObjId(coinInput, fixed_amount_a) : swap_out_coin
    const primaryCoinBInputs = isOnlyCoinA ? swap_out_coin : CoinAssist.getCoinAmountObjId(coinInput, fixed_amount_b)



    const existingPosition = pos_obj
    if (!isOpenPosition && !existingPosition) {
      return handleMessageError(ZapErrorCode.ParameterError, 'pos_obj is required for existing position deposit', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'buildDepositOnlyCoinPayload',
      }) as never
    }

    this._sdk.Position.addLiquidityFixCoin({
      pool_id,
      coin_type_a,
      coin_type_b,
      amount_a: fixed_liquidity_coin_a ? fixed_amount_a : '999999999999999',
      amount_b: fixed_liquidity_coin_a ? '999999999999999' : fixed_amount_b,
      fix_amount_a: false,
      position: isOpenPosition ? {
        tick_lower: tick_lower.toString(),
        tick_upper: tick_upper.toString(),
      } : {
        position_id: existingPosition.pos_id,
        collect_fee: existingPosition.collect_fee || false,
        rewarder_coin_types: existingPosition.collect_rewarder_types || []
      },
    }, tx, primaryCoinAInputs, primaryCoinBInputs)

    return tx
  }

  /**
   * Pre-calculate the amount of liquidity to withdraw
   * @param options Withdrawal calculation options
   */
  async preCalculateWithdrawAmount(options: WithdrawCalculationOptions): Promise<CalculationWithdrawResult> {
    const { mode } = options
    console.log('🚀 ~ ZapModule ~ preCalculateDepositAmount ~ options:', options)

    // Determine withdrawal behavior based on mode
    switch (mode) {
      case 'FixedOneSide': {
        // In this mode, one side's withdrawal amount is fixed, the other side is calculated based on the fixed side
        const { fixed_amount, fixed_coin_a } = options
        return this.calculateWithdrawOtherSide(options, fixed_amount, fixed_coin_a)
        break
      }

      case 'OnlyCoinA': {
        // In this mode, only withdraw token A, token B is converted to A
        const { receive_amount_a, available_liquidity, max_remain_rate } = options
        return this.calculateWithdrawOnlyCoin(options, available_liquidity, true, receive_amount_a, max_remain_rate)
        break
      }

      case 'OnlyCoinB': {
        // In this mode, only withdraw token B, token A is converted to B
        const { receive_amount_b, available_liquidity, max_remain_rate } = options
        return this.calculateWithdrawOnlyCoin(options, available_liquidity, false, receive_amount_b, max_remain_rate)
        break
      }

      default:
        throw new Error(`Unsupported withdraw mode: ${mode}`)
    }
  }

  /**
   * Calculates the withdrawal amount for a single-asset withdrawal.
   * @private
   * @param options - Withdrawal calculation options.
   * @param available_liquidity - The total available liquidity in the pool.
   * @param is_receive_coin_a - Whether the user wants to receive Coin A.
   * @param receive_amount - The desired withdrawal amount (optional).
   * @returns A promise that resolves to the withdrawal calculation result.
   */
  private async calculateWithdrawOnlyCoin(
    options: WithdrawCalculationOptions,
    available_liquidity: string,
    is_receive_coin_a: boolean,
    receive_amount?: string,
    max_remain_rate = 0.02
  ): Promise<CalculationWithdrawResult> {
    const { tick_lower, tick_upper, current_sqrt_price, mode, burn_liquidity } = options

    // If a specific liquidity amount is to be burned
    if (burn_liquidity) {
      const { swap_result, amount_a, amount_b, total_receive_amount } = await this.calculateWithdrawOnlyCoinByLpAmount(
        options,
        burn_liquidity,
        is_receive_coin_a
      )
      return {
        burn_liquidity,
        amount_a,
        amount_b,
        mode,
        total_receive_amount,
        swap_result: swap_result,
      }
    }

    // Parameter validation
    if (!receive_amount) {
      return handleMessageError(ZapErrorCode.ParameterError, 'receive_amount is missing or invalid', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'calculateWithdrawOnlyCoin',
      }) as never
    }
    if (is_receive_coin_a === undefined) {
      return handleMessageError(ZapErrorCode.ParameterError, 'is_receive_coin_a is missing or invalid', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'calculateWithdrawOnlyCoin',
      }) as never
    }

    // Calculate deposit ratio based on the given tick range
    const { ratio_a, ratio_b } = ClmmPoolUtil.calculateDepositRatio(Number(tick_lower), Number(tick_upper), new BN(current_sqrt_price))
    const fix_ratio = is_receive_coin_a ? ratio_a : ratio_b
    // Calculate the fixed proportion amount
    const fix_amount = d(receive_amount).mul(fix_ratio)

    // Estimate liquidity and token amounts based on the fixed amount
    const removeParams = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower,
      tick_upper,
      new BN(fix_amount.toFixed(0)),
      is_receive_coin_a,
      false,
      1,
      new BN(current_sqrt_price)
    )

    // Perform binary search to find the optimal liquidity amount
    let minLiquidity = new BN(0)
    let maxLiquidity = new BN(available_liquidity)
    let bestLiquidity = '0'
    let bestReceiveAmount = '0'
    const allowedErrorPercentage = max_remain_rate // Allowed error percentage
    const maxIterations = 10 // Maximum number of iterations
    let totalError = Number.MAX_VALUE
    let iterations = 0
    let result

    // Iterate to find the optimal solution
    while (totalError > allowedErrorPercentage && iterations < maxIterations) {
      const midLiquidity = iterations === 0 ? removeParams.liquidity_amount : minLiquidity.add(maxLiquidity).div(new BN(2)).toString()
      iterations++
      result = await this.calculateWithdrawOnlyCoinByLpAmount(options, midLiquidity, is_receive_coin_a)

      if (result === undefined) {
        break
      }

      const { total_receive_amount } = result
      const targetAmount = new BN(receive_amount || '0')
      const error = d(total_receive_amount).sub(receive_amount).div(receive_amount).abs().toNumber()
      console.log('🚀 ~ ZapModule ~ error:', error)

      // If the error is within the allowed range, optimal solution found
      if (error <= allowedErrorPercentage) {
        bestLiquidity = midLiquidity
        bestReceiveAmount = total_receive_amount
        totalError = error
        break
      }

      // Adjust search range based on the received amount
      if (new BN(total_receive_amount).lt(targetAmount)) {
        minLiquidity = new BN(midLiquidity).add(new BN(1)) // If received amount is too low, increase min LP amount
      } else {
        maxLiquidity = new BN(midLiquidity).sub(new BN(1)) // If received amount is too high, decrease max LP amount
      }

      // Exit loop if LP amount change is too small
      if (maxLiquidity.sub(minLiquidity).lte(new BN(1))) {
        break
      }
    }

    // Check iteration result
    if (iterations >= maxIterations) {
      return handleMessageError(ZapErrorCode.ReachMaxIterations, 'Reached maximum iterations, could not find optimal LP amount.', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'calculateWithdrawOnlyCoin',
      }) as never
    }

    if (d(bestLiquidity).eq(0)) {
      return handleMessageError(ZapErrorCode.BestLiquidityIsZero, 'Best liquidity is 0', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'calculateWithdrawOnlyCoin',
      }) as never
    }

    const { amount_a, amount_b, swap_result } = result!

    return {
      burn_liquidity: bestLiquidity,
      amount_a,
      amount_b,
      mode,
      total_receive_amount: bestReceiveAmount,
      swap_result: swap_result,
    }
  }

  /**
   * Calculates the withdrawal amount for a single-asset withdrawal based on the LP token amount.
   * @private
   * @param options - Withdrawal calculation options.
   * @param burn_liquidity - The amount of liquidity (LP tokens) to be burned.
   * @param is_receive_coin_a - Whether the user wants to receive Coin A.
   * @returns A promise that resolves to the withdrawal calculation result.
   */
  async calculateWithdrawOnlyCoinByLpAmount(
    options: WithdrawCalculationOptions,
    burn_liquidity: string,
    is_receive_coin_a: boolean,
    swap_price?: string
  ) {
    const { tick_lower, tick_upper, current_sqrt_price, coin_type_a, coin_type_b, pool_id, coin_decimal_a, coin_decimal_b } = options

    // Calculate the price range
    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(tick_lower)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(tick_upper)

    // Compute the token amounts based on the liquidity to be burned
    const { coin_amount_a, coin_amount_b } = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(burn_liquidity),
      new BN(current_sqrt_price),
      lowerSqrtPrice,
      upperSqrtPrice,
      false
    )

    const amount_a = coin_amount_a
    const amount_b = coin_amount_b

    // Set swap parameters
    const from = is_receive_coin_a ? coin_type_b : coin_type_a
    const target = is_receive_coin_a ? coin_type_a : coin_type_b
    const swapAmount = is_receive_coin_a ? amount_b : amount_a

    if (d(swapAmount).eq(0)) {
      const total_receive_amount = is_receive_coin_a ? amount_a : amount_b
      // One-sided, no need for swap
      return {
        amount_a,
        amount_b,
        total_receive_amount,
        swap_price,
      }
    }

    let swapResult: SwapResult

    // TODO  In this mode, if the pool price changes after the swap, it will cause the after_sqrt_price to be inaccurate, affecting the liquidity removal ratio calculation.
    if (swap_price) {
      swapResult = {
        swap_in_amount: swapAmount,
        swap_out_amount: d(swapAmount).mul(swap_price).toFixed(0, Decimal.ROUND_DOWN),
        after_sqrt_price: current_sqrt_price,
        swap_price,
      }
    } else {
      const from_decimal = is_receive_coin_a ? coin_decimal_b : coin_decimal_a
      const target_decimal = is_receive_coin_a ? coin_decimal_a : coin_decimal_b
      swapResult = await this.findRouters(
        pool_id,
        current_sqrt_price,
        from,
        target,
        d(swapAmount),
        !is_receive_coin_a,
        from_decimal,
        target_decimal
      )
    }

    const { swap_out_amount } = swapResult

    // Calculate the total amount received
    const total_receive_amount = is_receive_coin_a
      ? d(amount_a).add(swap_out_amount).toString()
      : d(amount_b).add(swap_out_amount).toString()

    return {
      swap_result: swapResult,
      amount_a,
      amount_b,
      total_receive_amount,
      swap_price: swapResult.swap_price,
    }
  }

  /**
   * Calculates the withdrawal amount when withdrawing a fixed amount of a single asset.
   * @private
   * @param options - Withdrawal calculation options.
   * @param fixed_amount - The fixed amount of the asset to withdraw.
   * @param fixed_coin_a - Whether the fixed amount corresponds to Coin A.
   * @returns A promise that resolves to the withdrawal calculation result.
   */
  private async calculateWithdrawOtherSide(
    options: WithdrawCalculationOptions,
    fixed_amount?: string,
    fixed_coin_a?: boolean
  ): Promise<CalculationWithdrawResult> {
    const { tick_lower, tick_upper, current_sqrt_price, burn_liquidity } = options

    // If a specific liquidity amount to burn is provided
    if (burn_liquidity) {
      const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(tick_lower)
      const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(tick_upper)

      const { coin_amount_a, coin_amount_b } = ClmmPoolUtil.getCoinAmountFromLiquidity(
        new BN(burn_liquidity),
        new BN(current_sqrt_price),
        lowerSqrtPrice,
        upperSqrtPrice,
        false
      )

      const amount_a = coin_amount_a
      const amount_b = coin_amount_b

      return {
        burn_liquidity,
        amount_a,
        amount_b,
        mode: 'FixedOneSide',
      }
    }

    // Parameter validation
    if (fixed_amount === undefined || fixed_coin_a === undefined) {
      return handleMessageError(ZapErrorCode.ParameterError, 'fixed_coin_a or fixed_amount is undefined', {
        [DETAILS_KEYS.REQUEST_PARAMS]: options,
        [DETAILS_KEYS.METHOD_NAME]: 'calculateWithdrawOtherSide',
      }) as never
    }

    // Estimate liquidity and token amounts
    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower,
      tick_upper,
      new BN(fixed_amount!),
      fixed_coin_a!,
      false,
      1,
      new BN(current_sqrt_price)
    )

    const amount_a = fixed_coin_a ? fixed_amount : liquidityInput.coin_amount_a
    const amount_b = fixed_coin_a ? liquidityInput.coin_amount_b : fixed_amount

    return {
      burn_liquidity: liquidityInput.liquidity_amount,
      amount_a,
      amount_b,
      mode: 'FixedOneSide',
    }
  }

  /**
   * Pre-calculates the deposit amount based on the selected mode.
   * @param options - The base deposit options.
   * @param mode_options - The mode options for the deposit.
   * @returns A promise resolving to the calculation deposit result.
   */
  async preCalculateDepositAmount(
    options: BaseDepositOptions,
    mode_options: FixedOneSideOptions | FlexibleBothOptions | OnlyCoinAOptions | OnlyCoinBOptions
  ): Promise<CalculationDepositResult> {
    const { mode } = mode_options
    console.log('🚀 ~ ZapModule ~ preCalculateDepositAmount ~ options:', {
      options,
      mode_options,
    })

    // Determine deposit behavior based on the selected mode
    switch (mode) {
      case 'FixedOneSide': {
        /**
         * In this mode, one side of the deposit amount is fixed,
         * and the other side is calculated based on the fixed side.
         */
        return this.calculateFixedOneSide(options, mode_options)
        break
      }


      case 'OnlyCoinA': {
        /**
         * In this mode, only token A is deposited,
         * and token B is obtained through swapping.
         */
        return this.calculateDepositOnlyCoin(options, mode_options)
        break
      }

      case 'OnlyCoinB': {
        /**
         * In this mode, only token B is deposited,
         * and token A is obtained through swapping.
         */
        return this.calculateDepositOnlyCoin(options, mode_options)
        break
      }

      default:
        return handleMessageError(ZapErrorCode.UnsupportedDepositMode, `Unsupported deposit mode: ${mode}`, {
          [DETAILS_KEYS.REQUEST_PARAMS]: options,
          [DETAILS_KEYS.METHOD_NAME]: 'preCalculateDepositAmount',
        }) as never
    }
  }


  /**
   * Finds the optimal swap route.
   * @param clmm_pool - The liquidity pool ID.
   * @param after_sqrt_price - The price after swapping.
   * @param from - The source token type.
   * @param target - The target token type.
   * @param amount - The swap amount.
   * @param by_amount_in - Whether to calculate by input amount.
   * @param liquidity_changes - The liquidity change parameters.
   * @returns A promise resolving to the swap result.
   */
  public async findRouters(
    clmm_pool: string,
    after_sqrt_price: string,
    from: string,
    target: string,
    amount: Decimal,
    by_amount_in: boolean,
    from_decimal: number,
    target_decimal: number,
    liquidity_changes?: PreSwapLpChangeParams
  ): Promise<SwapResult> {
    // const { providers } = this._sdk.sdkOptions
    const client = this._sdk.AggregatorClient

    if (d(amount.toFixed(0).toString()).lt(1)) {
      return handleMessageError(ZapErrorCode.SwapAmountError, 'Swap amount is less than the minimum precision', {
        [DETAILS_KEYS.METHOD_NAME]: 'findRouters',
      }) as never
    }

    try {
      // Construct parameters for route finding
      const findRouterParams: FindRouterParams = {
        from,
        target,
        amount: new BN(amount.toFixed(0).toString()),
        byAmountIn: true,
        depth: 3,
        // providers,
      }
      if (liquidity_changes && liquidity_changes.poolID) {
        findRouterParams.liquidityChanges = [liquidity_changes]
      }

      // Find the swap route
      const res = await client.findRouters(findRouterParams)
      if (res?.error) {
        return handleMessageError(ZapErrorCode.AggregatorError, `Aggregator findRouters error: ${res?.error}`, {
          [DETAILS_KEYS.METHOD_NAME]: 'findRouters',
          [DETAILS_KEYS.REQUEST_PARAMS]: findRouterParams,
        }) as never
      }
      if (!res?.paths || res?.paths?.length === 0) {
        return handleMessageError(ZapErrorCode.AggregatorError, 'Aggregator findRouters error: no router', {
          [DETAILS_KEYS.METHOD_NAME]: 'findRouters',
          [DETAILS_KEYS.REQUEST_PARAMS]: findRouterParams,
        }) as never
      }

      // Update the price after swapping
      // res.routes.forEach((split_path: any) => {
      const base_path: any = res.paths.find((base_path: any) => base_path.id.toLowerCase() === clmm_pool.toLowerCase())
      if (base_path && base_path.extendedDetails && base_path.extendedDetails.afterSqrtPrice) {
        after_sqrt_price = convertScientificToDecimal(String(base_path.extendedDetails.afterSqrtPrice), 0)
      }
      // })

      const swap_in_amount = res.amountIn.toString()
      const swap_out_amount = res.amountOut.toString()
      const swap_price = d(fromDecimalsAmount(swap_out_amount, target_decimal))
        .div(fromDecimalsAmount(swap_in_amount, from_decimal))
        .toString()

      // Return the swap result
      const swapResult: SwapResult = {
        swap_in_amount: res.amountIn.toString(),
        swap_out_amount: res.amountOut.toString(),
        after_sqrt_price,
        route_obj: res,
        swap_price,
      }
      return swapResult
    } catch (error) {
      console.log('🚀 ~ ZapModule ~ error:', error)
      try {
        // If route finding fails, attempt to swap in the specified pool
        const res = await client.swapInPools({
          from,
          target,
          amount: new BN(amount.toFixed(0).toString()),
          byAmountIn: by_amount_in,
          pools: [clmm_pool],
        })

        if (res === null || !res.routeData || res.isExceed) {
          return handleMessageError(ZapErrorCode.AggregatorError, 'Aggregator findRouters error: no router', {
            [DETAILS_KEYS.METHOD_NAME]: 'swapInPools',
          }) as never
        }

        // Update the price after swapping
        // res.routeData.paths.forEach((splitPath: any) => {
        const basePath: any = res.routeData.paths.find((basePath: any) => basePath.id.toLowerCase() === clmm_pool.toLowerCase())
        if (basePath) {
          after_sqrt_price = convertScientificToDecimal(String(basePath.extendedDetails.afterSqrtPrice))
        }
        // })

        // Return the swap result
        const swapResult: SwapResult = {
          swap_in_amount: res.routeData.amountIn.toString(),
          swap_out_amount: res.routeData.amountOut.toString(),
          after_sqrt_price,
          route_obj: res.routeData,
          swap_price: '',
        }
        return swapResult
      } catch (error) {
        return handleError(ZapErrorCode.AggregatorError, error as Error, {
          [DETAILS_KEYS.METHOD_NAME]: 'swapInPools',
        }) as never
      }
    }
  }

  /**
   * Calculates the deposit amount for a single coin type.
   * @param options - The base deposit options.
   * @param mode_options - The mode options for the deposit.
   * @returns A promise resolving to the calculation deposit result.
   */
  async calculateDepositOnlyCoin(
    options: BaseDepositOptions,
    mode_options: OnlyCoinAOptions | OnlyCoinBOptions
  ): Promise<CalculationDepositResult> {
    const { tick_lower, tick_upper, current_sqrt_price, slippage, pool_id, mark_price, swap_slippage = defaultSwapSlippage } = options
    const { coin_amount, coin_type_a, coin_type_b, max_remain_rate = 0.02, mode, coin_decimal_a, coin_decimal_b } = mode_options
    // Calculate the deposit ratio
    //  const { ratioA, ratioB } = calculateDepositRatio(Number(tick_lower), Number(tick_upper), new BN(current_sqrt_price))

    const fixedCoinA = mode === 'OnlyCoinA'

    const {
      swap_amount,
      receive_amount,
      remaining_a,
      remaining_b,
      swap_result: calculate_swap_result,
    } = await this.calculateSwapAmountByQuantity(
      pool_id,
      coin_type_a,
      coin_type_b,
      tick_lower,
      tick_upper,
      current_sqrt_price,
      coin_decimal_a,
      coin_decimal_b,
      coin_amount,
      fixedCoinA,
      max_remain_rate,
      mark_price
    )
    const fix_amount = d(coin_amount).sub(swap_amount)

    console.log('🚀 ~ ZapModule ~ swap_amount:', {
      swap_amount,
      receive_amount,
      fix_amount,
      remaining_a,
      remaining_b,
    })

    // If no swap is needed, directly return the fixed one-side calculation result
    if (d(swap_amount).eq(0)) {
      return this.calculateFixedOneSide(options, {
        mode: 'FixedOneSide',
        fixed_amount: coin_amount,
        fixed_coin_a: fixedCoinA,
      })
    }

    // Execute token swap
    const from = fixedCoinA ? coin_type_a : coin_type_b
    const target = fixedCoinA ? coin_type_b : coin_type_a

    let resultFormat
    let bestSwapAmount = d(swap_amount)
    let swapResult

    const maxLoop = 5
    let loopCount = 0

    do {
      loopCount++
      swapResult =
        calculate_swap_result ||
        (await this.findRouters(
          pool_id,
          swapResult ? swapResult.after_sqrt_price : current_sqrt_price,
          from,
          target,
          bestSwapAmount,
          fixedCoinA,
          fixedCoinA ? coin_decimal_a : coin_decimal_b,
          fixedCoinA ? coin_decimal_b : coin_decimal_a
        ))

      resultFormat = verifySwapData(
        swapResult,
        coin_amount,
        current_sqrt_price,
        fixedCoinA,
        tick_lower,
        tick_upper,
        slippage,
        swap_slippage
      )
      console.log('🚀 ~ ZapModule ~ resultFormat:', {
        resultFormat,
        swapResult,
        bestSwapAmount,
        loopCount,
      })

      if (!resultFormat.is_valid_swap_result) {
        // If not enough, increase swapAmount
        bestSwapAmount = d(bestSwapAmount).mul(1 + 0.01)
      } else {
        const maxRemainAmount = d(swapResult.swap_out_amount).mul(max_remain_rate)
        // If remaining amount is too much, decrease swapAmount
        if (d(maxRemainAmount).lt(d(resultFormat.remain_amount))) {
          bestSwapAmount = d(bestSwapAmount).mul(1 - 0.01)
        }
      }
    } while (resultFormat && !resultFormat.is_valid_swap_result && loopCount < maxLoop)

    return {
      liquidity: resultFormat.liquidity,
      amount_a: resultFormat.amount_a,
      amount_b: resultFormat.amount_b,
      amount_limit_a: resultFormat.amount_limit_a,
      amount_limit_b: resultFormat.amount_limit_b,
      fixed_liquidity_coin_a: resultFormat.fix_liquidity_amount_a,
      mode: fixedCoinA ? 'OnlyCoinA' : 'OnlyCoinB',
      swap_result: swapResult,
      original_input_amount_a: fixedCoinA ? coin_amount : '0',
      original_input_amount_b: fixedCoinA ? '0' : coin_amount,
    }
  }

  calculateFixedOneSide(options: BaseDepositOptions, mode_options: FixedOneSideOptions): CalculationDepositResult {
    const { tick_lower, tick_upper, current_sqrt_price, slippage } = options
    const { fixed_amount, fixed_coin_a, mode } = mode_options
    // Estimate liquidity and token amounts
    const liquidityInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower,
      tick_upper,
      new BN(fixed_amount),
      fixed_coin_a,
      true,
      slippage,
      new BN(current_sqrt_price)
    )

    return {
      liquidity: liquidityInput.liquidity_amount,
      amount_a: fixed_coin_a ? fixed_amount : liquidityInput.coin_amount_a,
      amount_b: fixed_coin_a ? liquidityInput.coin_amount_b : fixed_amount,
      amount_limit_a: liquidityInput.coin_amount_limit_a,
      fixed_liquidity_coin_a: fixed_coin_a,
      amount_limit_b: liquidityInput.coin_amount_limit_b,
      mode,
      original_input_amount_a: fixed_coin_a ? fixed_amount : '0',
      original_input_amount_b: fixed_coin_a ? '0' : fixed_amount,
    }
  }

  private async calculateSwapAmountByQuantity(
    pool_id: string,
    coin_type_a: string,
    coin_type_b: string,
    lower_tick: number,
    upper_tick: number,
    cur_sqrt_price: string,
    coin_decimal_a: number,
    coin_decimal_b: number,
    amount: string,
    fix_amount_a: boolean,
    max_remain_rate: number,
    mark_price?: string,
    verify_price_loop = 0
  ): Promise<{ swap_amount: string; receive_amount: string; remaining_a: string; remaining_b: string; swap_result?: any }> {
    const { ratio_a, ratio_b } = ClmmPoolUtil.calculateDepositRatio(lower_tick, upper_tick, new BN(cur_sqrt_price))
    console.log('🚀 ~ ratioA:', {
      ratio_a: ratio_a.toString(),
      ratio_b: ratio_b.toString(),
      mark_price,
    })

    const currPrice = TickMath.sqrtPriceX64ToPrice(new BN(cur_sqrt_price), coin_decimal_a, coin_decimal_b)

    const amountFixed = d(fromDecimalsAmount(amount, fix_amount_a ? coin_decimal_a : coin_decimal_b))

    const swapPrice = mark_price ? d(mark_price) : currPrice

    if (fix_amount_a) {
      if (ratio_a.eq(1)) {
        return {
          swap_amount: '0',
          receive_amount: '0',
          remaining_a: amount,
          remaining_b: '0',
        }
      }
      if (ratio_b.eq(1)) {
        return {
          swap_amount: amount,
          receive_amount: toDecimalsAmount(amountFixed.mul(swapPrice).toFixed(coin_decimal_b), coin_decimal_b).toString(),
          remaining_a: '0',
          remaining_b: toDecimalsAmount(amountFixed.mul(swapPrice).toFixed(coin_decimal_b), coin_decimal_b).toString(),
        }
      }
    } else {
      if (ratio_a.eq(1)) {
        return {
          swap_amount: amount,
          receive_amount: toDecimalsAmount(amountFixed.div(swapPrice).toFixed(coin_decimal_a), coin_decimal_a).toString(),
          remaining_a: '0',
          remaining_b: toDecimalsAmount(amountFixed.div(swapPrice).toFixed(coin_decimal_a), coin_decimal_a).toString(),
        }
      }
      if (ratio_b.eq(1)) {
        return {
          swap_amount: '0',
          receive_amount: '0',
          remaining_a: amount,
          remaining_b: '0',
        }
      }
    }

    const maxLoop = 200
    const maxRemainRatio = d(max_remain_rate) // Maximum allowed remaining ratio
    let bestSwapAmount = d(amount).mul(fix_amount_a ? ratio_a : ratio_b)
    console.log('🚀 ~ bestSwapAmount:', bestSwapAmount.toString(), verify_price_loop)

    let receiveAmount = d(0)
    let remainingA
    let remainingB

    let left = d(0)
    let right = d(amount)
    for (let index = 0; index < maxLoop; index++) {
      bestSwapAmount = index === 0 ? bestSwapAmount : left.add(right).div(2)

      if (fix_amount_a) {
        receiveAmount = d(
          toDecimalsAmount(d(fromDecimalsAmount(bestSwapAmount.toString(), coin_decimal_a)).mul(swapPrice).toString(), coin_decimal_b)
        )
        remainingA = d(amount).sub(bestSwapAmount)
        remainingB = receiveAmount
      } else {
        receiveAmount = d(
          toDecimalsAmount(d(fromDecimalsAmount(bestSwapAmount.toString(), coin_decimal_b)).div(swapPrice).toString(), coin_decimal_a)
        )
        remainingA = receiveAmount
        remainingB = d(amount).sub(bestSwapAmount)
      }

      const res = calculateLiquidityAmountEnough(
        remainingA.toFixed(0),
        remainingB.toFixed(0),
        cur_sqrt_price,
        lower_tick,
        upper_tick,
        0,
        fix_amount_a
      )

      if (res.is_enough_amount) {
        const maxRemainAmount = d(fix_amount_a ? remainingB : remainingA).mul(maxRemainRatio)
        // If remaining amount is too much, decrease swapAmount
        if (d(maxRemainAmount).lt(d(res.remain_amount))) {
          right = bestSwapAmount.sub(1)
        } else {
          break
        }
      } else {
        // If not enough, increase swapAmount
        left = bestSwapAmount.add(1)
      }

      if (left.gt(right)) {
        break
      }
    }

    if (bestSwapAmount.lt(1)) {
      return handleMessageError(ZapErrorCode.SwapAmountError, 'bestSwapAmount is less than the minimum precision', {
        [DETAILS_KEYS.METHOD_NAME]: 'calculateSwapAmountByQuantity',
      }) as never
    }

    let swapResult
    let isVerifySwapResult = false

    try {
      swapResult = await this.findRouters(
        pool_id,
        cur_sqrt_price,
        fix_amount_a ? coin_type_a : coin_type_b,
        fix_amount_a ? coin_type_b : coin_type_a,
        bestSwapAmount,
        true,
        fix_amount_a ? coin_decimal_a : coin_decimal_b,
        fix_amount_a ? coin_decimal_b : coin_decimal_a
      )
      const routerPrice = fix_amount_a ? d(swapResult.swap_price) : d(1).div(d(swapResult.swap_price))

      const priceDifference = d(swapResult.swap_out_amount).sub(receiveAmount).div(swapResult.swap_out_amount)

      isVerifySwapResult = priceDifference.abs().lt(d(0.03))

      console.log('🚀 ~ calculateSwapAmountByQuantity ~ priceDifference:', {
        priceDifference,
        receiveAmount,
        swap_in_amount: swapResult.swap_in_amount,
        swap_out_amount: swapResult.swap_out_amount,
        routerPrice,
        swapPrice,
        verify_price_loop,
      })
      // If the calculated amount differs from findRouters actual amount by 5%, recalculate using routerPrice
      if (!isVerifySwapResult && verify_price_loop < 3) {
        return await this.calculateSwapAmountByQuantity(
          pool_id,
          coin_type_a,
          coin_type_b,
          lower_tick,
          upper_tick,
          cur_sqrt_price,
          coin_decimal_a,
          coin_decimal_b,
          amount,
          fix_amount_a,
          max_remain_rate,
          routerPrice.toString(),
          verify_price_loop + 1
        )
      }
    } catch (error) {
      return handleError(ZapErrorCode.AggregatorError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'calculateSwapAmountByQuantity',
      }) as never
    }

    // Use the best result found
    return {
      swap_amount: bestSwapAmount.toFixed(0),
      receive_amount: receiveAmount!.toFixed(0),
      remaining_a: remainingA!.toFixed(0),
      remaining_b: remainingB!.toFixed(0),
      swap_result: isVerifySwapResult ? swapResult : undefined,
    }
  }
}
