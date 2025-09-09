// buildTestAccount
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildTestAccount } from '@cetusprotocol/test-utils'
import { CetusCrossSwapSDK } from '../src/sdk'
import { CrossSwapPlatform, ChainId } from '../src/types/cross_swap'
import { toDecimalsAmount } from '@cetusprotocol/common-sdk'
import { createWalletClient, http } from 'viem'
import { printLiFiTransactionLinks } from '../src/utils'
import * as bip39 from 'bip39'
import { mnemonicToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import dotenv from 'dotenv'
import { TestSuiWallet } from './TestSuiWallet'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { derivePath } from 'ed25519-hd-key'
import { KeypairWalletAdapter } from '@lifi/sdk'
import bs58 from 'bs58'
import * as bitcoin from 'bitcoinjs-lib'
import { createClient, http as bigmiHttp, fallback } from '@bigmi/core'
import { BIP32Factory } from 'bip32'
import * as ecc from 'tiny-secp256k1'

dotenv.config()

const evm_mnemonic = process.env.EVM_WALLET_MNEMONICS
const solana_mnemonic = process.env.SOLANA_WALLET_MNEMONICS
const btc_mnemonic = process.env.BTC_WALLET_MNEMONICS

describe('li.fi CrossSwap', () => {
  const sdk = CetusCrossSwapSDK.createSDK({ env: 'mainnet' })
  let send_key_pair: Ed25519Keypair
  let account: string
  let evm_address: string
  let testSuiWallet: TestSuiWallet
  let solana_keypair: Keypair
  let btc_address: string

  beforeEach(async () => {
    send_key_pair = buildTestAccount()
    account = send_key_pair.getPublicKey().toSuiAddress()
    sdk.setSenderAddress(account)

    // evm
    const evm_account = mnemonicToAccount(evm_mnemonic!)
    evm_address = evm_account.address
    console.log('evm_address:', evm_address)
    const client = createWalletClient({
      account: evm_account,
      chain: polygon,
      transport: http(),
    })
    sdk.setCrossSwapConfigs(CrossSwapPlatform.LI_FI, {
      evm: {
        wallet: client,
      },
    })

    // sui
    testSuiWallet = new TestSuiWallet(sdk.FullClient)
    await testSuiWallet.features['standard:connect'].connect()
    sdk.setCrossSwapConfigs(CrossSwapPlatform.LI_FI, {
      sui: {
        wallet: testSuiWallet,
      },
    })

    // solana
    if (solana_mnemonic) {
      const seed = await bip39.mnemonicToSeed(solana_mnemonic)
      const derivationPath = "m/44'/501'/0'/0'"
      const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key

      solana_keypair = Keypair.fromSeed(derivedSeed)
      console.log('solana_wallet:', solana_keypair.publicKey.toBase58())
      const privateKey = bs58.encode(solana_keypair.secretKey)
      sdk.setCrossSwapConfigs(CrossSwapPlatform.LI_FI, {
        solana: {
          wallet: new KeypairWalletAdapter(privateKey),
        },
      })
    }

    // btc
    if (btc_mnemonic) {
      const mnemonic = btc_mnemonic
      const seed = await bip39.mnemonicToSeed(mnemonic)

      const bip32 = BIP32Factory(ecc)
      const root = bip32.fromSeed(seed)
      const path = "m/84'/0'/0'/0/0"
      const child = root.derivePath(path)

      const privateKey = child.privateKey // Buffer
      const publicKey = child.publicKey

      const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKey })
      btc_address = address as string

      console.log('BTC Address:', address)

      const wif = child.toWIF()
      const client = createClient({
        transport: fallback([bigmiHttp('https://node-router.thorswap.net/bitcoin'), bigmiHttp('https://bitcoin-rpc.publicnode.com')]),
        account: wif,
      })

      sdk.setCrossSwapConfigs(CrossSwapPlatform.LI_FI, {
        btc: {
          wallet: client,
        },
      })
    }
  })

  test('getSupportedChains', async () => {
    const chains = sdk.getSupportedChains(CrossSwapPlatform.LI_FI)
    console.log('🚀 ~ test ~ chains:', chains)
  })

  test('getSupportedTokens', async () => {
    const tokenMap = await sdk.getSupportedTokens(CrossSwapPlatform.LI_FI, [ChainId.SOL_LI_FI])
    console.log('🚀 ~ test ~ chains:', tokenMap[ChainId.SOL_LI_FI])
  })

  test('getCrossSwapToken', async () => {
    const token = await sdk.getCrossSwapToken(
      CrossSwapPlatform.LI_FI,
      ChainId.SUI_LI_FI,
      '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    )
    console.log('🚀 ~ test ~ token:', token)
  })

  test('getOwnerTokenBalances', async () => {
    const tokens = await sdk.getSupportedTokens(CrossSwapPlatform.MAYAN, [ChainId.SOL_MAYAN])
    const balances = await sdk.getOwnerTokenBalances(
      CrossSwapPlatform.MAYAN,
      '3kTFG1MTm2VG4DHeNpqby7EkMqCWF2eeetxnKU9pG5x4',
      tokens[ChainId.SOL_MAYAN]
    )
    console.log('🚀 ~ test ~ balances:', balances)
  })

  test('getSolanaBalance', async () => {
    const connection = new Connection('https://cetus-solanam-e396.mainnet.rpcpool.com/')
    const balance = await connection.getBalance(new PublicKey('3kTFG1MTm2VG4DHeNpqby7EkMqCWF2eeetxnKU9pG5x4'))
    console.log('🚀 ~ test ~ balance:', balance)
  })

  test('1 CrossSwap sui -> evm', async () => {
    const from_token = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const to_token = '0x0000000000000000000000000000000000000000'

    const from_address = testSuiWallet.accounts[0].address
    const to_address = evm_address

    const res = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
      amount: toDecimalsAmount('2', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SUI_LI_FI,
      to_chain_id: ChainId.POL,
      slippage: 0.05,
      lifi_configs: {
        from_address,
        to_address,
      },
    })
    console.log('🚀 ~ test ~ res:', res)

    // const executedRoute = await sdk.executeSwapQuoteFromLiFi(
    //   {
    //     quote: res.quotes[0],
    //     swap_wallet_address: from_address,
    //     destination_address: to_address,
    //   },
    //   {
    //     updateRouteHook(route) {
    //       printLiFiTransactionLinks(route)
    //     },
    //   }
    // )
    // console.log('🚀 ~ test ~ executedRoute:', executedRoute)
  })

  test('2 CrossSwap sui -> solana', async () => {
    const from_token = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const to_token = '11111111111111111111111111111111'

    const from_address = testSuiWallet.accounts[0].address
    const to_address = solana_keypair.publicKey.toBase58()

    const res = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
      amount: toDecimalsAmount('2', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SUI_LI_FI,
      to_chain_id: ChainId.SOL_LI_FI,
      slippage: 0.05,
      lifi_configs: {
        from_address,
        to_address,
      },
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    // const executedRoute = await sdk.executeSwapQuoteFromLiFi(
    //   {
    //     quote: res.quotes[0],
    //     swap_wallet_address: from_address,
    //     destination_address: to_address,
    //   },
    //   {
    //     updateRouteHook(route) {
    //       printLiFiTransactionLinks(route)
    //     },
    //   }
    // )
    // console.log('🚀 ~ test ~ executedRoute:', executedRoute)
  })

  test('3 CrossSwap evm -> sui', async () => {
    const from_token = '0x0000000000000000000000000000000000000000'
    const to_token = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'

    const from_address = evm_address
    const to_address = testSuiWallet.accounts[0].address

    const res = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
      amount: toDecimalsAmount('9', 18).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.POL,
      to_chain_id: ChainId.SUI_LI_FI,
      slippage: 0.05,
      lifi_configs: {
        from_address,
        to_address,
      },
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    // const executedRoute = await sdk.executeSwapQuoteFromLiFi(
    //   {
    //     quote: res.quotes[0],
    //     swap_wallet_address: from_address,
    //     destination_address: to_address,
    //   },
    //   {
    //     updateRouteHook(route) {
    //       printLiFiTransactionLinks(route)
    //     },
    //   }
    // )
    // console.log('🚀 ~ test ~ executedRoute:', executedRoute)
  })

  test('4 CrossSwap solana -> sui', async () => {
    const from_token = '11111111111111111111111111111111'
    const to_token = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'

    const from_address = solana_keypair.publicKey.toBase58()
    const to_address = testSuiWallet.accounts[0].address

    const res = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
      amount: toDecimalsAmount('0.01', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SOL_LI_FI,
      to_chain_id: ChainId.SUI_LI_FI,
      slippage: 0.05,
      lifi_configs: {
        from_address,
        to_address,
      },
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    const executedRoute = await sdk.executeSwapQuoteFromLiFi(
      {
        quote: res.quotes[0],
        swap_wallet_address: from_address,
        destination_address: to_address,
      },
      {
        updateRouteHook(route) {
          printLiFiTransactionLinks(route)
        },
      }
    )
    console.log('🚀 ~ test ~ executedRoute:', executedRoute)
  })

  test('5 CrossSwap solana -> btc', async () => {
    const from_token = '11111111111111111111111111111111'
    const to_token = 'bitcoin'

    const from_address = solana_keypair.publicKey.toBase58()
    const to_address = btc_address

    const res = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
      amount: toDecimalsAmount('0.00001', 9).toString(),
      from_token,
      to_token,
      from_chain_id: ChainId.SOL_LI_FI,
      to_chain_id: ChainId.BTC,
      slippage: 0.05,
      lifi_configs: {
        from_address,
        to_address,
      },
    })
    console.log('🚀 ~ test ~ res:', JSON.stringify(res, null, 2))

    const executedRoute = await sdk.executeSwapQuoteFromLiFi(
      {
        quote: res.quotes[0],
        swap_wallet_address: from_address,
        destination_address: to_address,
      },
      {
        updateRouteHook(route) {
          printLiFiTransactionLinks(route)
        },
      }
    )
    console.log('🚀 ~ test ~ executedRoute:', executedRoute)
  })
})
