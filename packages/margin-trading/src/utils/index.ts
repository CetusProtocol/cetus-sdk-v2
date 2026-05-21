import { addHexPrefix, d } from '@cetusprotocol/common-sdk'
import { getNetAprPercent, getTotalAprPercent, getFilteredRewards } from '@suilend/sdk/lib/liquidityMining'
import { Side } from '@suilend/sdk/lib/types'
import { parseObligation } from '@suilend/sdk/parsers/obligation'
import { TsplOrder } from '../types/tspl_types'

export const wrapMarketInfo = (info: any) => {
  const fields = info.json
  const marketId = fields?.id?.id || fields?.id
  const {
    open_permissions_pause,
    close_permissions_pause,
    deposit_permissions_pause,
    withdraw_permissions_pause,
    borrow_permissions_pause,
    repay_permissions_pause,
  } = wrapMarketPermissions(fields.permissions.toString(2))

  return {
    market_id: marketId,
    base_token: addHexPrefix(fields.base_token),
    quote_token: addHexPrefix(fields.quote_token),
    max_long_leverage: d(fields.max_long_leverage)
      .div(10 ** 6)
      .toString(),
    max_short_leverage: d(fields.max_short_leverage)
      .div(10 ** 6)
      .toString(),
    open_fee_rate: d(fields.open_fee_rate)
      .div(10 ** 6)
      .toString(),
    close_fee_rate: d(fields.close_fee_rate)
      .div(10 ** 6)
      .toString(),
    open_permissions_pause,
    close_permissions_pause,
    deposit_permissions_pause,
    withdraw_permissions_pause,
    borrow_permissions_pause,
    repay_permissions_pause,
  }
}

export const wrapPosition = (
  position: any,
  position_cap_id: string,
  is_tspl_cap: boolean,
  tspl?: {
    order_cap_id: string
    order_id: string
  }
) => {
  const fields = position.json
  const positionId = fields?.id?.id || fields?.id
  return {
    created_at: fields.created_ts,
    position_id: positionId,
    init_deposit_amount: fields.init_deposit_amount,
    is_long: fields.is_long,
    lending_market_id: fields.lending_market_id,
    obligation_owner_cap: fields.obligation_owner_cap.obligation_id,
    market_id: fields.market_id,
    position_cap_id,
    is_tspl_cap,
    tspl,
  }
}

export const mergePositionData = (position: any, obligation: any, reserve_map: any, lst_apr_percent_map: any, sdeUsdAprPercent: any,
  eThirdAprPercent: any, eEarnAprPercent: any, reward_map: any, is_tspl_cap: boolean) => {
  const obligationData = parseObligation(obligation, reserve_map)
  const netAprPercent = getNetAprPercent(obligationData, reward_map, lst_apr_percent_map, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent)

  // Safety check: ensure deposits array is not empty
  if ((!obligationData.deposits || obligationData.deposits.length === 0) && !is_tspl_cap) {
    throw new Error('No deposits found in obligation data')
  }

  const firstDeposit = obligationData.deposits.length > 0 ? obligationData.deposits[0] : {
    depositedAmount: "0",
    depositedAmountUsd: "0",
    coinType: '',
    reserve: {
      config: {
        closeLtvPct: '0',
        openLtvPct: '0',
      },
    },
  }
  const closeLTV = d(firstDeposit.reserve.config.closeLtvPct).div(100).toString()
  const openLTV = d(firstDeposit.reserve.config.openLtvPct).div(100).toString()

  // Safety check: ensure depositedAmountUsd is not zero when calculating CR
  // Liquidation Threshold (LTV)
  const cr = obligationData.depositedAmountUsd.gt(0)
    ? obligationData.borrowedAmountUsd.div(obligationData.depositedAmountUsd).toString()
    : '0'

  const ltr = d(1).div(closeLTV).toString()
  const liquidationBuffer = d(closeLTV).sub(cr).toString()

  // Safety check: handle case where borrows array might be empty
  let totalBorrowAprPercent = '0'
  let totalSuppliedAPR = '0'
  let borrowedAmountUsd = '0'
  let borrowedAmount = '0'

  if (obligationData.borrows && obligationData.borrows.length > 0) {
    const firstBorrow = obligationData.borrows[0]
    const borrowRewards = reward_map[firstBorrow?.coinType]

    if (borrowRewards) {
      totalBorrowAprPercent = getTotalAprPercent(
        Side.BORROW,
        firstBorrow?.reserve.borrowAprPercent,
        getFilteredRewards(borrowRewards.borrow)
      ).toString()
    }

    borrowedAmountUsd = firstBorrow.borrowedAmountUsd.toString()
    borrowedAmount = firstBorrow.borrowedAmount.toString()
  }

  if (obligationData.deposits && obligationData.deposits.length > 0) {
    const firstDeposit = obligationData.deposits[0]
    const borrowRewards = reward_map[firstDeposit?.coinType]

    if (borrowRewards) {
      totalSuppliedAPR = getTotalAprPercent(
        Side.DEPOSIT,
        firstDeposit?.reserve.depositAprPercent,
        getFilteredRewards(borrowRewards.deposit)
      ).toString()
    }
  }

  return {
    ...position,
    ...obligationData,
    origin_obligation: obligation,
    net_apr_percent: netAprPercent.toString(),
    supplied_apr: d(totalSuppliedAPR).toString(),
    borrowed_apr: d(totalBorrowAprPercent).toString(),
    close_ltv: closeLTV,
    open_ltv: openLTV,
    cr,
    ltr,
    liquidation_buffer: liquidationBuffer,
    deposited_amount_usd: firstDeposit.depositedAmountUsd.toString(),
    borrowed_amount_usd: borrowedAmountUsd,
    deposited_amount: firstDeposit.depositedAmount.toString(),
    borrowed_amount: borrowedAmount,
  }
}

export const wrapMarketPermissions = (permissions: string) => {
  const permissionsLength = permissions.length
  const open_permissions_pause = permissions.substring(permissionsLength - 1, permissionsLength) === '0'
  const close_permissions_pause = permissions.substring(permissionsLength - 2, permissionsLength - 1) === '0'
  const deposit_permissions_pause = permissions.substring(permissionsLength - 3, permissionsLength - 2) === '0'
  const borrow_permissions_pause = permissions.substring(permissionsLength - 4, permissionsLength - 3) === '0'
  const withdraw_permissions_pause = permissions.substring(permissionsLength - 5, permissionsLength - 4) === '0'
  const repay_permissions_pause = permissions.substring(permissionsLength - 6, permissionsLength - 5) === '0'
  return {
    open_permissions_pause,
    close_permissions_pause,
    deposit_permissions_pause,
    withdraw_permissions_pause,
    borrow_permissions_pause,
    repay_permissions_pause,
  }
}

const wrapTsplTarget = (target: any) => {
  const fields = target.fields ?? target
  return {
    trigger_price: d(fields.trigger_price).div(10 ** 18).toString(),
    slippage_bps: d(fields.slippage_bps).toString(),
    close_ratio_bps: d(fields.close_ratio_bps).div(10000).toString(),
    target_is_base: fields.target_is_base,
    id: fields.id?.id || fields.id,
  }
}

export function wrapTsplOrder(fields: any) {
  const order: TsplOrder = {
    created_ts: fields.created_ts,
    entry_price: d(fields.entry_price).div(10 ** 18).toString(),
    id: fields.id?.id || fields.id,
    is_long: fields.is_long,
    market_id: fields.market_id,
    next_target_id: fields.next_level_id,
    order_book_id: fields.order_book_id,
    position_cap: fields.position_cap?.id || '',
    order_cap: "",
    position_id: fields.position_id,
    settlements: {
      id: fields.settlements.id?.id || fields.settlements.id,
      size: fields.settlements.size,
    },
    status: fields.status,
    updated_ts: fields.updated_ts,
    tp_targets: fields.tp_levels.map(wrapTsplTarget),
    sl_targets: fields.sl_levels.map(wrapTsplTarget),
  }
  return order
}
