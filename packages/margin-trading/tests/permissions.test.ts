import { printTransaction } from '@cetusprotocol/common-sdk'
import CetusLeverageSDK from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { Transaction } from '@mysten/sui/transactions'
let send_key_pair: Ed25519Keypair

describe('SuiLend Module', () => {
  const sdk = CetusLeverageSDK.createSDK({
    env: 'mainnet',
    full_rpc_url: 'https://fullnode.mainnet.sui.io:443',
  })

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())
  })

  test('queryGlobalPermissions', async () => {
    const globalPermissions = await sdk.PermissionModules.queryGlobalPermissions()
    console.log('globalPermissions: ', globalPermissions)
  })

  test('updateGlobalOpenPositionPermissions', async () => {
    const tx = await sdk.PermissionModules.updateGlobalOpenPositionPermissions(false)
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:27 ~ res:', res)
  })

  test('updateGlobalClosePositionPermissions', async () => {
    const tx = await sdk.PermissionModules.updateGlobalClosePositionPermissions(false)
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:36 ~ res:', res)
  })

  test('updateGlobalDepositPermissions', async () => {
    const tx = await sdk.PermissionModules.updateGlobalDepositPermissions(false)
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:41 ~ res:', res)
  })

  test('updateGlobalWithdrawPermissions', async () => {
    const tx = await sdk.PermissionModules.updateGlobalWithdrawPermissions(false)
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    const globalPermissions = await sdk.PermissionModules.queryGlobalPermissions()
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ globalPermissions:', globalPermissions)
  })

  test('updateGlobalBorrowPermissions', async () => {
    const tx = await sdk.PermissionModules.updateGlobalBorrowPermissions(false)
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    const globalPermissions = await sdk.PermissionModules.queryGlobalPermissions()
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ globalPermissions:', globalPermissions)
  })

  test('updateGlobalRepayPermissions', async () => {
    const tx = await sdk.PermissionModules.updateGlobalRepayPermissions(false)
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    const globalPermissions = await sdk.PermissionModules.queryGlobalPermissions()
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ globalPermissions:', globalPermissions)
  })
  test('updateMarketCreatePositionPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketCreatePositionPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketClosePositionPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketClosePositionPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketDepositPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketDepositPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketWithdrawPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketWithdrawPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketBorrowPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketBorrowPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketRepayPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketRepayPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketClosePositionPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketClosePositionPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('updateMarketPermissions', async () => {
    const tx = await sdk.PermissionModules.updateMarketPermissions(
      '0x4c951aa269cd15d7640e8d832e1b53262b161df59f6a9d8d9d7342c26d81e03f',
      false
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('🚀🚀🚀 ~ globalPermissions.test.ts:28 ~ res:', res)
  })

  test('transfer cap', async () => {
    const tx = new Transaction()
    tx.transferObjects(
      ['0x1d84d375eb46b590f125c3d165bf84d859dfee1d5b13c48e24d2a4ad54546304'],
      tx.pure.address('0x91146573f34bae3dc0cd7eb5f4c33ec1e179106cc3cb648e33cd4891e519800b')
    )
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ permissions.test.ts:155 ~ res:', res)
  })
})
