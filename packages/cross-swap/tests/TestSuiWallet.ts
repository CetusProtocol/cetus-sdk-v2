// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { buildTestAccount } from '@cetusprotocol/test-utils'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiClient } from '@mysten/sui/client'
import type {
  StandardConnectFeature,
  StandardConnectMethod,
  StandardDisconnectFeature,
  StandardDisconnectMethod,
  StandardEventsFeature,
  StandardEventsOnMethod,
  SuiFeatures,
  SuiSignAndExecuteTransactionMethod,
  SuiSignPersonalMessageMethod,
  SuiSignTransactionMethod,
  Wallet,
  WalletAccount,
} from '@mysten/wallet-standard'
import { getWallets, ReadonlyWalletAccount, SUI_CHAINS } from '@mysten/wallet-standard'
import { toBase64 } from '@mysten/sui/utils'

const WALLET_NAME = 'TestSuiWallet'

export class TestSuiWallet implements Wallet {
  #accounts: WalletAccount[] | null = null
  #connecting: boolean
  #connected: boolean

  // Ed25519Keypair 模拟 provider 的能力
  private provider: Ed25519Keypair | null = null
  private suiClient: SuiClient

  constructor(suiClient: SuiClient) {
    this.#connecting = false
    this.#connected = false
    this.suiClient = suiClient
  }

  get version() {
    return '1.0.0' as const
  }

  get name() {
    return WALLET_NAME
  }

  get icon() {
    return 'data:image/png;base64,dd' as const
  }

  // Return the Sui chains that your wallet supports.
  get chains() {
    return SUI_CHAINS
  }

  get accounts() {
    if (this.#connected && this.#accounts) {
      return this.#accounts
    } else {
      return []
    }
  }

  get features(): StandardConnectFeature & StandardEventsFeature & SuiFeatures & StandardDisconnectFeature {
    return {
      'standard:connect': {
        version: '1.0.0',
        connect: this.#connect,
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: this.#disconnect,
      },
      'standard:events': {
        version: '1.0.0',
        on: this.#on,
      },
      'sui:signPersonalMessage': {
        version: '1.1.0',
        signPersonalMessage: this.#signPersonalMessage,
      },
      'sui:signTransaction': {
        version: '2.0.0',
        signTransaction: this.#signTransaction,
      },
      'sui:signAndExecuteTransaction': {
        version: '2.0.0',
        signAndExecuteTransaction: this.#signAndExecuteTransaction,
      },
    }
  }

  #on: StandardEventsOnMethod = () => {
    return () => {}
  }

  #disconnect: StandardDisconnectMethod = async () => {
    this.#accounts = []
    this.#connected = false
  }

  #connect: StandardConnectMethod = async () => {
    if (this.#connecting) {
      throw new Error('Already connecting')
    }

    this.#connecting = true
    this.#connected = false

    try {
      this.provider = buildTestAccount()

      const account = new ReadonlyWalletAccount({
        address: this.provider.getPublicKey().toSuiAddress(),
        publicKey: this.provider.getPublicKey().toRawBytes(),
        chains: ['sui:mainnet'],
        features: [
          'sui:signAndExecuteTransactionBlock',
          'sui:signTransactionBlock',
          'sui:signTransaction',
          'sui:signAndExecuteTransaction',
        ],
      })
      console.log('🚀 ~  ~ #connect:StandardConnectMethod= ~ account:', account)

      this.#accounts = [account]
      this.#connecting = false
      this.#connected = true

      return {
        accounts: this.accounts,
      }
    } catch (e) {
      console.log('🚀 ~  ~ #connect:StandardConnectMethod= ~ e:', e)

      this.#connecting = false
      this.#connected = false
      throw e
    }
  }

  #signPersonalMessage: SuiSignPersonalMessageMethod = async (messageInput) => {
    const provider = (window as any).embed_phantom
    console.log(' signPersonalMessage messageInput###', messageInput)
    try {
      const { bytes, signature } = await provider.sui.signMessage(messageInput.message, this.#accounts![0].address)
      return { bytes, signature }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to sign message')
    }
  }

  #signTransaction: SuiSignTransactionMethod = async (transactionInput) => {
    console.log('🚀 ~  ~ #signTransaction:2= ~ transactionInput:', transactionInput)

    if (!this.provider) {
      throw new Error('Provider not initialized')
    }

    const { bytes, signature } = await Transaction.from(await transactionInput.transaction.toJSON()).sign({
      client: this.suiClient,
      signer: this.provider,
    })

    return {
      bytes,
      signature,
    }
  }

  #signAndExecuteTransaction: SuiSignAndExecuteTransactionMethod = async (transactionInput) => {
    console.log('🚀 ~  ~ #signAndExecuteTransaction:4= ~ transactionInput:', transactionInput)

    const { bytes, signature } = await Transaction.from(await transactionInput.transaction.toJSON()).sign({
      client: this.suiClient,
      signer: this.provider!,
    })

    transactionInput.signal?.throwIfAborted()

    const { rawEffects, digest } = await this.suiClient.executeTransactionBlock({
      signature,
      transactionBlock: bytes,
      options: {
        showRawEffects: true,
      },
    })

    return {
      bytes,
      signature,
      digest,
      effects: toBase64(new Uint8Array(rawEffects!)),
    }
  }
}
