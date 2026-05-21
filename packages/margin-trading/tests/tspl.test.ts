import { printTransaction } from '@cetusprotocol/common-sdk'
import { CetusMarginTradingSDK } from '../src/sdk'
import { Transaction } from '@mysten/sui/transactions'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

describe('tspl module', () => {
  const sdk = CetusMarginTradingSDK.createSDK({
    env: 'mainnet',
    full_rpc_url: 'https://fullnode.mainnet.sui.io:443',
  })
  let send_key_pair: Ed25519Keypair

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.toSuiAddress())
  })

  test('getDynamicFieldsByPage', async () => {
    const res = await sdk.FullClient.getDynamicFieldsByPage('0xa3de9f6a4bd1bf4a11c1c5c9c7ab4c9c7023ce803f0a86d2898f463ff3345bba')
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })

  test('getOrderBookIds', async () => {
    const res = await sdk.TsplModules.getOrderBookId('0x4df7d35da2049bde24c00d7451ec9a7c4d512d0252100855fd25b11000749a9e')
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })

  test('getTsplOrderList', async () => {
    const orderCaps = await sdk.TsplModules.getTsplOrderCap()
    const res = await sdk.TsplModules.getTsplOrderList(orderCaps)
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', JSON.stringify(res, null, 2))
  })

  test('1. createOrder ', async () => {
    const tx = new Transaction()
    sdk.TsplModules.createTpslOrder(
      {
        order_book_id: '0xd441d90e18c01d85580fbaae2ba3afd2f19df6bc4444e8b3dc0c0788b9b92170',
        position_cap_id: '0xb2faca1c2445c0ab795b389e6ccc8c787b5e21a195d2c80bdb318b4759d3a22e',
        is_long: true,
        entry_price: '0.93085',
        tp_target: { trigger_price: '0.93', slippage_bps: '50', close_ratio_bps: '1', target_is_base: true },
        sl_target: { trigger_price: '0.3', slippage_bps: '100', close_ratio_bps: '1', target_is_base: true },
        base_coin_type: '0x2::sui::SUI',
        quote_coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      },
      tx
    )
    //"9zzQyhLeRJqRK5y22MGjkPm5w7arTL1rTYDQrmRakn9C"
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })

  test('2. updateTpslOrder ', async () => {
    const tx = new Transaction()
    sdk.TsplModules.updateTpslOrder(
      {
        order_id: '0x46e494fe9896c649154de86ac59f1fbb0fd05079286cccdccc8b90c2fd7b3811',
        order_cap_id: '0xc2ad509639c87f62a8908a417228499ac92606c4ac2749464c0dab0579d2debd',
        target: { id: '0', trigger_price: '0.9', slippage_bps: '50', close_ratio_bps: '1', target_is_base: true },
        base_coin_type: '0x2::sui::SUI',
        quote_coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      },
      tx
    )
    //"9zzQyhLeRJqRK5y22MGjkPm5w7arTL1rTYDQrmRakn9C"
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })

  test('removeTarget ', async () => {
    const tx = new Transaction()
    sdk.TsplModules.removeTarget(
      {
        order_id: '0xe0ce63899dba0b4f7da9f7b2eaf213807a41bee9a23cc786144e988f64b9f430',
        order_cap_id: '0x3569062050670081de6f9fac64998578a8fc34ea865b099dac19808266c6c9d1',
        target_id: '1',
        base_coin_type: '0x2::sui::SUI',
        quote_coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      },
      tx
    )
    //"9zzQyhLeRJqRK5y22MGjkPm5w7arTL1rTYDQrmRakn9C"
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })

  test('cancelOrder ', async () => {
    const tx = new Transaction()
    sdk.TsplModules.cancelOrder(
      {
        order_id: '0x46e494fe9896c649154de86ac59f1fbb0fd05079286cccdccc8b90c2fd7b3811',
        order_cap_id: '0xc2ad509639c87f62a8908a417228499ac92606c4ac2749464c0dab0579d2debd',
        order_book_id: '0xd441d90e18c01d85580fbaae2ba3afd2f19df6bc4444e8b3dc0c0788b9b92170',
        base_coin_type: '0x2::sui::SUI',
        quote_coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      },
      tx
    )
    printTransaction(tx)
    const res = await sdk.FullClient.executeTx(send_key_pair, tx, false)
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })

  test('claimSettlement ', async () => {
    const tx = new Transaction()
    await sdk.TsplModules.claimSettlement(
      {
        order_id: '0x941d32b2713d62d9363b9d978f6bcfd7ba9963eb17a6a48ef2dbeb22dc52014a',
        order_cap_id: '0x9f17946d5cbf5189c4f899f286f141bc8da7b1e560254eb37fc3ca66f447a3d9',
        reward_coin_types: [
          '0x83556891f4a0f233ce7b05cfe7f957d4020492a34f5405b2cb9377d060bef4bf::spring_sui::SPRING_SUI',
        ],
        position_id: '0x82119c27cc56d6502df6b688a5c9abd71e53a6928728d81ee03c3db97628dde1',
        is_long: false,
        order_book_id: '0x297968a89928297597c077012ab98a24cc783d574e745c1ceefdff50570fb284',
        base_coin_type: '0x2::sui::SUI',
        quote_coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        transfer_coin_to_sender: false,
      },
      tx
    )

    printTransaction(tx)
    // const res = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    const res = await sdk.FullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: send_key_pair.toSuiAddress(),
    })
    console.log('🚀🚀🚀 ~ tspl.test.ts:21 ~ res:', res)
  })
})
