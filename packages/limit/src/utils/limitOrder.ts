import { SuiTransactionBlockResponse } from '@mysten/sui/jsonRpc'
import { d, extractStructTagFromType, getObjectFields, getObjectType } from '@cetusprotocol/common-sdk'
import { LimitOrder, LimitOrderStatus, OrderLimitEvent } from '../types/limitOrder'
export class LimitOrderUtils {
  static buildOrderLimitEvent(item: SuiTransactionBlockResponse, filter_types: string[]): OrderLimitEvent[] {
    const { events } = item
    const list: OrderLimitEvent[] = []
    if (events) {
      events.forEach((event) => {
        const type = extractStructTagFromType(event.type).name
        if (filter_types.includes(type)) {
          const info: OrderLimitEvent = {
            digest: item.digest,
            type,
            timestamp_ms: item.timestampMs!,
            parsed_json: event.parsedJson,
          }
          list.push(info)
        }
      })
    }
    return list
  }

  static buildLimitOrderInfo(info: any) {
    const fields = getObjectFields(info)
    const type = getObjectType(info)

    if (fields && type) {
      try {
        const typeStruct = extractStructTagFromType(type)
        const info: LimitOrder = {
          pay_coin_type: typeStruct.type_arguments[0],
          target_coin_type: typeStruct.type_arguments[1],
          canceled_ts: fields.canceled_ts === '18446744073709551615' ? 0 : Number(fields.canceled_ts),
          id: fields.id.id,
          obtained_amount: fields.obtained_amount,
          owner: fields.owner,
          rate: fields.rate,
          rate_order_indexer_id: fields.rate_order_indexer_id,
          expire_ts: Number(fields.expire_ts),
          total_pay_amount: fields.total_pay_amount,
          pay_balance: fields.pay_balance,
          target_balance: fields.target_balance,
          claimed_amount: fields.claimed_amount,
          status: LimitOrderStatus.Running,
          created_ts: Number(fields.created_ts),
        }

        if (info.canceled_ts === 0) {
          info.status = LimitOrderStatus.Running
          if (d(info.pay_balance).eq(0)) {
            info.status = LimitOrderStatus.Completed
          } else if (d(info.pay_balance).lessThan(info.total_pay_amount)) {
            info.status = LimitOrderStatus.PartialCompleted
          }
        } else {
          info.status = LimitOrderStatus.Cancelled
        }
        return info
      } catch (error) {
        console.log(error)
      }
    }

    return undefined
  }

  static rateToPrice(format_rate: string, pay_decimal: number, target_decimal: number): string {
    const exponent = 18 + pay_decimal - target_decimal
    return d(10 ** exponent)
      .div(format_rate)
      .toString()
  }

  static priceToRate(price: number, pay_decimal: number, target_decimal: number): string {
    const exponent = 18 + pay_decimal - target_decimal
    return d(10).pow(exponent).div(d(price)).toFixed(0).toString()
  }
}
