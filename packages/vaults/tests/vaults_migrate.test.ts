import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import Decimal from 'decimal.js'
import 'isomorphic-fetch'
import { CetusVaultsSDK } from '../src/sdk'
import { DepositParams, InputType } from '../src/types/vaults'
import { calcExactSwapAmount } from '../src/utils/vaults'

const fromVaultId = '0x5732b81e659bd2db47a5b55755743dde15be99490a39717abc80d62ec812bcb6' // afsui-sui
const toVaultId = '0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270' // hasui-sui

describe('vaults migrate', () => {
  // const sdk = CetusVaultsSDK.createSDK({ env: 'mainnet' })
  const sdk = CetusVaultsSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('2 getOwnerCoinBalances', async () => {
    const vault = await sdk.Vaults.getVault(fromVaultId)
    console.log('vault: ', vault)

    const ftAsset = await sdk.FullClient.getOwnerCoinBalances(sdk.getSenderAddress(), vault?.lp_token_type)
    console.log('ftAsset: ', ftAsset)
  })

  test('1 migrate from afsui-sui to hasui-sui', async () => {
    const fromResult = await sdk.Migrate.calculateMigrateWithdraw({
      from_vault_id: fromVaultId,
      to_vault_id: toVaultId,
      burn_ft_amount: '329445863',
      liquidity_slippage: 0.01,
    })
    console.log('fromResult: ', fromResult)

    const tx = new Transaction()
    await sdk.Migrate.buildMigrateWithdrawTx(
      {
        withdraw_result: fromResult,
      },
      tx
    )
    console.log('tx: ', tx)

    const txResult = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('txResult: ', txResult)
  })

  test('2 calcExactSwapAmount', async () => {
    const result = calcExactSwapAmount('1000', '40', '2', '1.5')
    console.log('result: ', result)
  })

  test('3 calcExactSwapAmount - user reported case', async () => {
    const result = calcExactSwapAmount(
      '1059240',
      '4169158',
      '1.224236244854801555832483667535213926966504286091914957894339337',
      '2.461664459106962640159586269010110088469174567779320814282706735'
    )
    console.log('result: ', result)

    // 验证结果
    const finalR = new Decimal(result.final_amount_b).div(result.final_amount_a)
    const targetR = new Decimal('2.461664459106962640159586269010110088469174567779320814282706735')
    const minR = targetR.mul(0.999)
    const maxR = targetR

    expect(result.swap_direction).toBe('B_TO_A')
    expect(parseInt(result.swap_amount)).toBeGreaterThan(0)
    expect(finalR.gte(minR) && finalR.lte(maxR)).toBe(true)
    console.log('final_ratio:', finalR.toString())
    console.log('target_ratio:', targetR.toString())
    console.log('ratio_error:', finalR.minus(targetR).abs().div(targetR).mul(100).toFixed(6) + '%')
  })
})
