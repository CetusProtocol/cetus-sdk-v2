import { SuiObjectResponse, CoinBalance } from '@mysten/sui/client'
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import BN from 'bn.js'
import {
  asIntN,
  ClmmPoolUtil,
  CoinAssist,
  d,
  DETAILS_KEYS,
  extractStructTagFromType,
  fixCoinType,
  GAS_TYPE_ARG,
  getObjectFields,
  getObjectType,
  TickMath,
} from '@cetusprotocol/common-sdk'
import { FarmsPositionNFT } from '@cetusprotocol/farms-sdk'
import Decimal from 'decimal.js'
import { handleMessageError, VaultsErrorCode } from '../errors/errors'
import { CetusVaultsSDK } from '../sdk'
import { PROTOCOL_FEE_DENOMINATOR, Vault, VaultStatus } from '../types/vaults'
import { Pool, Position } from '@cetusprotocol/sui-clmm-sdk'
import { VaultsPosition, VaultsVestInfo, VaultVestNFT } from '../types/vest'

export class VaultsUtils {
  static calculatePositionShare(
    tick_lower: number,
    tick_upper: number,
    liquidity: string,
    price: string,
    effective_tick_lower: number,
    effective_tick_upper: number,
    current_sqrt_price: string
  ): string {
    if (tick_upper <= effective_tick_lower || tick_lower >= effective_tick_upper) {
      return '0'
    }
    let valid_tick_lower = 0
    if (tick_lower < effective_tick_lower) {
      valid_tick_lower = effective_tick_lower
    } else {
      valid_tick_lower = tick_lower
    }

    let valid_tick_upper = 0
    if (tick_upper < effective_tick_upper) {
      valid_tick_upper = tick_upper
    } else {
      valid_tick_upper = effective_tick_upper
    }

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(valid_tick_lower)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(valid_tick_upper)

    const { coin_amount_a, coin_amount_b } = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(liquidity),
      new BN(current_sqrt_price),
      lowerSqrtPrice,
      upperSqrtPrice,
      true
    )

    return d(coin_amount_a).mul(price).div(1000000000000).add(coin_amount_b).toString()
  }

  static generateNextTickRange(curr_index: number, span: number, tick_spacing: number) {
    const lower_index = curr_index - span / 2
    const upper_index = curr_index + span / 2

    return {
      new_tick_lower: VaultsUtils.getValidTickIndex(lower_index, tick_spacing),
      new_tick_upper: VaultsUtils.getValidTickIndex(upper_index, tick_spacing),
    }
  }

  static getValidTickIndex(tick_index: number, tick_spacing: number): number {
    if (tick_index % tick_spacing === 0) {
      return tick_index
    }

    let res: number
    if (tick_index > 0) {
      res = tick_index - (tick_index % tick_spacing) + tick_spacing
    } else if (tick_index < 0) {
      res = tick_index + (Math.abs(tick_index) % tick_spacing) - tick_spacing
    } else {
      res = tick_index
    }

    if (res % tick_spacing !== 0) {
      return handleMessageError(VaultsErrorCode.AssertionError, 'Assertion failed: res % tick_spacing == 0', {
        [DETAILS_KEYS.METHOD_NAME]: 'getValidTickIndex',
      })
    }

    if (Math.abs(res) < Math.abs(tick_index)) {
      return handleMessageError(VaultsErrorCode.AssertionError, 'Assertion failed: res.abs() >= tick_index', {
        [DETAILS_KEYS.METHOD_NAME]: 'getValidTickIndex',
      })
    }

    return res
  }

  /**
   * lp_amount = (total_lp_amount * delta_liquidity) / total_liquidity_in_vault
   * @param total_amount
   * @param current_liquidity
   * @param total_liquidity
   */
  static getLpAmountByLiquidity(vault: Vault, current_liquidity: string) {
    if (vault.total_supply === '0') {
      return current_liquidity
    }
    return d(vault.total_supply).mul(current_liquidity).div(vault.liquidity).toFixed(0, Decimal.ROUND_DOWN).toString()
  }

  /**
   * delta_liquidity = (lp_token_amount * total_liquidity_in_vault) / total_lp_amount
   * @param vault
   * @param current_amount
   * @returns
   */
  static getShareLiquidityByAmount(vault: Vault, current_amount: string) {
    if (vault.total_supply === '0') {
      return '0'
    }
    return d(current_amount).mul(vault.liquidity).div(vault.total_supply).toFixed(0, Decimal.ROUND_DOWN).toString()
  }

  static getProtocolFeeAmount(vault: Vault, amount: string) {
    return d(amount).mul(vault.protocol_fee_rate).div(PROTOCOL_FEE_DENOMINATOR).toFixed(0, Decimal.ROUND_CEIL)
  }

  static buildFarmsPositionNFT(fields: any): FarmsPositionNFT {
    const clmmFields = fields.clmm_postion.fields
    const farmsPositionNft: FarmsPositionNFT = {
      id: fields.id.id,
      url: clmmFields.url,
      pool_id: fields.pool_id,
      coin_type_a: extractStructTagFromType(clmmFields.coin_type_a.fields.name).full_address,
      coin_type_b: extractStructTagFromType(clmmFields.coin_type_b.fields.name).full_address,
      description: clmmFields.description,
      name: clmmFields.name,
      index: clmmFields.index,
      liquidity: clmmFields.liquidity,
      clmm_position_id: clmmFields.id.id,
      clmm_pool_id: clmmFields.pool,
      tick_lower_index: asIntN(BigInt(clmmFields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(clmmFields.tick_upper_index.fields.bits)),
      rewards: [],
    }
    return farmsPositionNft
  }

  static buildPool(objects: SuiObjectResponse): Vault {
    const fields = getObjectFields(objects)
    const type = getObjectType(objects) as string
    const { positions } = fields
    if (fields && positions.length > 0) {
      const farmsPosition = VaultsUtils.buildFarmsPositionNFT(positions[0].fields)!

      const masterNFT: Vault = {
        id: fields.id.id,
        pool_id: fields.pool,
        protocol_fee_rate: fields.protocol_fee_rate,
        is_pause: fields.is_pause,
        harvest_assets: {
          harvest_assets_handle: fields.harvest_assets.fields.id.id,
          size: Number(fields.harvest_assets.fields.size),
        },
        lp_token_type: extractStructTagFromType(type).type_arguments[0],
        total_supply: fields.lp_token_treasury.fields.total_supply.fields.value,
        liquidity: fields.liquidity,
        max_quota: fields.max_quota,
        status: fields.status === 1 ? VaultStatus.STATUS_RUNNING : VaultStatus.STATUS_REBALANCING,
        quota_based_type: fields.quota_based_type.fields.name,
        position: farmsPosition,
      }
      return masterNFT
    }
    return handleMessageError(VaultsErrorCode.BuildError, 'buildPool error', {
      [DETAILS_KEYS.METHOD_NAME]: 'buildPool',
    })
  }

  static async getSuiCoin(sdk: CetusVaultsSDK, amount: number, tx?: Transaction): Promise<TransactionObjectArgument> {
    const allCoinAsset = await sdk.FullClient.getOwnerCoinAssets(sdk.getSenderAddress(), GAS_TYPE_ARG)
    tx = tx || new Transaction()
    let suiCoin
    if (amount > 950000000000) {
      const [firstCoin, ...otherCoins] = allCoinAsset
      if (otherCoins.length > 0) {
        tx.mergeCoins(
          tx.object(firstCoin.coin_object_id),
          otherCoins.map((coin) => tx!.object(coin.coin_object_id))
        )
      }
      suiCoin = tx.splitCoins(tx.object(firstCoin.coin_object_id), [amount])
    } else {
      suiCoin = CoinAssist.buildCoinForAmount(tx, allCoinAsset, BigInt(amount), GAS_TYPE_ARG, false, true).target_coin
    }

    return suiCoin
  }

  public static buildVaultBalance(wallet_address: string, vault: Vault, lp_token_balance: CoinBalance, clmm_pool: Pool) {
    const liquidity = VaultsUtils.getShareLiquidityByAmount(vault, lp_token_balance.totalBalance)
    const { tick_lower_index, tick_upper_index, coin_type_a, coin_type_b } = vault.position
    const lower_sqrt_price = TickMath.tickIndexToSqrtPriceX64(tick_lower_index)
    const upper_sqrt_price = TickMath.tickIndexToSqrtPriceX64(tick_upper_index)
    const amount_info = ClmmPoolUtil.getCoinAmountFromLiquidity(
      new BN(liquidity),
      new BN(clmm_pool.current_sqrt_price),
      lower_sqrt_price,
      upper_sqrt_price,
      true
    )
    return {
      vault_id: vault.id,
      clmm_pool_id: vault.pool_id,
      owner: wallet_address,
      lp_token_type: vault.lp_token_type,
      lp_token_balance: lp_token_balance.totalBalance,
      liquidity,
      tick_lower_index,
      tick_upper_index,
      amount_a: amount_info.coin_amount_a.toString(),
      amount_b: amount_info.coin_amount_b.toString(),
      coin_type_a: coin_type_a,
      coin_type_b: coin_type_b,
    }
  }

  static parseVaultsVestInfo(res: SuiObjectResponse): VaultsVestInfo {
    const fields = getObjectFields(res)

    const type = getObjectType(res) as string
    const structTag = extractStructTagFromType(type)

    const posFields = fields.position.fields
    const position: VaultsPosition = {
      id: posFields.id.id,
      pool_id: posFields.pool,
      index: posFields.index,
      liquidity: posFields.liquidity,
      tick_lower_index: asIntN(BigInt(posFields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(posFields.tick_upper_index.fields.bits)),
      coin_type_a: fixCoinType(posFields.coin_type_a.fields.name, false),
      coin_type_b: fixCoinType(posFields.coin_type_b.fields.name, false),
      name: posFields.name,
      description: posFields.description,
      url: posFields.url,
    }

    const global_vesting_periods = fields.global_vesting_periods.map((item: any) => {
      return {
        period: item.fields.period,
        release_time: item.fields.release_time,
        redeemed_amount: item.fields.redeemed_amount,
        cetus_amount: item.fields.cetus_amount,
      }
    })
    const vaultsVestInfo: VaultsVestInfo = {
      id: fields.id.id,
      vault_id: fields.vault_id,
      index: fields.index,
      lp_coin_type: fields.lp_coin_type.fields.name,
      allocated_lp_amount: fields.allocated_lp_amount,
      position,
      balance: fields.balance,
      total_supply: fields.total_supply,
      impaired_a: fields.impaired_a,
      impaired_b: fields.impaired_b,
      redeemed_amount: fields.redeemed_amount,
      url: fields.url,
      coin_type_a: fixCoinType(fields.coin_a.fields.name, false),
      coin_type_b: fixCoinType(fields.coin_b.fields.name, false),
      cetus_amount: fields.cetus_amount,
      start_time: fields.start_time,
      global_vesting_periods,
      vest_infos: {
        id: fields.vester_infos.fields.id,
        size: fields.vester_infos.fields.size,
      },
    }

    return vaultsVestInfo
  }

  static parseVaultVestNFT(res: SuiObjectResponse): VaultVestNFT {
    const fields = getObjectFields(res)
    const type = getObjectType(res) as string

    const vaultVestNFT: VaultVestNFT = {
      id: fields.id.id,
      vault_id: fields.vault_id,
      index: fields.index,
      lp_amount: fields.lp_amount,
      url: fields.url,
      redeemed_amount: fields.redeemed_amount,
      impaired_a: fields.impaired_a,
      impaired_b: fields.impaired_b,
      period_infos: fields.period_infos.map((item: any) => {
        return {
          period: item.fields.period,
          cetus_amount: item.fields.cetus_amount,
          is_redeemed: item.fields.is_redeemed,
        }
      }),
      name: fields.name,
      vester_id: fields.vester_id,
    }

    return vaultVestNFT
  }
}
