import { FeeCost, GasCost, Route, RouteExtended, Token, TokenAmount } from '@lifi/sdk'
import { Chain, ChainId, CrossSwapFee, CrossSwapQuote, CrossSwapToken, CrossSwapTokenBalance } from '../types/cross_swap'
import { d, fromDecimalsAmount } from '@cetusprotocol/common-sdk'
import { LiFiCrossSwapModule } from '../modules/crossSwapLiFi'
import { ICrossSwap } from '../interfaces/ICrossSwap'

export const printLiFiTransactionLinks = (route: RouteExtended) => {
  route.steps.forEach((step, index) => {
    step.execution?.process.forEach((process) => {
      console.log('🚀 ~ printLiFiTransactionLinks ~ process:', process)
      if (process.txHash) {
        console.log(`Transaction Hash for Step ${index + 1}, Process ${process.type}:`, process.txHash)
      }
    })
  })
}

export const parseLiFiTokenBalance = (balance: TokenAmount): CrossSwapTokenBalance | undefined => {
  const { amount, priceUSD, symbol, decimals, name, chainId, address } = balance
  if (amount) {
    const balance = amount.toString()
    const balance_formatted = fromDecimalsAmount(balance, decimals)
    const balance_usd = priceUSD ? d(priceUSD).mul(balance_formatted).toString() : undefined
    return {
      address,
      balance,
      balance_usd,
      chain_id: chainId as any,
      balance_formatted,
    }
  }
  return undefined
}

export const parseCrossTokenFromLiFi = (t: Token, chain: Chain) => {
  const crossSwapToken: CrossSwapToken = {
    address: t.address,
    name: t.name,
    type: chain.type,
    symbol: t.symbol,
    decimals: t.decimals,
    chain_id: Number(chain.id),
    logo_url: t.logoURI || '',
    price_usd: t.priceUSD,
  }
  return crossSwapToken
}

export const getAccumulatedLifiFeeCosts = (route: RouteExtended, ICrossSwap: ICrossSwap, included = false) => {
  const gasCosts = getLifiGasCosts(route, ICrossSwap)
  const feeCosts = getLifiFeeCosts(route, ICrossSwap, included)
  return getAccumulatedLifiFeeCostsFromArrays(gasCosts, feeCosts)
}

export const getAccumulatedLifiFeeCostsFromArrays = (gasCosts: CrossSwapFee[], feeCosts: CrossSwapFee[]) => {
  const gasCostUSD = gasCosts.reduce((sum, gasCost) => d(sum).add(d(gasCost.amountUSD)).toNumber(), 0)
  const feeCostUSD = feeCosts.reduce((sum, feeCost) => d(sum).add(d(feeCost.amountUSD)).toNumber(), 0)
  const combinedFeesUSD = gasCostUSD + feeCostUSD
  return {
    gasCosts,
    feeCosts,
    gasCostUSD,
    feeCostUSD,
    combinedFeesUSD,
  }
}

export const getLifiGasCosts = (route: RouteExtended, ICrossSwap: ICrossSwap): CrossSwapFee[] => {
  return Array.from(
    route.steps
      .reduce((groupedGasCosts, step) => {
        const gasCosts = step.execution?.gasCosts ?? step.estimate.gasCosts
        if (gasCosts?.length) {
          const parsedGasCosts = parseCrossSwapFeeByGasCost(gasCosts, ICrossSwap)
          const { token, amount: gasCostAmount, amountUSD: gasCostAmountUSD } = getLifiSummaryFeeCost(parsedGasCosts)
          const groupedGasCost = groupedGasCosts.get(token.chain_id)
          const amount = groupedGasCost ? groupedGasCost.amount + gasCostAmount : gasCostAmount
          const amountUSD = groupedGasCost ? groupedGasCost.amountUSD + gasCostAmountUSD : gasCostAmountUSD
          groupedGasCosts.set(token.chain_id, {
            amount,
            amountUSD,
            amount_formatted: fromDecimalsAmount(amount, token.decimals).toString(),
            token,
          })
          return groupedGasCosts
        }
        return groupedGasCosts
      }, new Map<number, CrossSwapFee>())
      .values()
  )
}

export const getLifiFeeCosts = (route: RouteExtended, ICrossSwap: ICrossSwap, included?: boolean): CrossSwapFee[] => {
  return Array.from(
    route.steps
      .reduce((groupedFeeCosts, step) => {
        let feeCosts = step.execution?.feeCosts ?? step.estimate.feeCosts
        if (typeof included === 'boolean') {
          feeCosts = feeCosts?.filter((feeCost) => feeCost.included === included)
        }
        if (feeCosts?.length) {
          const parsedFeeCosts = parseCrossSwapFeeByFeeCost(feeCosts, ICrossSwap)
          const { token, amount: feeCostAmount, amountUSD: feeCostAmountUSD } = getLifiSummaryFeeCost(parsedFeeCosts)
          const groupedFeeCost = groupedFeeCosts.get(token.chain_id)
          const amount = groupedFeeCost ? groupedFeeCost.amount + feeCostAmount : feeCostAmount
          const amountUSD = groupedFeeCost ? groupedFeeCost.amountUSD + feeCostAmountUSD : feeCostAmountUSD
          groupedFeeCosts.set(token.chain_id, {
            amount,
            amountUSD,
            amount_formatted: fromDecimalsAmount(amount, token.decimals).toString(),
            token,
          })
          return groupedFeeCosts
        }
        return groupedFeeCosts
      }, new Map<number, CrossSwapFee>())
      .values()
  )
}

export const getLifiSummaryFeeCost = (feeCosts: CrossSwapFee[] | CrossSwapFee[]): CrossSwapFee => {
  const { token } = feeCosts[0]

  const { amount, amountUSD } = feeCosts.reduce(
    (acc, feeCost) => {
      const feeAmount = d(feeCost.amount)
      const amount_formatted = fromDecimalsAmount(feeAmount.toString(), feeCost.token.decimals)

      const amountUSD = d(amount_formatted).mul(feeCost.token.price_usd || '0')

      acc.amount = feeAmount.add(acc.amount)
      acc.amountUSD = d(amountUSD).add(acc.amountUSD)
      return acc
    },
    { amount: d(0), amountUSD: d(0) }
  )

  return {
    amount: amount.toFixed(0),
    amountUSD: amountUSD.toString(),
    amount_formatted: fromDecimalsAmount(amount.toString(), token.decimals).toString(),
    token,
  }
}

export const parseCrossSwapFeeByFeeCost = (feeCosts: FeeCost[], ICrossSwap: ICrossSwap) => {
  return feeCosts.map((item) => {
    const chain = ICrossSwap.getChain(item.token.chainId as any)
    const fromToken = parseCrossTokenFromLiFi(item.token, chain)
    const info: CrossSwapFee = {
      amount: item.amount,
      amountUSD: item.amountUSD,
      amount_formatted: fromDecimalsAmount(item.amount, item.token.decimals).toString(),
      token: fromToken,
    }
    return info
  })
}

export const parseCrossSwapFeeByGasCost = (feeCosts: GasCost[], ICrossSwap: ICrossSwap) => {
  return feeCosts.map((item) => {
    const chain = ICrossSwap.getChain(item.token.chainId as any)
    const fromToken = parseCrossTokenFromLiFi(item.token, chain)
    const info: CrossSwapFee = {
      amount: item.amount,
      amountUSD: item.amountUSD,
      amount_formatted: fromDecimalsAmount(item.amount, item.token.decimals).toString(),
      token: fromToken,
    }
    return info
  })
}
