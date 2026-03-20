import { d } from "packages/common/dist"

// 保证金大小
const calculateSize = (baseAmount: string, markPrice: number) => {
  return d(baseAmount).mul(markPrice).toString()
}

// 实际杠杆
const calculateLeverage = (collateralAmountUSD: string, borrowAmountUSD: string) => {
  return d(collateralAmountUSD).div(d(collateralAmountUSD).sub(borrowAmountUSD)).toString()
}

// 仓位净值
const calculateNetValue = (collateralAmountUSD: string, borrowAmountUSD: string) => {
  return d(collateralAmountUSD).sub(borrowAmountUSD).toString()
}

// 仓位净利率
const calculateNetApr = (collateralAmountUSD: string, borrowAmountUSD: string, depositApr: number, borrowApr: number) => {
  return d(collateralAmountUSD).mul(depositApr).sub(d(borrowAmountUSD).mul(borrowApr)).div(d(collateralAmountUSD).sub(borrowAmountUSD)).toString()
}

//多仓清算价
const calculateLongLiquidationPrice = (borrowAmountUSD: number, collateralAmount: string, collateralFee: number, slippage: number, closeLTV: string) => {
  return d(borrowAmountUSD).div(d(collateralAmount).mul(1 - slippage).mul(1 - collateralFee)).mul(closeLTV).toString()
}

//空仓清算价
const calculateShortLiquidationPrice = (collateralAmountUSD: string, collateralFee: number, slippage: number, openLTV: string, closeLTV: string) => {
  return d(openLTV).mul(collateralAmountUSD).mul(1 - collateralFee).mul(closeLTV).mul(1 + slippage).toString()
}

// 强平价格与当前价格比率
const calculateLiquidationPriceRatio = (Pliq: string, currentPrice: string) => {
  return d(Pliq).mul(currentPrice).div(currentPrice)
}


// 未实现盈亏
const calculateUnrealizedPnl = (cPrice: string, oPrice: string, riskExposure: string, positionSide: string) => {
  if (positionSide === 'long') {
    return d(cPrice).sub(oPrice).mul(d(riskExposure).div(oPrice)).toString()
  } else {
    return d(oPrice).sub(cPrice).mul(d(riskExposure).div(oPrice)).toString()
  }
}

// 盈亏率
const calculateRealizedPnlRatio = (pnl: string, size: string) => {
  return d(pnl).div(size).toString()
}


// LTV
const calculateLtv = (borrowAmountUSD: string, size: number) => {
  return d(borrowAmountUSD).div(size)
}

// CR
const calculateCr = (collateralAmount: string, borrowAmountUSD: string) => {
  return d(collateralAmount).div(borrowAmountUSD)
}

// LTR
const calculateLtr = (closeLTV: string) => {
  return d(1).div(closeLTV).toString()
}

// 清算缓冲
const calculateLiquidationBuffer = (cr: string, ltr: string) => {
  return d(cr).sub(ltr).div(cr).toString()
}




