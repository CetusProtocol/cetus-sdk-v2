import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import { coinWithBalance } from '@mysten/sui/transactions'
import { CommonErrorCode, handleMessageError } from '../errors/errors'
import type { BuildCoinResult, CoinAsset, CoinInputInterval, MultiCoinInput } from '../type/clmm'
import type { SuiAddressType } from '../type/sui'
import { extractStructTagFromType, normalizeCoinType } from './contracts'
import { d } from './numbers'

export const DEFAULT_GAS_BUDGET_FOR_SPLIT = 1000
export const DEFAULT_GAS_BUDGET_FOR_MERGE = 500
export const DEFAULT_GAS_BUDGET_FOR_TRANSFER = 100
export const DEFAULT_GAS_BUDGET_FOR_TRANSFER_SUI = 100
export const DEFAULT_GAS_BUDGET_FOR_STAKE = 1000
export const GAS_TYPE_ARG = '0x2::sui::SUI'
export const GAS_TYPE_ARG_LONG = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
export const GAS_SYMBOL = 'SUI'
export const DEFAULT_NFT_TRANSFER_GAS_FEE = 450
export const SUI_SYSTEM_STATE_OBJECT_ID = '0x0000000000000000000000000000000000000005'
/**
 * This class provides helper methods for working with coins.
 */
export class CoinAssist {
  /**
   * Get the total balance of a list of CoinAsset objects for a given coin address.
   *
   * @param objs The list of CoinAsset objects to get the total balance for.
   * @param coin_address The coin address to get the total balance for.
   * @returns The total balance of the CoinAsset objects for the given coin address.
   */
  public static totalBalance(objs: CoinAsset[], coin_address: SuiAddressType): bigint {
    let balance_total = BigInt(0)
    objs.forEach((obj) => {
      if (coin_address === obj.coin_type) {
        balance_total += BigInt(obj.balance)
      }
    })
    return balance_total
  }

  /**
   * Get the CoinAsset objects for a given coin type.
   *
   * @param coin_type The coin type to get the CoinAsset objects for.
   * @param all_sui_objects The list of all SuiMoveObjects.
   * @returns The CoinAsset objects for the given coin type.
   */
  public static getCoinAssets(coin_type: string, all_sui_objects: CoinAsset[]): CoinAsset[] {
    const coins: CoinAsset[] = []
    all_sui_objects.forEach((an_obj) => {
      if (normalizeCoinType(an_obj.coin_type) === normalizeCoinType(coin_type)) {
        coins.push(an_obj)
      }
    })
    return coins
  }

  /**
   * Get whether a coin address is a SUI coin.
   *
   * @param coin_address The coin address to check.
   * @returns Whether the coin address is a SUI coin.
   */
  public static isSuiCoin(coin_address: SuiAddressType) {
    return extractStructTagFromType(coin_address).full_address === GAS_TYPE_ARG
  }

  /**
   * Select the CoinAsset objects from a list of CoinAsset objects that have a balance greater than or equal to a given amount.
   *
   * @param coins The list of CoinAsset objects to select from.
   * @param amount The amount to select CoinAsset objects with a balance greater than or equal to.
   * @param exclude A list of CoinAsset objects to exclude from the selection.
   * @returns The CoinAsset objects that have a balance greater than or equal to the given amount.
   */
  static selectCoinObjectIdGreaterThanOrEqual(
    coins: CoinAsset[],
    amount: bigint,
    exclude: string[] = []
  ): { object_array: string[]; remain_coins: CoinAsset[]; amount_array: string[] } {
    const selected_result = CoinAssist.selectCoinAssetGreaterThanOrEqual(coins, amount, exclude)
    const object_array = selected_result.selected_coins.map((item) => item.coin_object_id)
    const remain_coins = selected_result.remain_coins
    const amount_array = selected_result.selected_coins.map((item) => item.balance.toString())
    return { object_array, remain_coins, amount_array }
  }

  /**
   * Select the CoinAsset objects from a list of CoinAsset objects that have a balance greater than or equal to a given amount.
   *
   * @param coins The list of CoinAsset objects to select from.
   * @param amount The amount to select CoinAsset objects with a balance greater than or equal to.
   * @param exclude A list of CoinAsset objects to exclude from the selection.
   * @returns The CoinAsset objects that have a balance greater than or equal to the given amount.
   */
  static selectCoinAssetGreaterThanOrEqual(
    coins: CoinAsset[],
    amount: bigint,
    exclude: string[] = []
  ): { selected_coins: CoinAsset[]; remain_coins: CoinAsset[] } {
    const sorted_coins = CoinAssist.sortByBalance(coins.filter((c) => !exclude.includes(c.coin_object_id)))

    const total = CoinAssist.calculateTotalBalance(sorted_coins)

    if (total < amount) {
      return { selected_coins: [], remain_coins: sorted_coins }
    }
    if (total === amount) {
      return { selected_coins: sorted_coins, remain_coins: [] }
    }

    let sum = BigInt(0)
    const selectedCoins = []
    const remainingCoins = [...sorted_coins]
    while (sum < total) {
      const target = amount - sum
      const coinWithSmallestSufficientBalanceIndex = remainingCoins.findIndex((c) => c.balance >= target)
      if (coinWithSmallestSufficientBalanceIndex !== -1) {
        selectedCoins.push(remainingCoins[coinWithSmallestSufficientBalanceIndex])
        remainingCoins.splice(coinWithSmallestSufficientBalanceIndex, 1)
        break
      }

      const coinWithLargestBalance = remainingCoins.pop()!
      if (coinWithLargestBalance.balance > 0) {
        selectedCoins.push(coinWithLargestBalance)
        sum += coinWithLargestBalance.balance
      }
    }
    return {
      selected_coins: CoinAssist.sortByBalance(selectedCoins),
      remain_coins: CoinAssist.sortByBalance(remainingCoins),
    }
  }

  /**
   * Sort the CoinAsset objects by their balance.
   *
   * @param coins The CoinAsset objects to sort.
   * @returns The sorted CoinAsset objects.
   */
  static sortByBalance(coins: CoinAsset[]): CoinAsset[] {
    return coins.sort((a, b) => (a.balance < b.balance ? -1 : a.balance > b.balance ? 1 : 0))
  }

  static sortByBalanceDes(coins: CoinAsset[]): CoinAsset[] {
    return coins.sort((a, b) => (a.balance > b.balance ? -1 : a.balance < b.balance ? 0 : 1))
  }

  /**
   * Calculate the total balance of a list of CoinAsset objects.
   *
   * @param coins The list of CoinAsset objects to calculate the total balance for.
   * @returns The total balance of the CoinAsset objects.
   */
  static calculateTotalBalance(coins: CoinAsset[]): bigint {
    return coins.reduce((partialSum, c) => partialSum + c.balance, BigInt(0))
  }

  public static buildCoinForAmount(
    tx: Transaction,
    all_coins: CoinAsset[],
    amount: bigint,
    coin_type: string,
    build_vector = true,
    fix_amount = true
  ): BuildCoinResult {
    const coin_assets: CoinAsset[] = CoinAssist.getCoinAssets(coin_type, all_coins)
    // mint zero coin
    if (amount === BigInt(0)) {
      return this.buildZeroValueCoin(all_coins, tx, coin_type, build_vector)
    }
    const amount_total = CoinAssist.calculateTotalBalance(coin_assets)
    if (amount_total < amount) {
      throw new Error(`The amount(${amount_total}) is Insufficient balance for ${coin_type} , expect ${amount} `)
    }

    return this.buildCoin(tx, all_coins, coin_assets, amount, coin_type, build_vector, fix_amount)
  }

  public static buildCoinWithBalance(amount: bigint, coin_type: string, tx: Transaction): TransactionObjectArgument {
    if (amount === BigInt(0)) {
      if (CoinAssist.isSuiCoin(coin_type)) {
        return tx.add(coinWithBalance({ balance: amount, useGasCoin: false }))
      }
    }

    return tx.add(coinWithBalance({ balance: amount, type: coin_type }))
  }

  private static buildVectorCoin(
    tx: Transaction,
    all_coins: CoinAsset[],
    coin_assets: CoinAsset[],
    amount: bigint,
    coin_type: string,
    fix_amount = true
  ): BuildCoinResult {
    if (CoinAssist.isSuiCoin(coin_type)) {
      const amount_coin = tx.splitCoins(tx.gas, [tx.pure.u64(amount)])
      return {
        selected_coins: [],
        target_coin: amount_coin,
        remain_coins: all_coins,
        target_coin_amount: amount.toString(),
        is_mint_zero_coin: false,
        original_spited_coin: tx.gas,
      }
    }

    const { original_spited_coin, target_coin, target_coin_amount, remain_coins, selected_coins } = this.buildSpitTargeCoin(
      tx,
      amount,
      coin_assets,
      fix_amount
    )

    if (fix_amount) {
      return {
        target_coin: tx.makeMoveVec({ elements: [target_coin] }),
        selected_coins: selected_coins,
        remain_coins: remain_coins,
        target_coin_amount: target_coin_amount,
        is_mint_zero_coin: false,
        original_spited_coin: original_spited_coin,
      }
    }

    return {
      selected_coins: selected_coins,
      target_coin: tx.makeMoveVec({ elements: selected_coins.map((id) => tx.object(id)) }),
      remain_coins: remain_coins,
      target_coin_amount,
      is_mint_zero_coin: false,
    }
  }

  private static buildOneCoin(
    tx: Transaction,
    coin_assets: CoinAsset[],
    amount: bigint,
    coin_type: string,
    fix_amount = true
  ): BuildCoinResult {
    if (CoinAssist.isSuiCoin(coin_type)) {
      if (amount === 0n && coin_assets.length > 1) {
        const selected_coins_result = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(coin_assets, amount)

        return {
          selected_coins: selected_coins_result.object_array,
          target_coin: tx.object(selected_coins_result.object_array[0]),
          remain_coins: selected_coins_result.remain_coins,
          target_coin_amount: selected_coins_result.amount_array[0],
          is_mint_zero_coin: false,
        }
      }
      const selected_coins_result = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(coin_assets, amount)
      const amount_coin = tx.splitCoins(tx.gas, [tx.pure.u64(amount)])

      return {
        selected_coins: [],
        target_coin: amount_coin,
        remain_coins: selected_coins_result.remain_coins,
        target_coin_amount: amount.toString(),
        is_mint_zero_coin: false,
        original_spited_coin: tx.gas,
      }
    }

    return this.buildSpitTargeCoin(tx, amount, coin_assets, fix_amount)
  }

  private static buildSpitTargeCoin(tx: Transaction, amount: bigint, coin_assets: CoinAsset[], fix_amount: boolean): BuildCoinResult {
    const selected_coins_result = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(coin_assets, amount)
    const total_selected_coin_amount = selected_coins_result.amount_array.reduce((a, b) => Number(a) + Number(b), 0).toString()
    const coin_object_ids = selected_coins_result.object_array

    const [primary_coin_a, ...merge_coin_as] = coin_object_ids
    const primary_coin_a_object = tx.object(primary_coin_a)

    let target_coin: any = primary_coin_a_object
    const target_coin_amount = selected_coins_result.amount_array.reduce((a, b) => Number(a) + Number(b), 0).toString()
    let original_spited_coin
    if (merge_coin_as.length > 0) {
      tx.mergeCoins(
        primary_coin_a_object,
        merge_coin_as.map((coin) => tx.object(coin))
      )
    }

    if (fix_amount && Number(total_selected_coin_amount) > Number(amount)) {
      target_coin = tx.splitCoins(primary_coin_a_object, [tx.pure.u64(amount)])
      original_spited_coin = primary_coin_a_object
    }

    return {
      original_spited_coin: original_spited_coin,
      target_coin: target_coin,
      target_coin_amount: target_coin_amount,
      remain_coins: selected_coins_result.remain_coins,
      selected_coins: selected_coins_result.object_array,
      is_mint_zero_coin: false,
    }
  }

  private static buildCoin(
    tx: Transaction,
    all_coins: CoinAsset[],
    coin_assets: CoinAsset[],
    amount: bigint,
    coin_type: string,
    build_vector = true,
    fix_amount = true
  ): BuildCoinResult {
    if (build_vector) {
      return this.buildVectorCoin(tx, all_coins, coin_assets, amount, coin_type, fix_amount)
    }

    return this.buildOneCoin(tx, coin_assets, amount, coin_type, fix_amount)
  }

  private static buildZeroValueCoin(all_coins: CoinAsset[], tx: Transaction, coin_type: string, build_vector = true): BuildCoinResult {
    const zero_coin = this.callMintZeroValueCoin(tx, coin_type)
    let target_coin: any
    if (build_vector) {
      target_coin = tx.makeMoveVec({ elements: [zero_coin] })
    } else {
      target_coin = zero_coin
    }

    return {
      target_coin: target_coin,
      remain_coins: all_coins,
      selected_coins: [],
      is_mint_zero_coin: true,
      target_coin_amount: '0',
    }
  }

  public static buildCoinForAmountInterval(
    tx: Transaction,
    all_coins: CoinAsset[],
    amounts: CoinInputInterval,
    coin_type: string,
    build_vector = true,
    fix_amount = true
  ): BuildCoinResult {
    const coin_assets: CoinAsset[] = CoinAssist.getCoinAssets(coin_type, all_coins)
    if (amounts.amount_first === BigInt(0)) {
      if (coin_assets.length > 0) {
        return this.buildCoin(tx, [...all_coins], [...coin_assets], amounts.amount_first, coin_type, build_vector, fix_amount)
      }
      return this.buildZeroValueCoin(all_coins, tx, coin_type, build_vector)
    }

    const amount_total = CoinAssist.calculateTotalBalance(coin_assets)

    if (amount_total >= amounts.amount_first) {
      return this.buildCoin(tx, [...all_coins], [...coin_assets], amounts.amount_first, coin_type, build_vector, fix_amount)
    }

    if (amount_total < amounts.amount_second) {
      throw new Error(`The amount(${amount_total}) is Insufficient balance for ${coin_type} , expect ${amounts.amount_second} `)
    }

    return this.buildCoin(tx, [...all_coins], [...coin_assets], amounts.amount_second, coin_type, build_vector, fix_amount)
  }

  public static callMintZeroValueCoin = (txb: Transaction, coin_type: string) => {
    return txb.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [coin_type],
    })
  }

  public static fromBalance(balance: TransactionObjectArgument, coin_type: string, tx: Transaction): TransactionObjectArgument {
    const coin = tx.moveCall({
      target: `0x2::coin::from_balance`,
      typeArguments: [coin_type],
      arguments: [balance],
    })

    return coin
  }

  public static intoBalance(coin_obj: TransactionObjectArgument | string, coin_type: string, tx: Transaction): TransactionObjectArgument {
    const coin = tx.moveCall({
      target: `0x2::coin::into_balance`,
      typeArguments: [coin_type],
      arguments: [typeof coin_obj === 'string' ? tx.object(coin_obj) : coin_obj],
    })

    return coin
  }

  public static mintBalanceZero(coin_type: string, tx: Transaction): TransactionObjectArgument {
    const coin = tx.moveCall({
      target: `0x2::balance::zero`,
      typeArguments: [coin_type],
      arguments: [],
    })

    return coin
  }

  public static destroyBalanceZero(balance: TransactionObjectArgument, coin_type: string, tx: Transaction): TransactionObjectArgument {
    const coin = tx.moveCall({
      target: `0x2::balance::destroy_zero`,
      typeArguments: [coin_type],
      arguments: [balance],
    })

    return coin
  }

  public static getCoinAmountObjId(coin_input: MultiCoinInput, amount: string): TransactionObjectArgument {
    const coin_obj = coin_input.amount_coin_array.find((coin) => {
      if (!coin.used && d(coin.amount).eq(amount)) {
        coin.used = true
        return true
      }
      return false
    })
    if (!coin_obj) {
      return handleMessageError(CommonErrorCode.CoinNotFound, `Coin not found for ${amount} ${coin_input.coin_type}`)
    }
    return coin_obj.coin_object_id
  }

  public static buildMultiCoinInput(
    tx: Transaction,
    all_coin_assets: CoinAsset[],
    coin_type: string,
    amount_arr: bigint[]
  ): MultiCoinInput {
    const coin_assets = CoinAssist.getCoinAssets(coin_type, all_coin_assets)
    if (CoinAssist.isSuiCoin(coin_type)) {
      const amount_coins = tx.splitCoins(
        tx.gas,
        amount_arr.map((amount) => tx.pure.u64(amount))
      )

      const amount_coin_array = amount_arr.map((amount, index) => {
        return {
          coin_object_id: amount_coins[index],
          amount: amount.toString(),
          used: false,
        }
      })

      return {
        amount_coin_array: amount_coin_array,
        coin_type: coin_type,
        remain_coins: coin_assets,
      }
    }
    const total_amount = amount_arr.reduce((acc, curr) => acc + curr, BigInt(0))
    const selected_coins_result = CoinAssist.selectCoinObjectIdGreaterThanOrEqual(coin_assets, total_amount)
    if (selected_coins_result.object_array.length === 0) {
      return handleMessageError(
        CommonErrorCode.InsufficientBalance,
        `No enough coins for ${coin_type} expect ${total_amount} actual ${CoinAssist.calculateTotalBalance(coin_assets)}`
      )
    }
    const [target_coin, ...other_coins] = selected_coins_result.object_array
    if (other_coins.length > 0) {
      tx.mergeCoins(target_coin, [...other_coins])
    }

    const amount_coins = tx.splitCoins(
      target_coin,
      amount_arr.map((amount) => tx.pure.u64(amount))
    )

    const amount_coin_array = amount_arr.map((amount, index) => {
      return {
        coin_object_id: amount_coins[index],
        amount: amount.toString(),
        used: false,
      }
    })

    return {
      amount_coin_array: amount_coin_array,
      remain_coins: selected_coins_result.remain_coins,
      coin_type: coin_type,
    }
  }
}
