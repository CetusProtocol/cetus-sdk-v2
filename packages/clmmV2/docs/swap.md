# Swap

Swaps typically occur in two steps:

1. The first step involves pre-calculating the potential result of the current transaction
2. The second step is to set the slippage based on the pre-calculated results, followed by executing the transaction

## Swap after preSwap

After pre-calculating, you can perform a swap. For a more detailed understanding of the pre-swap process and its intricacies, additional information is available [here](pre_swap.md).

### Function input parameters

Please refer to the original function for specific parameter types.

- `pool_id`: pool object id, you can get it by pre-calculating
- `coin_type_a`: the coin type address about coinA
- `coin_type_b`: the coin type address about coinB
- `a2b`: swap direction, true means swap from coinA to coinB, false means swap from coinB to CoinA
- `by_amount_in`: true means fixed the amount of input, false means fixed the amount of output
- `amount`: the amount of input (byAmountIn = true) or output (byAmountIn = false)
- `amount_limit`: the amount limit of coin what you get. There are two scenarios in amount limit:
  - When `by_amount_in` equals true: amount limit means minimum number of outputs required to be obtained
  - When `by_amount_in` equals false: it means maximum number of input coin
- `partner`: The partner address. If you do not have a partner, simply leave the partner field unset

### Important Notes

- This is the amount out of result after slippage adjustment. Use `adjustForSlippage` to calculate the limit of amount out
- If you set amount limit equal 0, when you trade during extremely volatile price fluctuations, you might end up with a very small trading outcome. The `amount_limit` will help prevent your assets from incurring losses
- You can get more details in these [Partner swap](partner_swap.md) parts

### Example

```typescript
const a2b = true
// fix input token amount
const coin_amount = new BN(120000)
const by_amount_in = true
// slippage value
const slippage = Percentage.fromDecimal(d(5))

// Fetch pool data
const pool = await sdk.Pool.getPool(pool_id)

// Estimated amountIn amountOut fee
const res: any = await sdk.Swap.preSwap({
  pool_id: pool.id,
  current_sqrt_price: pool.current_sqrt_price,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  decimals_a: 6, // coin a 's decimals
  decimals_b: 8, // coin b 's decimals
  a2b,
  by_amount_in, // fix token a amount
  amount,
})

const partner = '0x8e0b7668a79592f70fbfb1ae0aebaf9e2019a7049783b9a4b6fe7c6ae038b528'

const to_amount = by_amount_in ? res.estimated_amount_out : res.estimated_amount_in
const amount_limit = adjustForSlippage(to_amount, slippage, !by_amount_in)

// build swap Payload
const swap_payload = sdk.Swap.createSwapPayload({
  pool_id: pool.id,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  a2b: a2b,
  by_amount_in,
  amount: res.amount.toString(),
  amount_limit: amount_limit.toString(),
  swap_partner: partner,
})

const swap_txn = await sdk.fullClient.sendTransaction(signer, swap_payload)
```

## Swap without transfer coins

This method supports returning two coins for user to build PTB.

### Function input parameters

Please refer to the original function for specific parameter types.

- `pool_id`: pool object id, you can get it by pre-calculating
- `coin_type_a`: the coin type address about coinA
- `coin_type_b`: the coin type address about coinB
- `a2b`: swap direction, true means swap from coinA to coinB, false means swap from coinB to CoinA
- `by_amount_in`: true means fixed the amount of input, false means fixed the amount of output
- `amount`: the amount of input (byAmountIn = true) or output (byAmountIn = false)
- `amount_limit`: the amount limit of coin what you get. There are two scenarios in amount limit:
  - When `by_amount_in` equals true: amount limit means minimum number of outputs required to be obtained
  - When `by_amount_in` equals false: it means maximum number of input coin
- `partner`: The partner address. If you do not have a partner, simply leave the partner field unset

### Important Notes

- This is the amount out of result after slippage adjustment. Use `adjustForSlippage` to calculate the limit of amount out
- If you set amount limit equal 0, when you trade during extremely volatile price fluctuations, you might end up with a very small trading outcome. The `amount_limit` will help prevent your assets from incurring losses
- You can get more details in these [Partner swap](#) parts

### Example

```typescript
// Whether the swap direction is token a to token b
const a2b = true
// fix input token amount
const amount = new BN(120000)
// input token amount is token a
const by_amount_in = true
// slippage value
const slippage = Percentage.fromDecimal(d(5))

// Fetch pool data
const pool = await sdk.Pool.getPool(pool_id)

// Estimated amountIn amountOut fee
const res: any = await sdk.Swap.preSwap({
  pool_id: pool,
  current_sqrt_price: pool.current_sqrt_price,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  decimals_a: 6, // coin a 's decimals
  decimals_b: 8, // coin b 's decimals
  a2b,
  by_amount_in,
  amount,
})

const partner = '0x8e0b7668a79592f70fbfb1ae0aebaf9e2019a7049783b9a4b6fe7c6ae038b528'

const to_amount = by_amount_in ? res.estimated_amount_out : res.estimated_amount_in
const amount_limit = adjustForSlippage(toAmount, slippage, !by_amount_in)

// build swap Tx
const swap_payload = sdk.Swap.createSwapWithoutTransferCoinsPayload({
  pool_id: pool.id,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  a2b: a2b,
  by_amount_in,
  amount: res.amount.toString(),
  amount_limit: amount_limit.toString(),
  swap_partner: partner,
})
const { tx, coin_ab_s } = swap_payload
// transfer coin a and coin b
tx.transferObjects(coins, tx.pure.address(recipient))

const transfer_txn = await sdk.fullClient.sendTransaction(signer, swap_payload)
```
