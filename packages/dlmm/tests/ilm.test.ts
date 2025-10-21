// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusDlmmSDK } from '../src/sdk'
import { BinUtils } from '../src/utils/binUtils'
import { Transaction } from '@mysten/sui/transactions'
import { asUintN, d, printTransaction } from '@cetusprotocol/common-sdk'
import { CalculateAddLiquidityOption, StrategyType } from '../src/types/dlmm'
import { IlmUtils, safeMulAmount } from '../src/utils'
import { IlmInputOptions } from '../src/types/ilm'

describe('ilm', () => {
  test('curvature =0.6, calculateIlm', async () => {
    const options: IlmInputOptions = {
      curvature: 0.6,
      initial_price: '0.000001',
      max_price: '0.00003',
      bin_step: 80,
      total_supply: '1000000',
      pool_share_percentage: 20,
      config: {
        price_curve_points_num: 101,
        liquidity_distribution_num: 101,
        tokens_table_num: 10,
        price_table_num: 10,
      },
    }
    const result = IlmUtils.calculateIlm(options)
    console.log('🚀 ~ test ~ result:', result)
  })

  test('curvature =0, calculateIlm', async () => {
    const options: IlmInputOptions = {
      curvature: 0,
      initial_price: '0.00003',
      max_price: '0.00003',
      bin_step: 80,
      total_supply: '1000000',
      pool_share_percentage: 20,
      config: {
        price_curve_points_num: 101,
        liquidity_distribution_num: 101,
        tokens_table_num: 10,
        price_table_num: 10,
      },
    }
    const result = IlmUtils.calculateIlm(options)
    console.log('🚀 ~ test ~ result:', result)
  })
})
