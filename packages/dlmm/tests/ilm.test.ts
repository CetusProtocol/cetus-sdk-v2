// buildTestAccount
import { IlmUtils } from '../src/utils/ilmUtils'
import { IlmInputOptions } from '../src/types/ilm'

describe('ilm', () => {
  test('curvature =0.6, calculateIlm', async () => {
    const options: IlmInputOptions = {
      curvature: 0.1,
      initial_price: 1,
      max_price: 100,
      bin_step: 1,
      total_supply: 1000000,
      pool_share_percentage: 20,
      config: {
        price_curve_points_num: 101,
        liquidity_distribution_num: 101,
        tokens_table_num: 10,
        price_table_num: 10,
      },
    }
    const startTime = performance.now()
    const result = IlmUtils.calculateIlm(options)
    const endTime = performance.now()
    console.log('Execution time: ', endTime - startTime, 'milliseconds')
    console.log('🚀 ~ test ~ result:', result)
  })

  test('curvature =0, calculateIlm', async () => {
    const options: IlmInputOptions = {
      curvature: 0,
      initial_price: 0.00003,
      max_price: 0.00003,
      bin_step: 1,
      total_supply: 1000000,
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
