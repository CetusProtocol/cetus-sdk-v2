# Collect rewards

When you provide liquidity within a valid price range, when transactions occurring within this range, the rewards will be distributed every second based on the proportional share of effective liquidity from all positions within the current range. If you intend to harvest rewards separately, please follow the method below.

## 1. Collect rewards

Use `sdk.Position.collectRewarderPayload()` method.

### Function Parameters

- `pool_id`: The object id about which pool you want to operation
- `pos_id`: The object id about which position you want to operation
- `coin_type_a`: The coin type address about coinA
- `coin_type_b`: The coin type address about coinB
- `collect_fee`: you can select weather collect fees while Collect rewards.
- `rewarder_coin_types`: If these not empty, it will collect rewarders in this position, if you already open the position. You can even determine which types of rewards you want to harvest by specifying the coin types you pass.

### Example

```typescript
const pool = await sdk.Pool.getPool(pool_id)

const reward_coin_types = pool.rewarder_infos.map((rewarder) => rewarder.coin_type)

const collect_rewarder_params: CollectRewarderParams = {
  pool_id: pool.id,
  pos_id,
  rewarder_coin_types: reward_coin_types,
  coin_type_a: pool.coin_type_a,
  coin_type_b: pool.coin_type_b,
  collect_fee: true,
}

const collect_rewarder_payload = await sdk.Rewarder.collectRewarderPayload(collect_rewarder_params)
const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'
const transfer_txn = await sdk.FullClient.executeTx(send_key_pair, collect_rewarder_payload, true)
```
