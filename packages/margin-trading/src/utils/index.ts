import { addHexPrefix, d, getObjectFields } from '@cetusprotocol/common-sdk'
import { parseObligation } from '@suilend/sdk/parsers/obligation'
import { getNetAprPercent, getTotalAprPercent, Side, getFilteredRewards } from '@suilend/sdk'

export const wrapMarketInfo = (info: any) => {
  const fields = getObjectFields(info)
  const {
    open_permissions_pause,
    close_permissions_pause,
    deposit_permissions_pause,
    withdraw_permissions_pause,
    borrow_permissions_pause,
    repay_permissions_pause,
  } = wrapMarketPermissions(fields.permissions.toString(2))

  return {
    market_id: fields.id.id,
    base_token: addHexPrefix(fields.base_token.fields.name),
    quote_token: addHexPrefix(fields.quote_token.fields.name),
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

export const wrapPosition = (position: any, position_cap_id: string) => {
  const fields = getObjectFields(position)
  return {
    created_at: fields.created_ts,
    position_id: fields.id.id,
    init_deposit_amount: fields.init_deposit_amount,
    is_long: fields.is_long,
    lending_market_id: fields.lending_market_id,
    obligation_owner_cap: fields.obligation_owner_cap.fields.obligation_id,
    market_id: fields.market_id,
    position_cap_id,
  }
}

export const mergePositionData = (position: any, obligation: any, reserve_map: any, lst_apr_percent_map: any, sdeUsdAprPercent: any, eThirdAprPercent: any, eEarnAprPercent: any, reward_map: any) => {
  const obligationData = parseObligation(obligation, reserve_map)
  const netAprPercent = getNetAprPercent(obligationData, reward_map, lst_apr_percent_map, sdeUsdAprPercent, eThirdAprPercent, eEarnAprPercent)

  // Safety check: ensure deposits array is not empty
  if (!obligationData.deposits || obligationData.deposits.length === 0) {
    throw new Error('No deposits found in obligation data')
  }

  const firstDeposit = obligationData.deposits[0]
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
