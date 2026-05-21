# @cetusprotocol/vaults-sdk

The SDK provides a Vaults module for automated liquidity management. This module enables users to automatically manage their liquidity positions, including timely reinvestment of fees and rewards, as well as rebalancing when necessary. When users deposit tokens into Vaults, these tokens are used to provide liquidity within the positions held by Vaults, and LP tokens are minted to represent their share of the liquidity.

## Getting Started

## How to Use the Vaults SDK ?

### Installation

To start using the `Vaults SDK`, you first need to install it in your TypeScript project:

npm link: <https://www.npmjs.com/package/@cetusprotocol/vaults-sdk>

```bash
npm install @cetusprotocol/vaults-sdk
```

### Setup

Import the SDK into the TypeScript file where you intend to use it:

```typescript
import { CetusVaultsSDK } from '@cetusprotocol/vaults-sdk'
```

### Initializing the SDK

Initialize the SDK with the required configuration parameters. This typically includes setting up the network and API keys, if needed.

If you would like to use the mainnet network and the official Sui rpc url, you can do so as follows:

```typescript
const sdk = CetusVaultsSDK.createSDK()
```

If you wish to set your own full node URL or network (You have the option to select either 'mainnet' or 'testnet' for the network), you can do so as follows:

```typescript
const env = 'mainnet'
const full_rpc_url = 'YOUR_FULL_NODE_URL'
const wallet = 'YOUR_WALLET_ADDRESS'

const sdk = CetusVaultsSDK.createSDK({ env })
```

If you wish to set your own full node URL or SuiGrpcClient, you can do so as follows:

```typescript
const sdk = CetusVaultsSDK.createSDK({ env, sui_client })
// or
const sdk = CetusVaultsSDK.createSDK({ env, full_rpc_url })
```

## Usage

After linking your wallet, if you need use your wallet address to do something, you should set it by `sdk.setSenderAddress`.

```typescript
const wallet = 'YOUR_WALLET_ADDRESS'

sdk.setSenderAddress(wallet)
```

if you need to change your rpc url, you can do so as follows:

```typescript
const new_rpc_url = 'YOUR_NEW_FULL_NODE_URL'

sdk.updateFullRpcUrl(new_rpc_url)
```

### 1. Get Vaults by Owner Address

This method retrieves all vaults associated with a specific owner address.

```typescript
const owner = '0x...'
const vaults_result = await sdk.Vaults.getOwnerVaultsBalance(owner)

// result
[
  {
    vault_id: '0x5732b81e659bd2db47a5b55755743dde15be99490a39717abc80d62ec812bcb6',
    clmm_pool_id: '0x6c545e78638c8c1db7a48b282bb8ca79da107993fcb185f75cedc1f5adb2f535',
    owner: '0x...',
    lp_token_type: '0xb490d6fa9ead588a9d72da07a02914da42f6b5b1339b8118a90011a42b67a44f::lp_token::LP_TOKEN',
    lp_token_balance: '739242144247',
    liquidity: '799210772591',
    tick_lower_index: 100,
    tick_upper_index: 394,
    amount_a: '5514867803',
    amount_b: '6197505499',
    coin_type_a: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
    coin_type_b: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
  },
  // ...more vaults
]
```

### 2. Get Vault by ID

This method retrieves detailed information about a specific vault.

```typescript
const vault_id = 'YOUR_VAULT_ID'

const vault = await sdk.Vaults.getVault(vault_id)
```

### 3. Get Vault Asset

This method retrieves the LP token balance for a specific vault.

```typescript
const ft_asset = await sdk.getOwnerCoinBalances('0x0..', vault?.lp_token_type)
```

### 4. Deposit Operations

Deposit liquidity into vaults. Users can deposit coinA and coinB, and the associated LP Token will be minted to the user.

```typescript
const input_amount = toDecimalsAmount(3, 9).toString()
const InputType = {
  Both: 'both',
  OneSide: 'oneSide',
}

// Calculate deposit amount
const result = await sdk.Vaults.calculateDepositAmount({
  vault_id,
  fix_amount_a: false,
  input_amount,
  slippage: 0.01,
  side: InputType.OneSide,
})
// Build and send transaction
const tx = new Transaction()
const params: DepositParams = {
  vault_id,
  slippage: 0.01,
  deposit_result: result,
  coin_object_b: VaultsUtils.buildCoinWithBalance(
    BigInt(input_amount),
    '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    tx
  ),
  return_lp_token: true,
}
const lp_coin = await sdk.Vaults.deposit(params, tx)
if (lp_coin) {
  tx.transferObjects([lp_coin], '0x0..')
}
```

### 5. Withdraw Operations

Withdraw liquidity from vaults. Users can withdraw their LP tokens and receive the underlying assets.

```typescript
/**
 * @param {Object} params - The parameters for the calculateWithdrawAmount function.
 * @param {string} params.vault_id - The ID of the vault.
 * @param {boolean} params.fix_amount_a - Whether to fix the amount of token A. If true, the input_amount represents token A amount; if false, it represents token B amount.
 * @param {string} params.input_amount - The input amount. If is_ft_input is true, this is the LP token amount; if false, this is the token amount (either A or B based on fix_amount_a).
 * @param {number} params.slippage - The slippage percentage (eg: 0.01 = 1%)
 * @param {boolean} params.is_ft_input - Whether the input is LP token. If true, input_amount is LP token amount; if false, input_amount is token amount.
 * @param {InputType} params.side - The withdrawal type. Both for withdrawing both tokens, OneSide for withdrawing a single token.
 * @param {string} params.max_ft_amount - The amount of LP tokens held by the user. In OneSide mode, this value is used to balance the withdrawal amount.
 */
const result = await sdk.Vaults.calculateWithdrawAmount({
  vault_id,
  fix_amount_a: true,
  input_amount: '1000000000',
  slippage: 0.01,
  is_ft_input: false,
  side: InputType.Both,
  max_ft_amount: '',
})

/**
 * @param {Object} params - The parameters for the withdraw function.
 * @param {string} params.vault_id - The ID of the vault.
 * @param {number} params.slippage - The slippage percentage (0-1).
 * @param {string} params.ft_amount - The amount of LP tokens to burn.
 * @param {string} params.return_coin - Optional. If set to true, returns the coin object. The user needs to handle it.
 */
const tx = new Transaction()
const { return_coin_a, return_coin_b } = await sdk.Vaults.withdraw(
  {
    vault_id,
    slippage: 0.01,
    ft_amount: result.burn_ft_amount,
    return_coin: true,
  },
  tx
)
if (return_coin_a) {
  tx.transferObjects([return_coin_a], sdk.senderAddress)
}
if (return_coin_b) {
  tx.transferObjects([return_coin_b], sdk.senderAddress)
}

const send_key_pair = 'THE_KEY_PAIR_GENERATED_BY_YOUR_PRIVATE_KEY'

const tx_result = await sdk.fullClient.sendTransaction(send_key_pair, payload)
```

### 6. Vest Operations

#### 6.1 Get Vault's Vest Information List

Get vest information for multiple vaults.

```typescript
const vestInfoList = await sdk.Vest.getVaultsVestInfoList([vaultId])
```

#### 6.2 Get Single Vault's Vest Information

Get vest information for a specific vault.

```typescript
async getVaultsVestInfo(vault_id: string, force_refresh = true): Promise<VaultsVestInfo>
```

#### 6.3 Get User's Vault Vest NFT List

Get all Vault Vest NFTs owned by the specified address. Each NFT contains the following information:
- id: NFT ID
- index: Index
- vault_id: Vault ID
- lp_amount: LP token amount
- redeemed_amount: Redeemed amount
- impaired_a: Token A impairment
- impaired_b: Token B impairment
- period_infos: Period information
- url: NFT URL
- name: NFT name
- vester_id: Vester ID

```typescript
const vestNFTList = await sdk.Vest.getOwnerVaultVestNFT(senderAddress)
```

#### 6.4 Build Redeem Transaction

Build the redeem transaction payload. Parameter description:
- options: Array of redeem options, each option contains:
  - vault_id: Vault ID
  - vesting_nft_id: Vesting NFT ID
  - period: Period
  - coin_type_a: Token A type
  - coin_type_b: Token B type
- tx: Optional transaction object

```typescript
 const vestInfo = await sdk.Vest.getVaultsVestInfo(vaultId)
const tx = await sdk.Vest.buildRedeemPayload([
  {
    vault_id: vaultId,
    vesting_nft_id: '0x...',
    period: 1,
    coin_type_a: vestInfo.coin_type_a,
    coin_type_b: vestInfo.coin_type_b,
  }
])

// Execute transaction
const transferTxn = await sdk.FullClient.executeTx(send_key_pair, tx, false)
```

### 7. Contract Error Codes

the Cetus smart contract may return the following error codes:

| Module         | Error Code | Description                          | Contract Methods                                                                                                      |
| -------------- | ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| vaults::vaults | 1          | Amount out below min limit           | remove                                                                                                                |
| vaults::vaults | 2          | Position size error                  | deposit，remove，reinvest，migrate_liquidity，rebalance，collect_fee，harvest，collect_rewarder，get_position_amounts |
| vaults::vaults | 3          | Package version deprecated           | checked_package_version                                                                                               |
| vaults::vaults | 4          | Token amount overflow                | deposit                                                                                                               |
| vaults::vaults | 5          | Token amount is zero                 | remove，deposit                                                                                                       |
| vaults::vaults | 6          | Pool is paused                       | take_harvest_asset_by_amount                                                                                          |
| vaults::vaults | 7          | Invalid coin type                    | migrate_liquidity                                                                                                     |
| vaults::vaults | 8          | Rebalance add liquidity error        | remove                                                                                                                |
| vaults::vaults | 9          | Token amount not enough              | remove                                                                                                                |
| vaults::vaults | 10         | Invalid protocol fee rate            | update_protocol_fee_rate                                                                                              |
| vaults::vaults | 11         | No protocol fee claim permission     | check_protocol_fee_claim_role                                                                                         |
| vaults::vaults | 12         | No operation manager permission      | check_reinvest_role，check_operation_role                                                                             |
| vaults::vaults | 13         | No pool manager permission           | check_pool_manager_role                                                                                               |
| vaults::vaults | 14         | Treasury cap illegal                 | create_vault                                                                                                          |
| vaults::vaults | 15         | Wrong package version                | update_package_version                                                                                                |
| vaults::vaults | 16         | Quota reached                        | deposit                                                                                                               |
| vaults::vaults | 17         | Vault not running                    | collect_rewarder，harvest，collect_fee，migrate_liquidity，reinvest ，remove，deposit                                 |
| vaults::vaults | 18         | Vault not rebalancing                | rebalance                                                                                                             |
| vaults::vaults | 19         | Quota type name error                | calculate_updated_quota                                                                                               |
| vaults::vaults | 20         | Same coin type                       | new_pool_key                                                                                                          |
| vaults::vaults | 21         | Invalid coin type sequence           | add_oracle_pool                                                                                                       |
| vaults::vaults | 22         | Coin pair existed                    | reinvest_harvest_assets，flash_loan ，update_slippage，remove_oracle_pool                                             |
| vaults::vaults | 23         | Coin pair non-existed                | flash_loan                                                                                                            |
| vaults::vaults | 24         | Incorrect flash loan amount          | repay_flash_loan                                                                                                      |
| vaults::vaults | 25         | Incorrect repay                      | flash_loan                                                                                                            |
| vaults::vaults | 26         | Oracle pool error                    | rebalance                                                                                                             |
| vaults::vaults | 27         | Flashloan count non-zero             | rebalance                                                                                                             |
| vaults::vaults | 28         | Finish rebalance threshold not match | rebalance                                                                                                             |
| vaults::vaults | 29         | Harvest asset not enough             | take_harvest_asset_by_amount                                                                                          |
| vaults::vaults | 30         | Invalid vault operation              | reinvest_harvest_assets                                                                                               |

## More About Cetus

Use the following links to learn more about Cetus:

Learn more about working with Cetus in the [Cetus Documentation](https://cetus-1.gitbook.io/cetus-docs).

Join the Cetus community on [Cetus Discord](https://discord.com/channels/1009749448022315008/1009751382783447072).

## License

MIT
