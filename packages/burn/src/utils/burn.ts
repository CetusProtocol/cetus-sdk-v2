import { asIntN, extractStructTagFromType } from '@cetusprotocol/common-sdk'
import { BurnPositionNFT } from '../types/burn'

export class BurnUtils {
  static buildBurnPositionNFT(fields: any): BurnPositionNFT {
    const burnFields = fields.position.fields
    const name = fields.name
    const burnPositionNft: BurnPositionNFT = {
      id: fields.id.id,
      url: burnFields.url,
      pool_id: burnFields.pool,
      coin_type_a: extractStructTagFromType(burnFields.coin_type_a.fields.name).full_address,
      coin_type_b: extractStructTagFromType(burnFields.coin_type_b.fields.name).full_address,
      description: fields.description,
      name,
      liquidity: burnFields.liquidity,
      clmm_position_id: burnFields.id.id,
      clmm_pool_id: burnFields.pool,
      tick_lower_index: asIntN(BigInt(burnFields.tick_lower_index.fields.bits)),
      tick_upper_index: asIntN(BigInt(burnFields.tick_upper_index.fields.bits)),
      index: burnFields.index,
      is_lp_burn: true,
    }
    return burnPositionNft
  }
}
