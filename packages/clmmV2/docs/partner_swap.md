# Partner Swap

Currently, only established project teams are eligible for applying for partner swap.

## Partner

We offer a partner function. When you utilize the standard swap method, we will allocate the agreed-upon share to the partner. However, due to Sui contract limitations, partner functionality doesn't work in the latest smart router function with split order or when integrating other pools like DeepBook.

## Partner AccountCap

Only verified accounts are eligible to collect partner referral fees. When creating a partner, we generate a Partner AccountCap object (visible in your NFT list). Only accounts that possess the AccountCap are able to claim the fees.

## Claim Referral Fee

We provide a function `sdk.Pool.claimPartnerRefFeePayload()` to check referral fees.

### Function Parameters

Please refer to the original function for specific parameter types.

- `partner_cap`: The object ID of the partner cap
- `partner`: The object ID of the partner
- `coin_type`: The coin type for the fee coin type. You can obtain the referral fee using this specified method.

### Example

```typescript
const partner_cap = '0x...'
const partner = '0x...'
const coin_type = '0x...::...::....'
const claim_ref_ree_payload = await sdk.Pool.claimPartnerRefFeePayload(partner_cap, partner, coin_type)
const transfer_txn = await sdk.fullClient.sendTransaction(buildTestAccount(), claim_ref_ree_payload)
```

## Check Referral Fee

We provide a function `sdk.Pool.getPartnerRefFeeAmount()` to check referral fees.

### Function Parameters

Please refer to the original function for specific parameter types.

- `partner_id`: The object ID of the partner

### Example

```typescript
import BN from 'bn.js'
import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk'

const sdk = CetusClmmSDK.createSDK({ env: 'mainnet' })

const partner_id = '0x...'
const ref_fee = await sdk.Pool.getPartnerRefFeeAmount(partner_id)
```

## Apply for Partner Swap

Interested in Partner Swap? Submit a request from here:
[https://4bx69zjogri.typeform.com/to/UUETIX2f](https://4bx69zjogri.typeform.com/to/UUETIX2f)
