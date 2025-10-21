import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { CetusVaultsSDK } from '../src/sdk'
import { DepositParams, InputType } from '../src/types/vaults'

const vaultId = '0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270'

describe('vaults router', () => {
  // const sdk = CetusVaultsSDK.createSDK({ env: 'mainnet' })
  const sdk = CetusVaultsSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('VaultsConfigs', async () => {
    try {
      const initFactoryEvent = await sdk.Vaults.getVaultsConfigs()
      console.log({
        ...initFactoryEvent,
      })
    } catch (error) {
      console.log(error)
    }
  })

  test('1 getVaultList', async () => {
    const dataPage = await sdk.Vaults.getVaultList()
    console.log('dataPage: ', dataPage.data)
  })

  test('2 getOwnerCoinBalances', async () => {
    const vault = await sdk.Vaults.getVault(vaultId)
    console.log('vault: ', vault)

    const ftAsset = await sdk.FullClient.getOwnerCoinBalances(sdk.getSenderAddress(), vault?.lp_token_type)
    console.log('ftAsset: ', ftAsset)
  })

  test('2 getVault', async () => {
    const vault = await sdk.Vaults.getVault(vaultId)
    console.log('vault: ', vault)
  })

  test('1 both side deposit', async () => {
    const result = await sdk.Vaults.calculateDepositAmount({
      vault_id: vaultId,
      fix_amount_a: false,
      input_amount: toDecimalsAmount(3, 9).toString(),
      slippage: 0.01,
      side: InputType.OneSide,
    })
    console.log({ result })

    const tx = new Transaction()
    const params: DepositParams = {
      vault_id: vaultId,
      slippage: 0.01,
      deposit_result: result,
    }

    await sdk.Vaults.deposit(params, tx)
    const txResult = await sdk.FullClient.sendTransaction(send_key_pair, tx)
    console.log('deposit: ', txResult)
    // const res = await sdk.FullClient.devInspectTransactionBlock({
    //   transactionBlock: tx,
    //   sender: sdk.getSenderAddress(),
    // })
    // console.log('1110 res: ', res.events.length > 0 ? res.events : res)
  })

  test('2 one side deposit fix_amount_a true', async () => {
    const input_amount = toDecimalsAmount(0.1, 9).toString()

    const result = await sdk.Vaults.calculateDepositAmount({
      vault_id: vaultId,
      fix_amount_a: true,
      input_amount,
      slippage: 0.01,
      side: InputType.OneSide,
    })
    console.log({ result })

    const tx = new Transaction()
    const params: DepositParams = {
      vault_id: vaultId,
      slippage: 0.01,
      deposit_result: result,
    }

    await sdk.Vaults.deposit(params, tx)

    // tx.getData().commands.forEach((command, index) => {
    //   console.log('command: ', index, command)
    // })
    // const txResult = await sdk.FullClient.sendTransaction(sendKeypair, tx)
    // console.log('deposit: ', txResult)

    const res = await sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: sdk.getSenderAddress(),
    })
    console.log('1110 res: ', res.events.length > 0 ? res.events : res)
  })

  test('3 one side deposit fix_amount_a false', async () => {
    const input_amount = toDecimalsAmount(3, 9).toString()

    const result = await sdk.Vaults.calculateDepositAmount({
      vault_id: vaultId,
      fix_amount_a: false,
      input_amount,
      slippage: 0.01,
      side: InputType.OneSide,
    })
    console.log({ result })

    const tx = new Transaction()
    const params: DepositParams = {
      vault_id: vaultId,
      slippage: 0.01,
      deposit_result: result,
    }

    const lp_coin = await sdk.Vaults.deposit(params, tx)

    if (lp_coin) {
      tx.transferObjects([lp_coin], sdk.getSenderAddress())
    }

    // tx.getData().commands.forEach((command, index) => {
    //   console.log('command: ', index, command)
    // })
    const txResult = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('deposit: ', txResult)
  })

  test('1 calculate both side withdraw amount by fix coin', async () => {
    const result = await sdk.Vaults.calculateWithdrawAmount({
      vault_id: vaultId,
      fix_amount_a: true,
      input_amount: '1000000000',
      slippage: 0.01,
      is_ft_input: false,
      side: InputType.Both,
      max_ft_amount: '',
    })
    console.log({ result })
  })

  test('2 calculate both side withdraw amount by ft_input', async () => {
    const result = await sdk.Vaults.calculateWithdrawAmount({
      vault_id: vaultId,
      fix_amount_a: true,
      input_amount: '315689081',
      slippage: 0.01,
      is_ft_input: true,
      side: InputType.Both,
      max_ft_amount: '',
    })
    console.log({ result })
  })

  test('1 both side withdraw amount by inputAmount fix coin fix_amount_a true', async () => {
    const result = await sdk.Vaults.calculateWithdrawAmount({
      vault_id: vaultId,
      fix_amount_a: true,
      input_amount: '10000000',
      slippage: 0.01,
      is_ft_input: false,
      side: InputType.Both,
      max_ft_amount: '',
    })
    console.log({ result })

    const tx = new Transaction()
    await sdk.Vaults.withdraw(
      {
        vault_id: vaultId,
        slippage: 0.01,
        ft_amount: result.burn_ft_amount,
      },
      tx
    )
    printTransaction(tx)
    const txResult = await sdk.FullClient.sendTransaction(send_key_pair, tx)
    console.log('deposit: ', txResult)
  })

  test('2 one side side withdraw amount by input_amount fix coin fix_amount_a true', async () => {
    const result = await sdk.Vaults.calculateWithdrawAmount({
      vault_id: vaultId,
      fix_amount_a: true,
      input_amount: '1000000000',
      slippage: 0.1,
      is_ft_input: false,
      side: InputType.OneSide,
      max_ft_amount: '',
    })
    console.log(JSON.stringify(result))

    const tx = new Transaction()
    await sdk.Vaults.withdraw(
      {
        vault_id: vaultId,
        fix_amount_a: true,
        is_ft_input: false,
        slippage: 0.1,
        input_amount: '1000000000',
        max_ft_amount: '34813648675',
      },
      tx
    )
    const res = await sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: sdk.getSenderAddress(),
    })
    console.log('1110 res: ', res.events.length > 0 ? res.events : res)
  })

  test('3 one side side withdraw amount by ft_amount fix coin fix_amount_a true', async () => {
    const tx = new Transaction()
    await sdk.Vaults.withdraw(
      {
        vault_id: vaultId,
        fix_amount_a: false,
        is_ft_input: false,
        slippage: 0.01,
        input_amount: '637771460',
        max_ft_amount: '419540343722',
      },
      tx
    )
    printTransaction(tx)
    const res = await sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: sdk.getSenderAddress(),
    })
    console.log('1110 res: ', res.events.length > 0 ? res.events : res)
  })

  test('getVaultsBalance', async () => {
    const result = await sdk.Vaults.getOwnerVaultsBalance(sdk.getSenderAddress())
    console.log('🚀🚀🚀 ~ file: vaults_router.test.ts:241 ~ test ~ result:', result)
  })

  test('withdraw', async () => {
    const tx = new Transaction()
    await sdk.Vaults.withdraw(
      {
        vault_id: '0x99946ea0792c7dee40160e78b582e578f9cd613bfbaf541ffdd56487e20856bf',
        fix_amount_a: true,
        is_ft_input: true,
        slippage: 0.001,
        input_amount: '45464419062',
        max_ft_amount: '45464419062',
      },
      tx
    )
    printTransaction(tx)
    const res = await sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: '0x2a6174f94a2c1d648de290297be27867527a6aaa263a4e0a567c9cd7656d3651',
    })
    console.log('1110 res: ', res.events.length > 0 ? res.events : res)
  })
})
