# Cetus CrossSwap SDK

A comprehensive TypeScript SDK for cross-chain bridging operations using multiple platforms including **LiFi** and **Mayan**. This SDK provides a unified interface for cross-chain token swaps across different blockchain networks.

## Features

- **Multi-Platform Support**: LiFi and Mayan integration
- **Multi-Chain Support**: Sui, EVM chains (Polygon, Arbitrum, etc.), Solana, Bitcoin
- **Unified API**: Single interface for different cross-chain platforms
- **Quote Estimation**: Get detailed quotes before executing swaps
- **Balance Checking**: Check token balances across chains

## Installation

```bash
npm install @cetusprotocol/CrossSwap-sdk
```

## Quick Start

### Basic Setup

```typescript
import { CetusCrossSwapSDK, CrossSwapPlatform } from '@cetusprotocol/CrossSwap-sdk'

// Create SDK instance
const sdk = CetusCrossSwapSDK.createSDK({ env: 'mainnet' })
```

### Platform Configuration

The SDK supports two main platforms: **LiFi** and **Mayan**. Each platform has different configuration requirements.

#### LiFi Configuration

```typescript
import { createWalletClient, http } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import { KeypairWalletAdapter } from '@lifi/sdk'
import { Connection, Keypair } from '@solana/web3.js'
import { derivePath } from 'ed25519-hd-key'
import * as bip39 from 'bip39'
import bs58 from 'bs58'

// EVM Configuration
const evm_account = mnemonicToAccount(mnemonic)
const evm_client = createWalletClient({
  account: evm_account,
  chain: polygon,
  transport: http(),
})

// Solana Configuration
const seed = await bip39.mnemonicToSeed(solana_mnemonic)
const derivationPath = "m/44'/501'/0'/0'"
const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key
const solana_keypair = Keypair.fromSeed(derivedSeed)
const privateKey = bs58.encode(solana_keypair.secretKey)

// Set LiFi configurations
sdk.setCrossSwapConfigs(CrossSwapPlatform.LI_FI, {
  evm: {
    wallet: evm_client,
  },
  solana: {
    wallet: new KeypairWalletAdapter(privateKey),
  },
  // Add other chain configurations as needed
})
```

#### Mayan Configuration

```typescript
import { Wallet, JsonRpcProvider } from 'ethers'
import { Connection, Keypair } from '@solana/web3.js'
import { createSolanaSignerFromKeypair } from '@cetusprotocol/CrossSwap-sdk'

// EVM Configuration
const evm_signer = Wallet.fromPhrase(mnemonic, new JsonRpcProvider(rpcUrl))

// Solana Configuration
const solana_keypair = Keypair.fromSeed(derivedSeed)
const connection = new Connection(solana_chain.rpc_urls[0])
const signer = createSolanaSignerFromKeypair(solana_keypair)

// Set Mayan configurations
sdk.setCrossSwapConfigs(CrossSwapPlatform.MAYAN, {
  evm: {
    evm_signer: evm_signer,
  },
  solana: {
    signer: signer,
    connection: connection,
  },
})
```

## Core Functionality

### Getting Supported Chains and Tokens

```typescript
// Get supported chains for a platform
const chains = sdk.getSupportedChains(CrossSwapPlatform.LI_FI)
console.log('Supported chains:', chains)

// Get supported tokens for specific chains
const tokenMap = await sdk.getSupportedTokens(CrossSwapPlatform.LI_FI, [ChainId.SOL_LI_FI])
console.log('Supported tokens:', tokenMap[ChainId.SOL_LI_FI])

// Get specific token information
const token = await sdk.getCrossSwapToken(
  CrossSwapPlatform.LI_FI,
  ChainId.SUI_LI_FI,
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
)
```

### Estimating Quotes

```typescript
import { ChainId } from '@cetusprotocol/CrossSwap-sdk'
import { toDecimalsAmount } from '@cetusprotocol/common-sdk'

// Estimate quote for cross-chain swap
const quote = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
  amount: toDecimalsAmount('2', 9).toString(),
  from_token: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  to_token: '0x0000000000000000000000000000000000000000',
  from_chain_id: ChainId.SUI_LI_FI,
  to_chain_id: ChainId.POL,
  slippage: 0.05,
  lifi_configs: {
    from_address: 'your_sui_address',
    to_address: 'your_evm_address',
  },
})

console.log('Quote:', quote)
```

### Executing Cross-Chain Swaps

#### LiFi Swaps

```typescript
// Execute LiFi swap
const executedRoute = await sdk.executeSwapQuoteFromLiFi(
  {
    quote: quote.quotes[0],
    swap_wallet_address: 'your_sui_address',
    destination_address: 'your_evm_address',
  },
  {
    updateRouteHook(route) {
      console.log('Route updated:', route)
    },
  }
)
```

#### Mayan Swaps

```typescript
// Build swap payload for Mayan
const payload = await sdk.buildCrossSwapResult({
  quote: quote.quotes[0],
  swap_wallet_address: 'your_sui_address',
  destination_address: 'your_evm_address',
})

// Execute the swap
if (payload.sui) {
  const result = await sdk.FullClient.executeTx(keypair, payload.sui, true)
  console.log('Swap executed:', result)
}

if (payload.evm) {
  console.log(`View transaction: https://explorer.mayan.finance/swap/${payload.evm.hash}`)
}
```

### Checking Token Balances

```typescript
// Get token balances for a wallet
const tokens = await sdk.getSupportedTokens(CrossSwapPlatform.MAYAN, [ChainId.SOL_MAYAN])
const balances = await sdk.getOwnerTokenBalances(
  CrossSwapPlatform.MAYAN,
  '3kTFG1MTm2VG4DHeNpqby7EkMqCWF2eeetxnKU9pG5x4',
  tokens[ChainId.SOL_MAYAN]
)
console.log('Token balances:', balances)
```

## Supported Chains

### LiFi Platform
- **EVM Chains**: Ethereum, Polygon, Arbitrum, Optimism, BSC, Avalanche, and more
- **Solana**: Native Solana support
- **Sui**: Native Sui support
- **Bitcoin**: BTC support

### Mayan Platform
- **EVM Chains**: Ethereum, Polygon, Arbitrum, Optimism, and more
- **Solana**: Native Solana support
- **Sui**: Native Sui support


## Advanced Configuration

### SDK Options
```typescript
const sdk = CetusCrossSwapSDK.createSDK({
  env: 'mainnet',
  mayan: {
    referrer_addresses: {
      solana: 'your_solana_address',
      sui: 'your_sui_address',
      evm: 'your_evm_address',
    },
    referrer_bps: 30, // 0.3% referrer fee (max: 50 bps)
  },
  lifi: {
    integrator: 'your_integrator_id',
    api_key: 'your_api_key', // Optional
    referrer_bps: 30, // 0.3% referrer fee
  },
})
```

## Examples

### Complete Cross-Chain Swap Example

```typescript
import { CetusCrossSwapSDK, CrossSwapPlatform, ChainId } from '@cetusprotocol/CrossSwap-sdk'
import { toDecimalsAmount } from '@cetusprotocol/common-sdk'

async function performCrossChainSwap() {
  // Initialize SDK
  const sdk = CetusCrossSwapSDK.createSDK({ env: 'mainnet' })
  
  // Configure platforms (setup your wallets first)
  // ... wallet configuration code ...
  
  // Estimate quote
  const quote = await sdk.estimateQuote(CrossSwapPlatform.LI_FI, {
    amount: toDecimalsAmount('1', 9).toString(),
    from_token: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    to_token: '0x0000000000000000000000000000000000000000',
    from_chain_id: ChainId.SUI_LI_FI,
    to_chain_id: ChainId.POL,
    slippage: 0.05,
    lifi_configs: {
      from_address: 'your_sui_address',
      to_address: 'your_polygon_address',
    },
  })
  
  if (quote.error) {
    console.error('Quote error:', quote.error)
    return
  }
  
  // Execute swap
  const result = await sdk.executeSwapQuoteFromLiFi({
    quote: quote.quotes[0],
    swap_wallet_address: 'your_sui_address',
    destination_address: 'your_polygon_address',
  })
  
  console.log('Swap completed:', result)
}
```

## Platform Documentation

For more detailed information about the supported cross-chain platforms:

- **[LiFi Documentation](https://li.fi/)** - Learn about LiFi's cross-chain bridging capabilities and features
- **[Mayan Finance Documentation](https://mayan.finance/)** - Explore Mayan's cross-chain swap platform and services

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT

