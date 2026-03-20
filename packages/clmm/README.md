<a name="readme-top"></a>

![NPM](https://img.shields.io/npm/l/%40cetusprotocol%2Fsui-clmm-sdk?registry_uri=https%3A%2F%2Fregistry.npmjs.com&style=flat&logo=npm&logoColor=blue&label=%40cetusprotocol&labelColor=rgb&color=fedcba&cacheSeconds=3600&link=https%3A%2F%2Fwww.npmjs.com%2Fpackage%2F%40cetusprotocol%2Fsui-clmm-sdk)
![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fsui-clmm-sdk?logo=npm&logoColor=rgb)
![GitHub Repo stars](https://img.shields.io/github/stars/CetusProtocol/cetus-sdk-v2?logo=github)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a >
    <img src="https://archive.cetus.zone/assets/image/logo.png" alt="Logo" width="100" height="100">
  </a>

  <h3 align="center">Cetus-CLMM-SUI-SDK</h3>

  <p align="center">
    Integrating Cetus-CLMM-SUI-SDK: A Comprehensive Guide, Please see details in document.
    <br />
    <a href="https://cetus-1.gitbook.io/cetus-developer-docs/developer/dev-overview"><strong>Explore the document »</strong></a>
<br />
    <br />
  </p>
</div>

## Introduction

Cetus-CLMM-SUI-SDK is the official software development kit (SDK) specifically designed for seamless integration with Cetus-CLMM. It provides developers with the necessary tools and resources to easily connect and interact with Cetus-CLMM, enabling the development of robust and efficient applications.

## Getting Started

To integrate our SDK into your local project, please follow the example steps provided below.
Please see details in document.

### Prerequisites

```sh
npm i @cetusprotocol/sui-clmm-sdk
```

## SDK Initialization

The SDK provides a convenient initialization method `src/config/initCetusSDK` for quick setup and configuration of the Cetus SDK.

### Network Options

- `mainnet` (Production Network)
- `testnet` (Test Network)

### Important Note

Before performing swaps or other asset-related operations, ensure:

- A wallet is properly configured
- The wallet has sufficient token balance for the intended operation

```typescript
import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk'
```

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusClmmSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusClmmSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiJsonRpcClient, you can do so as follows:

```typescript
const sdk = CetusClmmSDK.createSDK({ env, sui_client })
//or
const sdk = CetusClmmSDK.createSDK({ env, full_rpc_url })
```

**After linking your wallet, if you need use your wallet address to do something, you should set it by `CetusClmmSDK.setSenderAddress("YOUR_SUI_ADDRESS_HERE")`**

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

Now, you can start using Cetus SDK.

### Typescript Doc

You can view this typescript sdk in
<a href="https://cetus-1.gitbook.io/cetus-developer-docs/developer/dev-overview"><strong> Cetus Development Documents. </strong></a>
<br />

## LICENSE

CETUS-SUI-SDK released under the Apache license. See the [LICENSE](./LICENSE) file for details.

## More About Cetus

Use the following links to learn more about Cetus:
Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).
