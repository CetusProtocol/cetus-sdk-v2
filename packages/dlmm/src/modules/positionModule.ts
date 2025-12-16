import { asUintN, CLOCK_ADDRESS, CoinAssist, d, DETAILS_KEYS, getPackagerConfigs, IModule } from '@cetusprotocol/common-sdk'
import { Transaction, TransactionObjectArgument, TransactionResult } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { DlmmErrorCode, handleError } from '../errors/errors'
import { CetusDlmmSDK } from '../sdk'
import { BASIS_POINT, MAX_BIN_PER_POSITION } from '../types/constants'
import {
  AddLiquidityOption,
  BinAmount,
  BinLiquidityInfo,
  CalculateAddLiquidityAutoFillOption,
  CalculateAddLiquidityOption,
  CalculateRemoveLiquidityBothOption,
  CalculateRemoveLiquidityOnlyOption,
  ClosePositionOption,
  CollectFeeOption,
  CollectRewardAndFeeOption,
  CollectRewardOption,
  DlmmPosition,
  OpenAndAddLiquidityOption,
  OpenAndAddLiquidityWithPriceOption,
  PositionFee,
  PositionReward,
  RemoveLiquidityOption,
  StrategyType,
  UpdatePositionFeeAndRewardsOption,
  ValidateActiveIdSlippageOption,
} from '../types/dlmm'
import {
  BinUtils,
  FeeUtils,
  getRouterModule,
  parsedDlmmPosFeeData,
  parsedDlmmPosRewardData,
  parseDlmmPosition,
  parseStrategyType,
  StrategyUtils,
} from '../utils'
import Decimal from 'decimal.js'

export class PositionModule implements IModule<CetusDlmmSDK> {
  protected _sdk: CetusDlmmSDK

  constructor(sdk: CetusDlmmSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  buildPositionType(): string {
    const package_id = this._sdk.sdkOptions.dlmm_pool.package_id
    return `${package_id}::position::Position`
  }

  async getOwnerPositionList(owner: string): Promise<DlmmPosition[]> {
    const list: DlmmPosition[] = []
    try {
      const res = await this._sdk.FullClient.getOwnedObjectsByPage(owner, {
        options: { showType: true, showContent: true, showOwner: true },
        filter: {
          StructType: this.buildPositionType(),
        },
      })

      res.data.forEach((obj) => {
        list.push(parseDlmmPosition(obj))
      })
    } catch (error) {
      console.log('🚀 ~ PositionModule ~ getOwnerPositionList ~ error:', error)
      handleError(DlmmErrorCode.GetObjectError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getOwnerPositionList',
        [DETAILS_KEYS.REQUEST_PARAMS]: owner,
      })
    }

    return list
  }

  async getPosition(position_id: string): Promise<DlmmPosition> {
    try {
      const res = await this._sdk.FullClient.getObject({ id: position_id, options: { showType: true, showContent: true, showOwner: true } })
      return parseDlmmPosition(res)
    } catch (error) {
      console.log('🚀 ~ PositionModule ~ getPosition ~ error:', error)
      return handleError(DlmmErrorCode.GetObjectError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPosition',
        [DETAILS_KEYS.REQUEST_PARAMS]: position_id,
      })
    }
  }

  /**
   * Collect fee
   * @param option - The option for collecting fee
   * @param tx - The transaction object
   * @returns The transaction object
   */
  collectFeePayload(option: CollectFeeOption, tx?: Transaction): Transaction {
    const { pool_id, position_id, coin_type_a, coin_type_b } = option
    const { dlmm_pool } = this.sdk.sdkOptions
    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)

    tx = tx || new Transaction()

    const [fee_a_balance, fee_b_balance] = tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::collect_position_fee`,
      arguments: [tx.object(pool_id), tx.object(position_id), tx.object(global_config_id), tx.object(versioned_id)],
      typeArguments: [coin_type_a, coin_type_b],
    })

    const fee_a_obj = CoinAssist.fromBalance(fee_a_balance, coin_type_a, tx)
    const fee_b_obj = CoinAssist.fromBalance(fee_b_balance, coin_type_b, tx)
    tx.transferObjects([fee_a_obj, fee_b_obj], this.sdk.getSenderAddress())

    return tx
  }

  /**
   * Update the fee and rewards of the position
   * @param option - The option for updating the fee and rewards of the position
   * @param tx - The transaction object
   * @returns The transaction object
   */
  updatePositionFeeAndRewards(option: UpdatePositionFeeAndRewardsOption, tx: Transaction) {
    const { dlmm_pool } = this.sdk.sdkOptions
    const { versioned_id } = getPackagerConfigs(dlmm_pool)
    const { pool_id, position_id, coin_type_a, coin_type_b } = option
    tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::update_position_fee_and_rewards`,
      arguments: [tx.object(pool_id), tx.pure.id(position_id), tx.object(versioned_id), tx.object(CLOCK_ADDRESS)],
      typeArguments: [coin_type_a, coin_type_b],
    })

    return tx
  }

  /**
   * Collect reward
   * @param options - The option for collecting reward
   * @param tx - The transaction object
   * @returns The transaction object
   */
  collectRewardPayload(options: CollectRewardOption[], tx?: Transaction): Transaction {
    const { dlmm_pool } = this.sdk.sdkOptions
    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)

    tx = tx || new Transaction()

    options.forEach((option) => {
      const { pool_id, position_id, reward_coins, coin_type_a, coin_type_b } = option

      reward_coins.forEach((reward_coin) => {
        const reward_coin_balance = tx.moveCall({
          target: `${dlmm_pool.published_at}::pool::collect_position_reward`,
          arguments: [tx.object(pool_id), tx.object(position_id), tx.object(global_config_id), tx.object(versioned_id)],
          typeArguments: [coin_type_a, coin_type_b, reward_coin],
        })

        const reward_coin_obj = CoinAssist.fromBalance(reward_coin_balance, reward_coin, tx)
        tx.transferObjects([reward_coin_obj], this.sdk.getSenderAddress())
      })
    })

    return tx
  }

  collectRewardAndFeePayload(options: CollectRewardAndFeeOption[], tx?: Transaction): Transaction {
    tx = tx || new Transaction()

    options.forEach((option) => {
      const { pool_id, position_id, reward_coins, coin_type_a, coin_type_b } = option

      this.updatePositionFeeAndRewards({ pool_id, position_id, coin_type_a, coin_type_b }, tx)

      this.collectFeePayload({ pool_id, position_id, coin_type_a, coin_type_b }, tx)
      this.collectRewardPayload([{ pool_id, position_id, reward_coins, coin_type_a, coin_type_b }], tx)
    })

    return tx
  }

  /**
   * Validate the active id slippage
   * @param options - The option for validating the active id slippage
   * @param tx - The transaction object
   * @returns The transaction object
   */
  validateActiveIdSlippage(options: ValidateActiveIdSlippageOption, tx: Transaction): Transaction {
    const { pool_id, active_id, max_price_slippage, bin_step, coin_type_a, coin_type_b } = options
    const { dlmm_router } = this.sdk.sdkOptions

    const bin_shift = BinUtils.getBinShift(active_id, bin_step, max_price_slippage)
    const active_id_u32 = Number(asUintN(BigInt(active_id)))

    tx.moveCall({
      target: `${dlmm_router.published_at}::utils::validate_active_id_slippage`,
      arguments: [
        typeof pool_id === 'string' ? tx.object(pool_id) : pool_id,
        tx.pure.u32(Number(active_id_u32)),
        tx.pure.u32(Number(bin_shift)),
      ],
      typeArguments: [coin_type_a, coin_type_b],
    })

    return tx
  }

  /**
   * Close a position
   * @param option - The option for closing a position
   * @returns The transaction object
   */
  closePositionPayload(option: ClosePositionOption, tx?: Transaction): Transaction {
    tx = tx || new Transaction()
    const { coin_a_obj, coin_b_obj } = this.closePositionNoTransferPayload(option, tx)
    tx.transferObjects([coin_a_obj, coin_b_obj], this.sdk.getSenderAddress())
    return tx
  }

  /**
   * Close a position without transferring the coins to the sender
   * @param option - The option for closing a position
   * @param tx
   * @returns The transaction object
   */
  closePositionNoTransferPayload(
    option: ClosePositionOption,
    tx: Transaction
  ): { coin_a_obj: TransactionObjectArgument; coin_b_obj: TransactionObjectArgument } {
    const { pool_id, position_id, reward_coins, coin_type_a, coin_type_b } = option
    const { dlmm_pool } = this.sdk.sdkOptions
    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)

    tx = tx || new Transaction()

    this.updatePositionFeeAndRewards({ pool_id, position_id, coin_type_a, coin_type_b }, tx)

    this.collectRewardPayload([{ pool_id, position_id, reward_coins, coin_type_a, coin_type_b }], tx)

    const [close_position_cert, coin_a_balance, coin_b_balance] = tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::close_position`,
      arguments: [
        tx.object(pool_id),
        tx.object(position_id),
        tx.object(global_config_id),
        tx.object(versioned_id),
        tx.object(CLOCK_ADDRESS),
      ],
      typeArguments: [coin_type_a, coin_type_b],
    })

    const coin_a_obj = CoinAssist.fromBalance(coin_a_balance, coin_type_a, tx)
    const coin_b_obj = CoinAssist.fromBalance(coin_b_balance, coin_type_b, tx)

    tx.moveCall({
      target: `${dlmm_pool.published_at}::pool::destroy_close_position_cert`,
      arguments: [close_position_cert, tx.object(versioned_id)],
      typeArguments: [],
    })

    return {
      coin_a_obj,
      coin_b_obj,
    }
  }

  /**
   * Get the amounts in the active bin if in range
   * @param bin_manager_handle - The bin manager handle
   * @param lower_bin_id - The lower bin id
   * @param upper_bin_id - The upper bin id
   * @param active_id - The active id
   * @returns The amounts in the active bin if in range
   */
  async getActiveBinIfInRange(
    bin_manager_handle: string,
    lower_bin_id: number,
    upper_bin_id: number,
    active_id: number,
    bin_step: number,
    force_refresh = false
  ): Promise<BinAmount | undefined> {
    if (active_id <= upper_bin_id && active_id >= lower_bin_id) {
      const bin_info = await this._sdk.Pool.getBinInfo(bin_manager_handle, active_id, bin_step, force_refresh)
      return bin_info
    }
    return undefined
  }

  /**
   * Calculate the result of removing liquidity
   * @param option - The option for calculating the result of removing liquidity
   * @returns The result of removing liquidity
   */
  calculateRemoveLiquidityInfo(option: CalculateRemoveLiquidityBothOption | CalculateRemoveLiquidityOnlyOption): BinLiquidityInfo {
    const { bins, active_id, coin_amount } = option
    const isBothSide = 'fix_amount_a' in option

    const bins_b = bins.filter((bin) => bin.bin_id < active_id)
    const bins_a = bins.filter((bin) => bin.bin_id > active_id)

    let total_amount = d(0)
    let amount_rate = d(0)
    let used_bins: BinAmount[] = []

    if (isBothSide) {
      used_bins = [...bins]
      const { fix_amount_a } = option
      const active_bin = bins.find((bin) => bin.bin_id === active_id)
      const total_amount_a = bins_a.reduce((acc, bin) => d(acc).plus(bin.amount_a), d(0)).add(active_bin?.amount_a || '0')
      const total_amount_b = bins_b.reduce((acc, bin) => d(acc).plus(bin.amount_b), d(0)).add(active_bin?.amount_b || '0')
      total_amount = fix_amount_a ? total_amount_a : total_amount_b

      amount_rate = d(coin_amount).gte(total_amount) ? d(1) : d(coin_amount).div(total_amount)
    } else {
      const { is_only_a } = option
      used_bins = is_only_a ? bins_a : bins_b
      total_amount = used_bins.reduce((acc, bin) => d(acc).plus(is_only_a ? bin.amount_a : bin.amount_b), d(0))

      amount_rate = d(coin_amount).gte(total_amount) ? d(1) : d(coin_amount).div(total_amount)
    }

    if (d(total_amount).isZero()) {
      return handleError(DlmmErrorCode.InsufficientLiquidity, new Error('Insufficient liquidity'), {
        [DETAILS_KEYS.METHOD_NAME]: 'calculateRemoveLiquidityResult',
        [DETAILS_KEYS.REQUEST_PARAMS]: option,
      })
    }

    const result_bins = BinUtils.processBinsByRate([...used_bins], amount_rate.toFixed())

    return result_bins
  }

  /**
   * Calculate the result of adding liquidity
   * @param option - The option for calculating the result of adding liquidity
   * @returns The result of adding liquidity
   */
  async calculateAddLiquidityInfo(option: CalculateAddLiquidityOption | CalculateAddLiquidityAutoFillOption): Promise<BinLiquidityInfo> {
    const isAutoFill = 'fix_amount_a' in option
    const { active_id, bin_step, lower_bin_id, upper_bin_id, active_bin_of_pool, strategy_type, pool_id } = option

    let bin_infos
    if (isAutoFill) {
      const { coin_amount, fix_amount_a } = option
      bin_infos = StrategyUtils.autoFillCoinByStrategyV2(
        active_id,
        bin_step,
        coin_amount,
        fix_amount_a,
        lower_bin_id,
        upper_bin_id,
        strategy_type,
        active_bin_of_pool
      )
    } else {
      bin_infos = StrategyUtils.toAmountsBothSideByStrategy(
        active_id,
        bin_step,
        lower_bin_id,
        upper_bin_id,
        option.amount_a,
        option.amount_b,
        strategy_type,
        active_bin_of_pool
      )
    }
    if (active_bin_of_pool && pool_id) {
      const active_bin_index = bin_infos.bins.findIndex((bin) => bin.bin_id === active_id)
      if (active_bin_index !== -1) {
        const pool = await this._sdk.Pool.getPool(pool_id, false)
        if (pool) {
          const { fees_a, fees_b } = FeeUtils.getCompositionFees(
            active_bin_of_pool,
            bin_infos.bins[active_bin_index],
            pool.variable_parameters
          )
          const active_bin = bin_infos.bins[active_bin_index]
          active_bin.amount_a = d(active_bin.amount_a).sub(fees_a).toFixed(0)
          active_bin.amount_b = d(active_bin.amount_b).sub(fees_b).toFixed(0)
          bin_infos.bins[active_bin_index] = active_bin
        }
      }
    }

    return bin_infos
  }

  /**
   * Remove liquidity
   * @param option - The option for removing liquidity
   * @returns The transaction
   */
  removeLiquidityPayload(option: RemoveLiquidityOption): Transaction {
    const tx = new Transaction()
    const { coin_a_obj, coin_b_obj } = this.removeLiquidityNoTransferPayload(option, tx)
    tx.transferObjects([coin_a_obj, coin_b_obj], this.sdk.getSenderAddress())
    return tx
  }

  removeLiquidityNoTransferPayload(
    option: RemoveLiquidityOption,
    tx: Transaction
  ): {
    coin_a_obj: TransactionObjectArgument
    coin_b_obj: TransactionObjectArgument
  } {
    const {
      pool_id,
      position_id,
      bin_infos,
      reward_coins,
      slippage,
      coin_type_a,
      coin_type_b,
      active_id,
      collect_fee,
      bin_step,
      remove_percent,
    } = option
    const { dlmm_pool } = this.sdk.sdkOptions
    const { bins } = bin_infos

    if (collect_fee || reward_coins.length > 0) {
      this.updatePositionFeeAndRewards({ pool_id, position_id, coin_type_a, coin_type_b }, tx)
    }
    if (collect_fee) {
      this.collectFeePayload({ pool_id, position_id, coin_type_a, coin_type_b }, tx)
    }

    this.collectRewardPayload([{ pool_id, position_id, reward_coins, coin_type_a, coin_type_b }], tx)

    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)

    if (remove_percent) {
      const min_bin_id_u32 = asUintN(BigInt(bins[0].bin_id))
      const max_bin_id_u32 = asUintN(BigInt(bins[bins.length - 1].bin_id))
      const remove_percent_fixed = Number(d(remove_percent).mul(BASIS_POINT).toFixed(0))
      const [coin_a_balance, coin_b_balance] = tx.moveCall({
        target: `${dlmm_pool.published_at}::pool::remove_liquidity_by_percent`,
        arguments: [
          tx.object(pool_id),
          tx.object(position_id),
          tx.pure.u32(Number(min_bin_id_u32)),
          tx.pure.u32(Number(max_bin_id_u32)),
          tx.pure.u16(remove_percent_fixed),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
      const coin_a_obj = CoinAssist.fromBalance(coin_a_balance, coin_type_a, tx)
      const coin_b_obj = CoinAssist.fromBalance(coin_b_balance, coin_type_b, tx)

      this.validateActiveIdSlippage({ pool_id, active_id, max_price_slippage: slippage, bin_step, coin_type_a, coin_type_b }, tx)

      return {
        coin_a_obj,
        coin_b_obj,
      }
    } else {
      const bin_amounts = tx.pure.vector(
        'u32',
        bins.map((bin) => Number(asUintN(BigInt(bin.bin_id))))
      )
      const remove_liquiditys = tx.pure.vector(
        'u128',
        bins.map((bin) => bin.liquidity!)
      )

      const [coin_a_balance, coin_b_balance] = tx.moveCall({
        target: `${dlmm_pool.published_at}::pool::remove_liquidity`,
        arguments: [
          tx.object(pool_id),
          tx.object(position_id),
          bin_amounts,
          remove_liquiditys,
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })

      this.validateActiveIdSlippage({ pool_id, active_id, max_price_slippage: slippage, bin_step, coin_type_a, coin_type_b }, tx)

      const coin_a_obj = CoinAssist.fromBalance(coin_a_balance, coin_type_a, tx)
      const coin_b_obj = CoinAssist.fromBalance(coin_b_balance, coin_type_b, tx)

      return {
        coin_a_obj,
        coin_b_obj,
      }
    }
  }

  /**
   * Add liquidity with price
   * @param option - The option for adding liquidity with price
   * @returns The transaction
   */
  async addLiquidityWithPricePayload(option: OpenAndAddLiquidityWithPriceOption): Promise<Transaction> {
    const {
      pool_id,
      bin_infos,
      coin_type_a,
      coin_type_b,
      price_base_coin,
      price,
      lower_price,
      upper_price,
      bin_step,
      strategy_type,
      active_bin_of_pool,
      decimals_a,
      decimals_b,
      use_bin_infos,
      max_price_slippage,
    } = option
    let lower_bin_id
    let upper_bin_id
    let active_id
    let new_bin_infos: BinLiquidityInfo = bin_infos

    const is_coin_a_base = price_base_coin === 'coin_a'

    if (is_coin_a_base) {
      lower_bin_id = BinUtils.getBinIdFromPrice(lower_price, bin_step, false, decimals_a, decimals_b)
      upper_bin_id = BinUtils.getBinIdFromPrice(upper_price, bin_step, true, decimals_a, decimals_b)
      active_id = BinUtils.getBinIdFromPrice(price, bin_step, true, decimals_a, decimals_b)
    } else {
      lower_bin_id = BinUtils.getBinIdFromPrice(d(1).div(upper_price).toString(), bin_step, false, decimals_a, decimals_b)
      upper_bin_id = BinUtils.getBinIdFromPrice(d(1).div(lower_price).toString(), bin_step, true, decimals_a, decimals_b)
      active_id = BinUtils.getBinIdFromPrice(d(1).div(price).toString(), bin_step, false, decimals_a, decimals_b)

      const calculateOption: CalculateAddLiquidityOption = {
        amount_a: bin_infos.amount_b,
        amount_b: bin_infos.amount_a,
        active_id,
        bin_step,
        lower_bin_id,
        upper_bin_id,
        active_bin_of_pool,
        strategy_type: strategy_type,
      }

      new_bin_infos = await this.sdk.Position.calculateAddLiquidityInfo(calculateOption)
    }

    const openAndAddLiquidityOption: OpenAndAddLiquidityOption = {
      pool_id,
      active_id,
      bin_infos: new_bin_infos,
      coin_type_a,
      coin_type_b,
      lower_bin_id,
      upper_bin_id,
      strategy_type,
      use_bin_infos,
      max_price_slippage,
      bin_step,
    }

    return this.addLiquidityPayload(openAndAddLiquidityOption)
  }

  /**
   * Add liquidity
   * @param option - The option for adding liquidity
   * @returns The transaction object
   */
  addLiquidityPayload(option: AddLiquidityOption | OpenAndAddLiquidityOption, tx?: Transaction): Transaction {
    const {
      pool_id,
      bin_infos,
      coin_type_a,
      coin_type_b,
      active_id,
      strategy_type,
      max_price_slippage,
      bin_step,
      use_bin_infos = false,
      coin_object_id_a,
      coin_object_id_b,
    } = option
    tx = tx || new Transaction()

    const isOpenPosition = 'lower_bin_id' in option

    const liquidity_bins: BinLiquidityInfo[] = []

    if (isOpenPosition) {
      const position_bins = BinUtils.splitBinLiquidityInfo(bin_infos, option.lower_bin_id, option.upper_bin_id)
      liquidity_bins.push(...position_bins)
    } else {
      const position_id = option.position_id
      liquidity_bins.push(bin_infos)

      if (option.collect_fee || option.reward_coins.length > 0) {
        this.updatePositionFeeAndRewards({ pool_id: pool_id as string, position_id, coin_type_a, coin_type_b }, tx)
      }

      if (option.collect_fee) {
        this.collectFeePayload({ pool_id: pool_id as string, position_id, coin_type_a, coin_type_b }, tx)
      }

      if (option.reward_coins.length > 0) {
        this.collectRewardPayload(
          [{ pool_id: pool_id as string, position_id, reward_coins: option.reward_coins, coin_type_a, coin_type_b }],
          tx
        )
      }
    }

    liquidity_bins.forEach((liquidity_bin, index) => {
      console.log('🚀 ~ PositionModule ~ addLiquidityPayload ~ liquidity_bin:', index, liquidity_bin)
      const { amount_a, amount_b, bins } = liquidity_bin

      const coin_a_obj_id = coin_object_id_a ? coin_object_id_a : CoinAssist.buildCoinWithBalance(BigInt(amount_a), coin_type_a, tx)
      const coin_b_obj_id = coin_object_id_b ? coin_object_id_b : CoinAssist.buildCoinWithBalance(BigInt(amount_b), coin_type_b, tx)

      if (use_bin_infos) {
        this.addLiquidityInternal({
          pool_id,
          coin_type_a,
          coin_type_b,
          active_id,
          liquidity_bin,
          tx,
          coin_a_obj_id,
          coin_b_obj_id,
          position_id: isOpenPosition ? undefined : option.position_id,
          max_price_slippage,
          bin_step,
        })
      } else {
        this.addLiquidityStrategyInternal({
          pool_id,
          coin_type_a,
          coin_type_b,
          active_id,
          liquidity_bin,
          tx,
          max_price_slippage,
          bin_step,
          coin_a_obj_id,
          coin_b_obj_id,
          strategy_type,
          position_id: isOpenPosition ? undefined : option.position_id,
        })
      }
    })

    return tx
  }

  private addLiquidityStrategyInternal(option: {
    pool_id: string | TransactionObjectArgument
    coin_type_a: string
    coin_type_b: string
    active_id: number
    liquidity_bin: BinLiquidityInfo
    tx: Transaction
    coin_a_obj_id: TransactionObjectArgument
    coin_b_obj_id: TransactionObjectArgument
    position_id?: string
    strategy_type: StrategyType
    max_price_slippage: number
    bin_step: number
  }): Transaction {
    const {
      max_price_slippage,
      bin_step,
      position_id,
      pool_id,
      coin_type_a,
      coin_type_b,
      active_id,
      liquidity_bin,
      tx,
      coin_a_obj_id,
      coin_b_obj_id,
      strategy_type,
    } = option

    const { dlmm_pool, dlmm_router } = this.sdk.sdkOptions
    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)

    const { bins, amount_a, amount_b } = liquidity_bin

    let position: string | undefined | TransactionObjectArgument = position_id

    const lower_bin_id = bins[0].bin_id
    const upper_bin_id = bins[bins.length - 1].bin_id
    const lower_bin_id_u32 = asUintN(BigInt(lower_bin_id))

    const active_id_u32 = Number(asUintN(BigInt(active_id)))
    const bin_shift = BinUtils.getBinShift(active_id, bin_step, max_price_slippage)
    const routerModule = getRouterModule(strategy_type)

    if (position_id === undefined) {
      const width = upper_bin_id - lower_bin_id + 1
      if (width > MAX_BIN_PER_POSITION) {
        handleError(DlmmErrorCode.InvalidBinWidth, new Error('Width is too large'), {
          [DETAILS_KEYS.METHOD_NAME]: 'openPosition',
        })
      }

      position = tx.moveCall({
        target: `${dlmm_router.published_at}::${routerModule}::open_position`,
        arguments: [
          typeof pool_id === 'string' ? tx.object(pool_id) : pool_id,
          coin_a_obj_id,
          coin_b_obj_id,
          tx.pure.u64(amount_a),
          tx.pure.u64(amount_b),
          tx.pure.u32(Number(lower_bin_id_u32)),
          tx.pure.u16(Number(width)),
          tx.pure.u32(Number(active_id_u32)),
          tx.pure.u32(Number(bin_shift)),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
    } else {
      const valid_bins = bins.filter((bin) => bin.amount_a !== '0' || bin.amount_b !== '0')
      if (valid_bins.length === 0) {
        return handleError(DlmmErrorCode.InvalidParams, new Error('No bins to add liquidity'), {
          [DETAILS_KEYS.METHOD_NAME]: 'addLiquidityStrategyInternal',
          [DETAILS_KEYS.REQUEST_PARAMS]: option,
        })
      }
      const valid_lower_bin_id_u32 = asUintN(BigInt(valid_bins[0].bin_id))
      const valid_upper_bin_id_u32 = asUintN(BigInt(valid_bins[valid_bins.length - 1].bin_id))

      tx.moveCall({
        target: `${dlmm_router.published_at}::${routerModule}::add_liquidity`,
        arguments: [
          typeof pool_id === 'string' ? tx.object(pool_id) : pool_id,
          tx.object(position_id!),
          coin_a_obj_id,
          coin_b_obj_id,
          tx.pure.u64(amount_a),
          tx.pure.u64(amount_b),
          tx.pure.u32(Number(valid_lower_bin_id_u32)),
          tx.pure.u32(Number(valid_upper_bin_id_u32)),
          tx.pure.u32(Number(active_id_u32)),
          tx.pure.u32(Number(bin_shift)),
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
    }

    if (position) {
      tx.transferObjects([position, coin_a_obj_id, coin_b_obj_id], this.sdk.getSenderAddress())
    } else {
      tx.transferObjects([coin_a_obj_id, coin_b_obj_id], this.sdk.getSenderAddress())
    }

    return tx
  }

  private addLiquidityInternal(option: {
    pool_id: string | TransactionObjectArgument
    coin_type_a: string
    coin_type_b: string
    active_id: number
    liquidity_bin: BinLiquidityInfo
    tx: Transaction
    coin_a_obj_id: TransactionObjectArgument
    coin_b_obj_id: TransactionObjectArgument
    position_id?: string
    max_price_slippage: number
    bin_step: number
  }): Transaction {
    const {
      position_id,
      pool_id,
      coin_type_a,
      coin_type_b,
      active_id,
      liquidity_bin,
      tx,
      coin_a_obj_id,
      coin_b_obj_id,
      max_price_slippage,
      bin_step,
    } = option
    const { bins } = liquidity_bin

    const { dlmm_pool, dlmm_router } = this.sdk.sdkOptions
    const { versioned_id, global_config_id } = getPackagerConfigs(dlmm_pool)
    const amounts_a = tx.pure.vector(
      'u64',
      bins.map((bin) => bin.amount_a)
    )
    const amounts_b = tx.pure.vector(
      'u64',
      bins.map((bin) => bin.amount_b)
    )

    const bin_ids = tx.makeMoveVec({
      elements: bins.map((bin) => tx.pure.u32(Number(asUintN(BigInt(bin.bin_id))))),
      type: 'u32',
    })
    const lower_bin_id = liquidity_bin.bins[0].bin_id
    const upper_bin_id = liquidity_bin.bins[liquidity_bin.bins.length - 1].bin_id
    if (position_id === undefined) {
      const width = upper_bin_id - lower_bin_id + 1
      if (width > MAX_BIN_PER_POSITION) {
        handleError(DlmmErrorCode.InvalidBinWidth, new Error('Width is too large'), {
          [DETAILS_KEYS.METHOD_NAME]: 'openPosition',
        })
      }
      const open_position_id = tx.moveCall({
        target: `${dlmm_router.published_at}::add_liquidity::open_position`,
        arguments: [
          typeof pool_id === 'string' ? tx.object(pool_id) : pool_id,
          coin_a_obj_id,
          coin_b_obj_id,
          bin_ids,
          amounts_a,
          amounts_b,
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
      // validate the active id slippage
      if (active_id >= lower_bin_id && active_id <= upper_bin_id) {
        this.validateActiveIdSlippage({ pool_id, active_id, max_price_slippage, bin_step, coin_type_a, coin_type_b }, tx)
      }
      tx.transferObjects([coin_a_obj_id, coin_b_obj_id, open_position_id], this.sdk.getSenderAddress())
    } else {
      tx.moveCall({
        target: `${dlmm_router.published_at}::add_liquidity::add_liquidity`,
        arguments: [
          typeof pool_id === 'string' ? tx.object(pool_id) : pool_id,
          tx.object(position_id!),
          coin_a_obj_id,
          coin_b_obj_id,
          bin_ids,
          amounts_a,
          amounts_b,
          tx.object(global_config_id),
          tx.object(versioned_id),
          tx.object(CLOCK_ADDRESS),
        ],
        typeArguments: [coin_type_a, coin_type_b],
      })
      // validate the active id slippage
      if (active_id >= lower_bin_id && active_id <= upper_bin_id) {
        this.validateActiveIdSlippage({ pool_id, active_id, max_price_slippage, bin_step, coin_type_a, coin_type_b }, tx)
      }
      tx.transferObjects([coin_a_obj_id, coin_b_obj_id], this.sdk.getSenderAddress())
    }

    return tx
  }

  /**
   * Fetch the fee and reward of the position
   * @param options - The option for fetching the fee and reward of the position
   * @returns The fee and reward of the position
   */
  async fetchPositionFeeAndReward(
    options: CollectRewardAndFeeOption[]
  ): Promise<{ feeData: Record<string, PositionFee>; rewardData: Record<string, PositionReward> }> {
    const tx = new Transaction()
    this.collectRewardAndFeePayload(options, tx)

    const simulateRes = await this.sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: normalizeSuiAddress('0x0'),
    })

    if (simulateRes.error != null) {
      return handleError(DlmmErrorCode.FetchError, new Error(simulateRes.error), {
        [DETAILS_KEYS.METHOD_NAME]: 'fetchPositionFeeAndReward',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          options,
          totalOptions: options.length,
        },
      })
    }

    const feeData = parsedDlmmPosFeeData(simulateRes)
    const rewardData = parsedDlmmPosRewardData(simulateRes)

    return {
      feeData,
      rewardData,
    }
  }
}
