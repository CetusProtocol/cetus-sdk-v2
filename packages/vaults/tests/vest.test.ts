import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import 'isomorphic-fetch'
import { CetusVaultsSDK } from '../src/sdk'

const vaultId = '0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270'

describe('vest test', () => {
  const sdk = CetusVaultsSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair

  beforeEach(async () => {
    console.log('sdk env: ', sdk.sdkOptions.env)
    send_key_pair = buildTestAccount()
    sdk.setSenderAddress(send_key_pair.getPublicKey().toSuiAddress())
  })

  test('getVestCreateEventList', async () => {
    const createEventList = await sdk.Vest.getVestCreateEventList()
    console.log('createEventList: ', createEventList)
  })

  test('getVaultsVestInfoList', async () => {
    const vestInfoList = await sdk.Vest.getVaultsVestInfoList([vaultId])
    console.log('vestInfoList: ', vestInfoList)
  })

  test('getVaultVestId', async () => {
    const vestInfo = await sdk.Vest.getVaultsVestInfo(vaultId)
    console.log('vestInfo: ', vestInfo)
  })

  test('getOwnerVaultVestNFT', async () => {
    const vestNFTList = await sdk.Vest.getOwnerVaultVestNFT(sdk.getSenderAddress())
    console.log('vestNFTList: ', vestNFTList)
  })

  test('vestNftIsAvailable', async () => {
    const isAvailable = await sdk.Vest.vestNftIsAvailable(
      '0x725a44f0cc23358e004a13797b53ec3a3bcdd5dcd7c7bf14b0354982b2fe1596',
      '0x5ffdf3252fe7f9a685b8ac3077c8d5fe84e1d37f9879993db7d888dd738ffd5d'
    )
    console.log('isAvailable: ', isAvailable)
  })

  test('buildRedeemPayload', async () => {
    const vestInfo = await sdk.Vest.getVaultsVestInfo(vaultId)
    console.log('vestInfo: ', vestInfo)
    const tx = await sdk.Vest.buildRedeemPayload([
      {
        vault_id: vaultId,
        vesting_nft_id: '0xb8439b160fc43298f7d2fced6caba809f864af96cae28d544b99416645a051be',
        period: 2,
        coin_type_a: vestInfo.coin_type_a,
        coin_type_b: vestInfo.coin_type_b,
      },
    ])

    printTransaction(tx)

    const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, true)
    console.log('redeem: ', transferTxn)
  })
})
