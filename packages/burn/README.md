# @cetusprotocol/burn-sdk

The primary functionality of this project, referred to as "`LP Burn`," is designed for users who wish to permanently lock their liquidity positions. Once locked, the liquidity within these positions cannot be withdrawn; however, users can still claim any transaction fees and mining rewards generated from these positions. This locking mechanism is implemented by wrapping the original position, effectively sealing the liquidity while still allowing the accrual of rewards.

The `Burn SDK` is specifically tailored for projects that have established liquidity pools and wish to relinquish their liquidity rights. This feature enables these projects to demonstrate commitment to their community and ecosystem by permanently locking liquidity, thereby enhancing stability and fostering trust in the longevity of the liquidity pool.

## Getting Started

## How to Use the Burn SDK ?

### Installation

To start using the `Burn SDK`, you first need to install it in your TypeScript project. You can add it using npm, yarn, or bun:

npm link: <https://www.npmjs.com/package/@cetusprotocol/burn-sdk>

```bash
npm install @cetusprotocol/burn-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusBurnSDK } from '@cetusprotocol/burn-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusBurnSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusBurnSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiJsonRpcClient, you can do so as follows:

```typescript
const sdk = CetusBurnSDK.createSDK({ env, sui_client })
// or
const sdk = CetusBurnSDK.createSDK({ env, full_rpc_url })
```

## Usage

After linking your wallet, if you need use your wallet address to do something, you should set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

### 1. getBurnPoolList

This method retrieves a list of existing burn pools by calling `sdk.Burn.getBurnPoolList()`, then prints the result.

```typescript
const pool_ids = await sdk.Burn.getBurnPoolList()

// result:
pool_ids: [
  '0x2dea79f17e61f8d02ff02ed75510283...',
  '0x6fd4915e6d8d3e2ba6d81787046eb94...',
  '0xc41621d02d5ee00a7a993b912a8550d...',
  '0xaccdd1c40fdd6abf168def70044a565...',
  '0xc10e379b4658d455ee4b8656213c715...',
  '0x1861771ab3b7f0f6a4252e1c60ed270...',
  '0x1b9b4f2271bc69df97ddafcb3f64599...',
  '0x473ab0306ff8952d473b10bb4c3516c...',
  '0x3a61bd98686e4aa6213fb5b3b535645...',
]
```

### 2. getPoolBurnPositionList

This method fetches a list of burn positions for a specified pool ID by calling the `sdk.Burn.getPoolBurnPositionList(pool_id)`, then prints the result.

```typescript
const pool_id = '0x...'
const position_ids = await sdk.Burn.getPoolBurnPositionList(pool_id)

// result:
position_ids: [{
    id: '0x88678e4cd2681bf41b7f2afdd49c15...',
    url: 'https://bq7bkvdje7gvgmv66hrxdy7wx5h5ggtrrnmt66rdkkehb64rvz3q.arweave.net/DD4VVGknzVMyvvHj...',
    pool_id: '0xc41621d02d5ee00a7a993b912a8550d...',
    coin_type_a: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC',
    coin_type_b: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS',
    description: 'Cetus Liquidity Position',
    name: 'Cetus Burned LP | Pool9-115',
    liquidity: '19387676',
    clmm_position_id: '0x092f07a470479f86927fe161a53074b...',
    clmm_pool_id: '0xc41621d02d5ee00a7a993b912a8550d...',
    tick_lower_index: -443580,
    tick_upper_index: 443580,
    index: '115',
    is_lp_burn: true
},...]
```

### 3. getBurnPositionList

This method fetches a list of burn positions for a specified account by calling the `sdk.Burn.getBurnPositionList(account_address)` method.

```typescript
const account_address = '0x...'
const position_ids = await sdk.Burn.getBurnPositionList(account_address)

// result:
positionIds: ['0x1b9b4f2271bc69df97ddafcb3f645...']
```

### 4. getBurnPosition

This method obtains detailed information about a specific burn position by calling the `sdk.Burn.getBurnPosition(pos_id)` method, where pos_id is the specified burn position ID, and prints the result.

```typescript
const pos_id = '0x...'
const position_info = await sdk.Burn.getBurnPosition(pos_id)

// result:
position_info: {
    id: '0x88678e4cd2681bf41b7f2afdd49c15...',
    url: 'https://bq7bkvdje7gvgmv66hrxdy7wx5h5ggtrrnmt66rdkkehb64rvz3q.arweave.net/DD4VVGknzVMyvvHj...',
    pool_id: '0xc41621d02d5ee00a7a993b912a8550...',
    coin_type_a: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC',
    coin_type_b: '0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS',
    description: 'Cetus Liquidity Position',
    name: 'Cetus Burned LP | Pool9-115',
    liquidity: '19387676',
    clmm_position_id: '0x092f07a470479f86927fe161a5307...',
    clmm_pool_id: '0xc41621d02d5ee00a7a993b912a8550...',
    tick_lower_index: -443580,
    tick_upper_index: 443580,
    index: '115',
    is_lp_burn: true
}
```

### 5. burn lock

This method creates a transaction builder for a burn lock transaction.

```typescript
const pool_id = '0xc41621d02d5ee00a7a993b912a8550...'
const pos_id = '0x4e1970683fc49de834478339724509a05...' // is burn success
const coin_type_a = '26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
const coin_type_b = '26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS'
const txb = await sdk.Burn.createBurnPayload({
  pool_id,
  pos_id,
  coin_type_a,
  coin_type_b,
})

const simulate_res = await sdk.FullClient.devInspectTransactionBlock({
  transactionBlock: txb,
  sender: account,
})
```

### 6. claim

This method creates a transaction builder for fee collection.

```typescript
const pool_id = '0xc41621d02d5ee00a7a993b912a8550df...'
const pos_id = '0x2f10a5816747fd02218dd7a3a7d0417d28...' // is wrap pos id
const coin_type_a = '26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
const coin_type_b = '26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS'
const rewarder_coin_types = ['0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS']

let tx = sdk.Burn.createCollectFeePayload({
  pool_id,
  pos_id,
  coin_type_a,
  coin_type_b,
  account,
})

tx = sdk.Burn.createCollectRewardPayload({
  pool_id,
  pos_id,
  coin_type_a,
  coin_type_b,
  rewarder_coin_types,
  account,
})

const simulate_res = await sdk.FullClient.devInspectTransactionBlock({
  transactionBlock: txb,
  sender: account,
})
```

### 7. batch claim

This method creates a transaction builder for batch fee collection.

```typescript
const pool_id = '0xc41621d02d5ee00a7a993b912a855...'
const pos_id = '0x2f10a5816747fd02218dd7a3a7d0417d...' // is wrap pos id
const coin_type_a = '26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::usdc::USDC'
const coin_type_b = '26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS'
const rewarder_coin_types = ['0x26b3bc67befc214058ca78ea9a2690298d731a2d4309485ec3d40198063c4abc::cetus::CETUS']

let tx = sdk.Burn.createCollectFeesPayload([{
  pool_id,
  pos_id,
  coin_type_a,
  coin_type_b,
  account,
}, ...])

tx = sdk.Burn.createCollectRewardsPayload([{
  pool_id,
  pos_id,
  coin_type_a,
  coin_type_b,
  rewarder_coin_types,
  account,
}, ...])

const simulate_res = await sdk.FullClient.devInspectTransactionBlock({
  transactionBlock: txb,
  sender: account,
})
```

### 8. burn LP position

When the position is burned, a CetusLPBurnProof will be returned. Compared to the `burn_lp` function, this V2 version does not require the pool object as a parameter, making it more convenient to use. The function will automatically verify the position's validity through the position object itself. This design also enables users to create a pool, add liquidity, and burn the position all within a single transaction.

```typescript
const pos_id = '0x4e1970683fc49de834478339724509...' // is burn success
const txb = await sdk.Burn.createBurnLPV2Payload(pos_id)

const simulate_res = await sdk.FullClient.devInspectTransactionBlock({
  transactionBlock: txb,
  sender: account,
})
```

### 9. redeem vest

This method creates a transaction builder for redeeming vested tokens. Here's an example of how to use it:

```typescript
// Get burn position details
const burn_position_id = '0x4e745334f8899a2b8854c791865e9...'
const burnPosition = await sdk.Burn.getBurnPosition(burn_position_id)

// Create redeem vest payload
const tx = sdk.Burn.redeemVestPayload([
  {
    clmm_versioned_id: '0x8d1b965923331fa3f782.....', // Sourced from clmm sdk sdkOptions
    clmm_vester_id: '0xbe3a49c92cc31f063418aa24....', // Sourced from clmm sdk sdkOptions
    clmm_pool_id: burnPosition!.pool_id,
    burn_position_id: burn_position_id,
    period: 0,
    coin_type_a: burnPosition!.coin_type_a,
    coin_type_b: burnPosition!.coin_type_b,
  },
])

// Execute the transaction
const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
```

This method allows users to redeem their vested tokens from a burn position. The process involves:
1. Retrieving the burn position details
2. Creating a redeem vest payload with the necessary parameters
3. Executing the transaction to claim the vested tokens

## Contract Error Codes

the Cetus smart contract may return the following error codes:

| Module  | Error Code | Description                                                                | Contract Methods             |
| ------- | ---------- | -------------------------------------------------------------------------- | ---------------------------- |
| lp_burn | 1          | The version of the contract has been deprecated                            | The vast majority of methods |
| lp_burn | 2          | The current liquidity position does not fully cover the entire price range | burn_lp_v2                   |
| lp_burn | 3          | The current liquidity position does not belong to this pool                | burn_lp                      |

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
