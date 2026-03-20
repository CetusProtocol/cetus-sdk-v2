import type { SuiTransactionBlockResponse } from '@mysten/sui/jsonRpc'
import { extractStructTagFromType } from '@cetusprotocol/common-sdk'

export class DcaUtils {
  static buildDcaOrderList(data: any) {
    const { parsedJson } = data
    if (parsedJson && parsedJson.order_id) {
      return {
        // created time
        created_at: parsedJson.created_at,
        // Cycle count
        cycle_count: parsedJson.cycle_count,
        // Cycle frequency
        cycle_frequency: parsedJson.cycle_frequency,
        // Payment token
        in_coin: extractStructTagFromType(parsedJson.in_coin.name).full_address,
        // Payment token amount
        in_deposited: parsedJson.in_deposited,
        // Order id
        order_id: parsedJson.order_id,
        // Received token
        out_coin: extractStructTagFromType(parsedJson.out_coin.name).full_address,
        // Quantity limit per cycle
        per_cycle_in_amount_limit: parsedJson.per_cycle_in_amount_limit,
        // Maximum output per cycle
        per_cycle_max_out_amount: parsedJson.per_cycle_max_out_amount,
        // Minimum output per cycle
        per_cycle_min_out_amount: parsedJson.per_cycle_min_out_amount,
      }
    }
    return undefined
  }

  static buildDcaGlobalConfig(data: any) {
    if (data && data.id.id) {
      return {
        min_cycle_count: data.min_cycle_count,
        min_cycle_frequency: data.min_cycle_frequency,
        whitelist_mode: data.whitelist_mode,
      }
    }
    return undefined
  }

  static buildOrderHistoryList(item: SuiTransactionBlockResponse, filter_types: string[]) {
    const { events } = item
    const list: any = []
    if (events) {
      events.forEach((event) => {
        const type = extractStructTagFromType(event.type).name
        if (filter_types.includes(type)) {
          const info = {
            digest: item.digest,
            type,
            timestampMs: item.timestampMs!,
            parsedJson: event.parsedJson,
          }
          list.push(info)
        }
      })
    }
    return list
  }
}
