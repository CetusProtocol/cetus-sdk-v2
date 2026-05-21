import BN from 'bn.js'
import { adjustForCoinSlippage, ClmmPoolUtil, Percentage, printTransaction, TickMath } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import CetusClmmSDK from '../src'
import { bcs } from '@mysten/sui/bcs'

const poolId = '0xbeaaf89a1aa4469b2d5a760801c1c5d65d1b26f14051b0692e2a8c7392fcb1da'
const position_nft_id = '0x4b16cd28d74f93653cc44e45edf929811b29302f9ff286c7ee9cab77dce4dda8'
describe('Position  Module', () => {
  let send_key_pair = buildTestAccount()
  const sdk = CetusClmmSDK.createSDK({ env: 'testnet' })
  sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
  })

  test('get owner position list', async () => {
    const res = await sdk.Position.getPositionList(sdk.getSenderAddress(), [])
    console.log('getPositionList####', res)
    expect(res.length).toBeGreaterThan(0)
  })

  test('get position by id', async () => {
    const res = await sdk.Position.getPositionById(position_nft_id)
    console.log('getPositionById####', res)
  })







})
