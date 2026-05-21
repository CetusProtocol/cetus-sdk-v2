# @cetusprotocol/dca-sdk

**DCA (Dollar-Cost Averaging)** is an efficient and low-risk investment strategy, particularly suitable for markets with high volatility. By using the **DCA SDK**, developers can easily integrate this strategy into their applications, helping users achieve long-term, stable investment growth. Through automation and regular investments, the **DCA SDK** helps users reduce the impact of short-term market fluctuations, leading to better investment outcomes.

## Getting Started

## How to Use the Dca SDK ?

### Installation

To start using the `Dca SDK`, you first need to install it in your TypeScript project:

npm link: <https://www.npmjs.com/package/@cetusprotocol/dca-sdk>

```bash
npm install @cetusprotocol/dca-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusDcaSDK } from '@cetusprotocol/dca-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusDcaSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusDcaSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiGrpcClient, you can do so as follows:

```typescript
const sdk = CetusDcaSDK.createSDK({ env, sui_client })
// or
const sdk = CetusDcaSDK.createSDK({ env, full_rpc_url })
```

## Features & Usage

After linking your wallet, you need to set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

### Open Dca Order

```typescript
const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
const out_coin_type = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
const cycle_count = 4
const in_coin_amount = '40000000000'
const cycle_count_amount = new Decimal(in_coin_amount).div(Math.pow(10, 9)).div(cycle_count)
const min_price = 0.83854
const max_price = 2.172898
const per_cycle_max_out_amount = d(cycle_count_amount).div(d(min_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
const per_cycle_min_out_amount = d(cycle_count_amount).div(d(max_price)).mul(Math.pow(10, 6)).toFixed(0).toString()

const payload = await sdk.Dca.dcaOpenOrderPayload({
  in_coin_type,
  out_coin_type,
  in_coin_amount,
  cycle_frequency: 600,
  cycle_count,
  per_cycle_min_out_amount,
  per_cycle_max_out_amount,
  per_cycle_in_amount_limit: '9744545',
  fee_rate: 0,
  timestamp: 1723719298,
  signature: '004f1929446176bc982043113c7be68d3bf2bdf9bb7f19bcf8cbc4e9d3db8172902a4a60a08405b0acbc5d367b54714...',
})
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
const result = await sdk.FullClient.sendTransaction(send_key_pair, payload)
```

### Get DCA order by order Id

```typescript
const order_id = '0xfba94aa36e93ccc7d84a...'
const dca_order = await sdk.Dca.getDcaOrders(order_id)
```

### Withdraw DCA order

```typescript
const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
const out_coin_type = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
const order_id = '0xa60c763185a84b87380a0a1e7e677...'

const withdraw_payload = await sdk.Dca.withdrawPayload({
  in_coin_type,
  out_coin_type,
  order_id,
})
const result = await sdk.FullClient.sendTransaction(send_key_pair, withdraw_payload)
```

### Close DCA order

```typescript
const order_id = '0xfc519e9cccf90f4dfdf3008e529...'
const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
const out_coin_type = '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'

const dca_close_order_payload = await sdk.Dca.dcaCloseOrderPayload([
  {
    order_id,
    in_coin_type,
    out_coin_type,
  },
])
const result = await sdk.FullClient.sendTransaction(send_key_pair, dca_close_order_payload)
```

### Query DCA order transaction history by order Id

```typescript
const order_id = '0x45b567654b09d291f3c99566922b7...'

const list = await sdk.Dca.getDcaOrdersMakeDeal(order_id)
```

### Query DCA token whitelist

whitelist_mode = 0 , Disable whitelist mode.
whitelist_mode = 1 , Enable whitelist mode for in_coin only.
whitelist_mode = 2 , Enable whitelist mode for out_coin only.
whitelist_mode = 3 , Enable whitelist mode for both in_coin and out_coin.

```typescript
const whitelist_mode = 3

const whiteList = await sdk.Dca.getDcaCoinWhiteList(whitelist_mode)
```

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
