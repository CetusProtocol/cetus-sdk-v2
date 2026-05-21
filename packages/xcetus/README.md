# @cetusprotocol/xcetus-sdk

## xCETUS Overview

**Platform equity tokens** are non-circulating currencies and cannot be transferred by default. These tokens are recorded in the user's **veNFT** account as points.

### How to Obtain xCETUS

1. **Convert 1 CETUS to 1 xCETUS Mint**
2. **LP NFT lock-up mining rewards** released.

### Transfer of xCETUS

- xCETUS can be transferred under certain conditions.
- To prevent special circumstances, only the platform has the permission to transfer xCETUS.

---

## veNFT Overview

**veNFT** stores xCETUS in a **non-transferable** form under the user account.

### Benefits of Holding xCETUS

- Holding xCETUS allows participation in **Cetus reward dividends**.
- Dividends are distributed based on the proportion of xCETUS in the wallet's veNFT account relative to the total xCETUS in the market.

## Getting Started

## How to Use the Burn SDK ?

## Installation

To start using the `xcetus SDK`, you first need to install it in your TypeScript project:

Github Link: <https://github.com/CetusProtocol/xcetus-sdk>

NPM Link: [@cetusprotocol/xcetus-sdk](https://www.npmjs.com/package/@cetusprotocol/xcetus-sdk)

```bash
npm install @cetusprotocol/xcetus-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusXcetusSDK } from '@cetusprotocol/xcetus-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusXcetusSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusXcetusSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiGrpcClient, you can do so as follows:

```typescript
const sdk = CetusXcetusSDK.createSDK({ env, sui_client })
// or
const sdk = CetusXcetusSDK.createSDK({ env, full_rpc_url })
```

## Usage

After linking your wallet, if you need use your wallet address to do something, you should set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

### 1. getOwnerVeNFT

Gets the VeNFT object for the specified account address.

```typescript
const owner_venft = await sdk.XCetusModule.getOwnerVeNFT(wallet)

// ownerVeNFT
{
  creator: 'Cetus',
  description: "A non-transferrable NFT storing Cetus Escrowed Token xCETUS that represents a user's governance power on Cetus Protocol.",
  image_url: 'https://x77unmxbojk6nincdlzd57hhk5qgp5223rrrxrsplqqcs23vu5ja.arweave.net/v_9GsuFyVeahohryPvznV2Bn91rcYxvGT1wgKWt1p1I',
  link: 'https://app.cetus.zone',
  name: 'Cetus veNFT #14562',
  project_url: 'https://www.cetus.zone',
  id: '0x12adbc7e726cf2a5a9d4c4f0bdd08b6a49c876be99b2e650778a68d3891584bc',
  index: '14562',
  type: '0x9e69acc50ca03bc943c4f7c5304c2a6002d507b51c11913b247159c60422c606::xcetus::VeNFT',
  xcetus_balance: '1000000000'
}

```

### 2. getOwnerRedeemLockList.

Gets the list of LockCetus objects owned by the specified account address.

```typescript
const redeem_lock_list = await sdk.XCetusModule.getOwnerRedeemLockList(wallet)

// redeem_lock_list
redeem_lock_list: [
  {
    id: '0x005ba9202a5d9e41c73155a1b4e47...',
    type: '0x9e69acc50ca03bc943c4f7c5304c2a6002d507b51c11913b247159c60422c606::lock_coin::LockedCoin<0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS>',
    locked_start_time: 1730442744,
    locked_until_time: 1745994744,
    cetus_amount: '500000000',
    xcetus_amount: '500000000',
    lock_day: 180,
  },
]
```

### 3. Convert Cetus to Xcetus

```typescript
const venft_id = 'YOUR_VENFT_ID'

const payload = await sdk.XCetusModule.convertPayload({
  amount: '10000000000',
  venft_id,
})
```

### 4. redeemLock

```typescript
const lock_day = 15
const amount_input = 20000
const amount = await sdk.XCetusModule.redeemNum(amount_input, lock_day)

sdk.XCetusModule.redeemLockPayload({
  venft_id,
  amount,
  lock_day,
})
```

### 5. redeem

```typescript
const lock_id = '0x005ba9202a5d9e41c73155a1b4e47...'
const lock_cetus = await sdk.XCetusModule.getLockCetus(lock_id)

if (lock_cetus && !XCetusUtil.isLocked(lock_cetus)) {
  const payload = sdk.XCetusModule.redeemPayload({
    venft_id,
    lock_id,
  })
}
```

### 6.redeemDividendV3Payload

```typescript
const venft_dividend_info = await sdk.XCetusModule.getVeNFTDividendInfo(venft_id)

if (venft_dividend_info) {
  const payload = await sdk.XCetusModule.redeemDividendV3Payload(venft_id, venft_dividend_info.rewards)
}
```

### 7. cancelRedeemPayload

```typescript
const lock_id = '0x005ba9202a5d9e41c73155a1...'
const lock_cetus = await sdk.XCetusModule.getLockCetus(lock_id)

if (lock_cetus && XCetusUtil.isLocked(lock_cetus)) {
  const payload = sdk.XCetusModule.cancelRedeemPayload({
    venft_id,
    lock_id,
  })
}
```

### 7. getVeNFTDividendInfo

```typescript
const dividend_manager = await sdk.XCetusModule.getDividendManager()
const venft_dividend_info = await sdk.XCetusModule.getVeNFTDividendInfo(dividend_manager.venft_dividends.id)
```

### 8. redeemNum

```typescript
const lock_day = 15
const amount_input = 20000

const amount = await sdk.XCetusModule.redeemNum(amount_input, lock_day)
```

### 9. reverseRedeemNum

```typescript
const lock_day = 15
const amount_input = 20000

const amount = await sdk.XCetusModule.reverseRedeemNum(amount_input, lock_day)
```

### 10. getXCetusAmount

```typescript
const lock_id = '0x005ba9202a5d9e41c73155a1b...'

const amount = await sdk.XCetusModule.getXCetusAmount(lock_id)
```

### 11. getPhaseDividendInfo

```typescript
const phase_dividend_info = await sdk.XCetusModule.getPhaseDividendInfo('10')
```

### 12. getXcetusManager & getVeNftAmount

```typescript
const owner_venft = await sdk.XCetusModule.getOwnerVeNFT(wallet)

if (owner_venft) {
  const xcetus_manager = await sdk.XCetusModule.getXcetusManager()
  const venft_amount = await sdk.XCetusModule.getVeNftAmount(xcetus_manager.nfts.handle, owner_venft.id)

  const rate = d(owner_venft.xcetus_balance).div(xcetus_manager.treasury)
}
```

## Contract Error Codes

the Cetus smart contract may return the following error codes:

| Module    | Error Code | Description                                                                  | Contract Methods                                                    |
| --------- | ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| lock_coin | 0          | The lock time must be greater than the current time                          | lock_coin                                                           |
| lock_coin | 1          | The lock period has not ended                                                | unlock_coin                                                         |
| locking   | 1          | Insufficient XCetus balance                                                  | redeem_lock                                                         |
| locking   | 2          | Locking period for XCetus is out of allowed range                            | redeem_lock                                                         |
| locking   | 3          | Invalid redeemable XCetus amount                                             | redeem_lock                                                         |
| locking   | 4          | veNFT does not match the associated LockedCoin                               | cancel_redeem_lock, redeem                                          |
| locking   | 5          | LockCoin has expired; locking has ended                                      | cancel_redeem_lock                                                  |
| locking   | 7          | Unauthorized treasury manager                                                | redeem_treasury                                                     |
| locking   | 8          | The version of the contract has been deprecated                              | The vast majority of methods                                        |
| xcetus    | 1          | XCetus balance is not zero                                                   | burn_venft                                                          |
| xcetus    | 5          | The address already has a VeNFT                                              | burn_lp                                                             |
| xcetus    | 6          | XCetus in unlocking process is not zero                                      | request_transfer_venft_by_admin, approve_transfer_venft, mint_venft |
| xcetus    | 7          | VeNFT does not exist                                                         | approve_transfer_venft                                              |
| xcetus    | 8          | Transfer request already exists                                              | request_transfer_venft_by_admin                                     |
| xcetus    | 9          | Transfer request does not exist                                              | approve_transfer_venft, cancel_transfer_venft_request_by_admin      |
| xcetus    | 10         | TransferVeNFTRequest does not match the VeNFT                                | approve_transfer_venft                                              |
| xcetus    | 11         | The destination address is inconsistent with the one in TransferVeNFTRequest | approve_transfer_venft                                              |

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
