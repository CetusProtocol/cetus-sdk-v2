# @cetusprotocol/limit-sdk

**Cetus Limit Order SDK** is a powerful tool that enables developers to integrate **limit order trading functionality** into their applications. With this SDK, users can place orders at a specific price, ensuring more control over their trades compared to market orders.

## Getting Started

## How to Use the Limit SDK ?

### Installation

To start using the `Limit SDK`, you first need to install it in your TypeScript project:

npm link: <https://www.npmjs.com/package/@cetusprotocol/limit-sdk>

```bash
npm install @cetusprotocol/limit-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusLimitSDK } from '@cetusprotocol/limit-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusLimitSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusLimitSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiGrpcClient, you can do so as follows:

```typescript
const sdk = CetusLimitSDK.createSDK({ env, sui_client })
// or
const sdk = CetusLimitSDK.createSDK({ env, full_rpc_url })
```

## Features & Usage

After linking your wallet, if you need use your wallet address to do something, you should set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

### Place a limit order

```typescript
const pool = {
  pay_coin_type: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC',
  target_coin_type: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdt::USDT',
  indexer_id: '0xc420fb32c3dd279d20b55daeb08973e577df5fed1b758b839d4eec22da54bde8',
}
const LimitOrderStatus = {
  Running: 'Running',
  PartialCompleted: 'PartialCompleted',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
}
const pay_coin_amount = 2000000
const price = 1.7
const expired_ts = Date.parse(new Date().toString()) + 7 * 24 * 60 * 60 * 1000
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'

const payload = await sdk.LimitOrder.placeLimitOrder({
  pay_coin_amount,
  price,
  expired_ts,
  pay_coin_type: pool.pay_coin_type,
  target_coin_type: pool.target_coin_type,
  target_decimal: 6,
  pay_decimal: 6,
})

const tx_result = await sdk.FullClient.executeTx(send_key_pair, payload, false)
```

### Cancel a limit order

```typescript
const order = await sdk.LimitOrder.getLimitOrder('0xcadb63c2ffabd9ef7112cacb92304e660e2e...')
if (order && order.status === LimitOrderStatus.Running) {
  const payload = await sdk.LimitOrder.cancelOrdersByOwner([
    {
      order_id: order.id,
      pay_coin_type: order.pay_coin_type,
      target_coin_type: order.target_coin_type,
    },
  ])
  const tx_result = await sdk.FullClient.executeTx(send_key_pair, payload, false)
}
```

### Claim target coin

```typescript
const order = await sdk.LimitOrder.getLimitOrder('0x24aaffb2f9785c110da3b670e0...')
if (order && order.status === LimitOrderStatus.Running) {
  const payload = await sdk.LimitOrder.claimTargetCoin({
    order_id: order.id,
    pay_coin_type: order.pay_coin_type,
    target_coin_type: order.target_coin_type,
  })
  const tx_result = await sdk.FullClient.executeTx(send_key_pair, payload, false)
}
```

### Get the list of tokens that support limit orders

```typescript
const token_list = await sdk.LimitOrder.getLimitOrderTokenList()
```

### Get the list of limit order pools

```typescript
const pool_list = await sdk.LimitOrder.getLimitOrderPoolList()
```

### Get the limit order pool based on token pairs

```typescript
const pool = await sdk.LimitOrder.getLimitOrderPool(
  '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN'
)
```

### Get the indexer_id of limit order pool based on token pairs

```typescript
const id = await sdk.LimitOrder.getPoolIndexerId(
  '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN'
)
```

### Get the list of limit order by your wallet address

```typescript
const order_list = await sdk.LimitOrder.getOwnerLimitOrderList('0x0..')
```

### Get the limit order info by order id

```typescript
const order = await sdk.LimitOrder.getLimitOrder('0x24aaffb2f9785c110da3b670e0f50e8a30...')
```

### Get order operation log

```typescript
const order = await sdk.LimitOrder.getLimitOrderLogs('0x24aaffb2f9785c110da3b670e0f50e8a30...')
```

### Get the claim logs of the order

```typescript
const order = await sdk.LimitOrder.getLimitOrderClaimLogs('0x24aaffb2f9785c110da3b670e0f50e8a30...')
```

###

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
