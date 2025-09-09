// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { printTransaction, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { CetusCrossSwapSDK } from '../src/sdk'
import { CrossSwapPlatform, Chain, ChainId, MayanConfigs } from '../src/types/cross_swap'
import { BaseWallet, JsonRpcProvider, TransactionResponse, Wallet } from 'ethers'
import dotenv from 'dotenv'
import { Connection, Keypair } from '@solana/web3.js'
import * as bip39 from 'bip39'
import { derivePath } from 'ed25519-hd-key'
import { createSolanaSignerFromKeypair } from '../src/utils/mayan'

dotenv.config()

const evm_mnemonic = process.env.EVM_WALLET_MNEMONICS
const solana_mnemonic = process.env.SOLANA_WALLET_MNEMONICS

describe('mayan CrossSwap', () => {
  const sdk = CetusCrossSwapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string
  let solana_keypair: Keypair

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)

    if (solana_mnemonic) {
      const seed = await bip39.mnemonicToSeed(solana_mnemonic)
      const derivationPath = "m/44'/501'/0'/0'"
      const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key

      solana_keypair = Keypair.fromSeed(derivedSeed)
      console.log('solana_wallet:', solana_keypair.publicKey.toBase58())

      const solana_chain = sdk.getChain(CrossSwapPlatform.MAYAN, ChainId.SOL_MAYAN)
      const connection = new Connection(solana_chain.rpc_urls[0])
      const signer = createSolanaSignerFromKeypair(solana_keypair)

      sdk.setCrossSwapConfigs(CrossSwapPlatform.MAYAN, {
        solana: {
          signer,
          connection,
        },
      })
    }
  })

  test('getSupportedChains', async () => {
    const chains = sdk.getSupportedChains(CrossSwapPlatform.MAYAN)
    console.log('🚀 ~ test ~ chains:', chains)
  })

  test('getSupportedTokens', async () => {
    const platform = CrossSwapPlatform.MAYAN
    const chain = sdk.getChain(platform, ChainId.SUI_MAYAN)
    const tokenMap = await sdk.getSupportedTokens(platform, [chain.id])
    console.log('🚀 ~ test ~ tokenMap:', tokenMap[chain.id])
  })

  test('getCrossSwapToken', async () => {
    const platform = CrossSwapPlatform.MAYAN
    const chain = sdk.getChain(platform, ChainId.SUI_MAYAN)
    const token = await sdk.getCrossSwapToken(
      platform,
      chain.id,
      '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'
    )
    console.log('🚀 ~ test ~ token:', token)
  })

  test('1 CrossSwap sui -> evm', async () => {
    const chain = sdk.getChain(CrossSwapPlatform.MAYAN, ChainId.POL)
    const { evm_signer, evm_address } = await buildEvmConfig(chain)
    sdk.setCrossSwapConfigs(CrossSwapPlatform.MAYAN, {
      evm: {
        evm_signer: evm_signer,
      },
    })

    const from_token = '0x2::sui::SUI'
    const to_token = '0x0000000000000000000000000000000000000000'

    const res = await sdk.estimateQuote(CrossSwapPlatform.MAYAN, {
      amount: toDecimalsAmount('1.5', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SUI_MAYAN,
      to_chain_id: ChainId.POL,
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    const payload = await sdk.buildCrossSwapResult({
      quote: res.quotes[0],
      swap_wallet_address: account,
      destination_address: evm_address,
    })

    // printTransaction(payload.sui!)

    // const res2 = await sdk.FullClient.executeTx(send_key_pair, payload.sui!, true)
    // console.log('🚀 ~ test ~ res2:', res2)
  })

  test('2 CrossSwap sui -> solana', async () => {
    const from_token = '0x2::sui::SUI'
    const to_token = '0x0000000000000000000000000000000000000000'

    const res = await sdk.estimateQuote(CrossSwapPlatform.MAYAN, {
      amount: toDecimalsAmount('100', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SUI_MAYAN,
      to_chain_id: ChainId.SOL_MAYAN,
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    const payload = await sdk.buildCrossSwapResult({
      quote: res.quotes[0],
      swap_wallet_address: account,
      destination_address: solana_keypair.publicKey.toBase58(),
    })

    // printTransaction(payload.sui!)

    // const res2 = await sdk.FullClient.executeTx(send_key_pair, payload.sui!, true)
    // console.log('🚀 ~ test ~ res2:', res2)
  })

  test('3 CrossSwap evm -> sui', async () => {
    const chain = sdk.getChain(CrossSwapPlatform.MAYAN, ChainId.ARB)
    const { evm_signer, evm_address } = await buildEvmConfig(chain)

    sdk.setCrossSwapConfigs(CrossSwapPlatform.MAYAN, {
      evm: {
        evm_signer: evm_signer,
      },
    })

    const from_token = '0x0000000000000000000000000000000000000000'
    const to_token = '0x2::sui::SUI'

    const res = await sdk.estimateQuote(CrossSwapPlatform.MAYAN, {
      amount: toDecimalsAmount('200', 18).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.ARB,
      to_chain_id: ChainId.SUI_MAYAN,
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    const result = await sdk.buildCrossSwapResult({
      quote: res.quotes[0],
      swap_wallet_address: evm_address,
      destination_address: account,
    })
    console.log('🚀 ~ test ~ result:', result)
    const evm = result.evm as TransactionResponse
    console.log(`Go and see your swap here: https://explorer.mayan.finance/swap/${evm.hash}`)
  })

  test('4 CrossSwap solana -> sui', async () => {
    const from_token = '0x0000000000000000000000000000000000000000'
    const to_token = '0x2::sui::SUI'

    const res = await sdk.estimateQuote(CrossSwapPlatform.MAYAN, {
      amount: toDecimalsAmount('400', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SOL_MAYAN,
      to_chain_id: ChainId.SUI_MAYAN,
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    const result = await sdk.buildCrossSwapResult({
      quote: res.quotes[0],
      swap_wallet_address: solana_keypair.publicKey.toBase58(),
      destination_address: account,
    })
    console.log('🚀 ~ test ~ result:', result)

    const swapRes = result.solana!

    const { connection } = sdk.getCrossSwapConfigs<MayanConfigs>(CrossSwapPlatform.MAYAN).solana!
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const confirmRes = await connection.confirmTransaction(
      {
        signature: swapRes.signature,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
      },
      'confirmed'
    )
    console.log('🚀 ~ test ~ confirmRes:', confirmRes)
    console.log(`Go and see your swap here: https://explorer.mayan.finance/swap/${swapRes.signature}`)
  })
})

async function buildEvmConfig(chain: Chain) {
  const evm_signer = Wallet.fromPhrase(evm_mnemonic!, new JsonRpcProvider(chain.rpc_urls[0]))
  const evm_address = await evm_signer.getAddress()
  console.log('🚀 ~ beforeEach ~ evm_wallet:', evm_address)

  return {
    evm_signer,
    evm_address,
  }
}
