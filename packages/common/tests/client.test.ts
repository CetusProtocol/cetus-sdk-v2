import { SuiGrpcClient } from '@mysten/sui/grpc'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { fixCoinType, GraphRpcUrlMainnet, TypeNameRaw } from '../src'
import { createFullClient } from '../src/modules/extendedSuiClient'
import 'isomorphic-fetch'
import { describe, test } from 'vitest'
import { bcs } from '@mysten/sui/bcs'
import { coinWithBalance, Transaction } from '@mysten/sui/transactions'

const FULL_RPC_URL = 'https://fullnode.mainnet.sui.io/'
const env: 'mainnet' | 'testnet' = 'mainnet'

const suiClient = new SuiGrpcClient({
  baseUrl: FULL_RPC_URL,
  network: env,
})

const jsonRpcClient = new SuiJsonRpcClient({
  url: FULL_RPC_URL,
  network: env,
})

const graphClient = new SuiGraphQLClient({
  network: env,
  url: GraphRpcUrlMainnet,
})

const fullClient = createFullClient(suiClient, graphClient, env, jsonRpcClient)

describe('FullClient', () => {

  test('getOwnerCoinBalances', async () => {
    const res = await fullClient.getOwnerCoinBalances('0x3bd7a9e240ebef9fe683ae6e2eae2ef0b09f0c552b576e1be15762bc9b3d3581')
    const res2 = await fullClient._jsonRpcClient?.core.getBalance({
      owner: '0x410456cfc689666936b6bf80fbec958b69499b9f7183ecba07de577c17248a44',
      coinType: "0x2f46a040b9bc3a584a3be4d7bfbb02a5fb479da17a04c6d2860ed61d95e97f3f::lpcoin::LPCOIN"
    })
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res2:', res2)



  })

  test('getSuiTransactionResponse', async () => {
    const res: any = await fullClient.getSuiTransactionResponse('2HfBtC1sNb6vwBdN6BZEzg3EUhdXux8riW9tspCtYw1h')
    const openEvents = res.Transaction?.events?.filter((event: any) => event.eventType.includes('OpenPositionEvent'))

    const parsed = bcs.struct("OpenPositionEvent", {
      pool: bcs.Address,
      tick_lower: bcs.u32(),
      tick_upper: bcs.u32(),
      position: bcs.Address,
    }).parse(openEvents[0].bcs)

    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ parsed:', parsed)
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })


  test('getTransactionByGraphQL', async () => {
    const res = await fullClient.getTransactionByGraphQL('3VwAHpE7b7dYfGtQmPL2UD2XfGPwNEMKfNmJxWLc5ESC')
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })

  test("getAllDynamicFields", async () => {
    const res = await fullClient.getAllDynamicFields('0x37f60eb2d9d227949b95da8fea810db3c32d1e1fa8ed87434fc51664f87d83cb')
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })



  test("2queryTransactionsByGraphQL", async () => {
    const res = await fullClient.queryTransactionBlocksByPage({ affectedObject: '0x5f7113564e5532f47c33eaab120faf1d17b5aeed768f647d5eba23c497640373' }, { limit: 10 })
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })


  test("getOwnedObjectsByPage", async () => {
    const res = await fullClient.getOwnedObjectsByPage('0x0005e9b405ab0424b6494b64d3d5b79b6715d06d284585faffe1ee1a873ba8a3')
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })

  test("getDynamicFieldsByPage", async () => {
    const res = await fullClient.getDynamicFieldsByPage('0x6c460bbfc763aae9d07bf87491cae60fcc408d22304c2d061753069468addec4')
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })


  test("getCoinMetadataId", async () => {
    const res = await fullClient.fetchCoinMetadata('0xe4526bcc102f55c030b00ccfcd5778fd2c5295d6bdea905ffba832c2e094838b::hty::HTY')
    console.log('🚀🚀🚀 ~ client.test.ts:31 ~ res:', res)
  })



})
