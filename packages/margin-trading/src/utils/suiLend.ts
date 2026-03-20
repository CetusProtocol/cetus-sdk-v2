import { AprRewardSummary, linearlyInterpolate, ParsedReserve, PerDayRewardSummary, Side } from "@suilend/sdk";
import { CetusMarginTradingSDK } from "../sdk";
import { NORMALIZED_flSUI_COINTYPE, NORMALIZED_jugSUI_COINTYPE, NORMALIZED_LBTC_COINTYPE, formatLtvPercent } from '@suilend/sui-fe'
import BigNumber from "bignumber.js";
import { v4 as uuidv4 } from 'uuid'
import { getPackagerConfigs } from "@cetusprotocol/common-sdk";
export const oraclePriceMultiplierDecimal = 10n

export function calculateUtilizationPercent(reserve: ParsedReserve): BigNumber {
  return reserve.depositedAmount.eq(0)
    ? new BigNumber(0)
    : reserve.borrowedAmount.div(reserve.depositedAmount).times(100);
}

export function calculateBorrowAprPercent(reserve: ParsedReserve): BigNumber | undefined {
  const utilizationPercent = calculateUtilizationPercent(reserve);
  if (utilizationPercent.gt(100)) return undefined;

  return linearlyInterpolate(
    reserve.config.interestRate,
    "utilPercent",
    "aprPercent",
    utilizationPercent,
  );
}

export function calculateDepositAprPercent(reserve: ParsedReserve): BigNumber | undefined {
  const utilizationPercent = calculateUtilizationPercent(reserve);
  const borrowAprPercent = calculateBorrowAprPercent(reserve);

  if (borrowAprPercent === undefined || utilizationPercent.gt(100)) return undefined;

  return new BigNumber(utilizationPercent.div(100))
    .times(borrowAprPercent.div(100))
    .times(1 - reserve.config.spreadFeeBps / 10000)
    .times(100);
}

export function appendExtraRewards(
  side: Side,
  reserve: ParsedReserve,
  filteredRewards: any[],
  sdk: CetusMarginTradingSDK,
) {
  const { api_url } = getPackagerConfigs(sdk.sdkOptions.suilend)
  if (side === Side.DEPOSIT) {
    if ([NORMALIZED_flSUI_COINTYPE, NORMALIZED_jugSUI_COINTYPE].includes(reserve.coinType)) {
      filteredRewards.push({
        stats: {
          id: uuidv4(),
          isActive: true,
          rewardIndex: -1,
          reserve,
          rewardCoinType: "LIQ_AG",
          mintDecimals: 0,
          symbol: "LiqAg Points",
          iconUrl: `${api_url}/partners/LiqAg.png`,
          perDay: new BigNumber(0.036),
          side: Side.DEPOSIT,
        },
        obligationClaims: {},
      });
    }

    if (reserve.coinType === NORMALIZED_LBTC_COINTYPE) {
      filteredRewards.push({
        stats: {
          id: uuidv4(),
          isActive: true,
          rewardIndex: -1,
          reserve,
          rewardCoinType: "LOMBARD",
          mintDecimals: 0,
          symbol: "3x Lombard Lux",
          iconUrl: `${api_url}/partners/Lombard Lux.png`,
          perDay: new BigNumber(0),
          side: Side.DEPOSIT,
        },
        obligationClaims: {},
      });
    }
  }
}

export function getUpdatedReserve(reserve: ParsedReserve, side: Side, changeAmount: BigNumber): ParsedReserve {
  return {
    ...reserve,
    depositedAmount:
      side === Side.DEPOSIT
        ? BigNumber.max(reserve.depositedAmount.plus(changeAmount), 0)
        : reserve.depositedAmount,
    borrowedAmount:
      side === Side.BORROW
        ? BigNumber.max(reserve.borrowedAmount.plus(changeAmount), 0)
        : reserve.borrowedAmount,
  };
}


export function getRewardsAprMultiplier(
  side: Side,
  reserve: ParsedReserve,
  newReserve: ParsedReserve
): { multiplier: BigNumber; isValid: boolean } {
  const totalAmount = side === Side.DEPOSIT ? reserve.depositedAmount : reserve.borrowedAmount;
  const newTotalAmount = side === Side.DEPOSIT ? newReserve.depositedAmount : newReserve.borrowedAmount;

  const multiplier = newTotalAmount.eq(0) ? new BigNumber(-1) : totalAmount.div(newTotalAmount);
  return { multiplier, isValid: !multiplier.eq(-1) };
}


export function updateRewardsWithMultiplier(
  perDayRewards: PerDayRewardSummary[],
  aprRewards: AprRewardSummary[],
  multiplier: BigNumber,
  isValid: boolean
) {
  const newPerDayRewards = perDayRewards.map((r) => ({
    ...r,
    stats: {
      ...r.stats,
      perDay: isValid ? r.stats.perDay.times(multiplier) : undefined,
    },
  })) as PerDayRewardSummary[];

  const newAprRewards = aprRewards.map((r) => ({
    ...r,
    stats: {
      ...r.stats,
      aprPercent: isValid ? r.stats.aprPercent.times(multiplier) : undefined,
    },
  })) as AprRewardSummary[];

  return { newPerDayRewards, newAprRewards };
}




export function getPriceWithFormattedDecimals(
  pythPrice: bigint,
  expo: bigint // expo represents the decimal exponent
): bigint {
  // Check if the required price multiplier is defined
  if (!oraclePriceMultiplierDecimal) {
    throw new Error('oraclePriceMultiplierDecimal is required')
  }

  // Price must be greater than 0
  if (pythPrice === 0n) {
    throw new Error('Invalid oracle price')
  }

  // If expo is negative, the price needs to be scaled up
  if (expo < 0n) {
    // Calculate the scale factor for negative expo values
    const scaleFactor = 10n ** (oraclePriceMultiplierDecimal - -expo) // Convert expo to a positive number
    return pythPrice * scaleFactor // Scale up the price
  }

  // If expo is positive, the price needs to be scaled down
  return pythPrice / 10n ** (expo + oraclePriceMultiplierDecimal)
}

export function formatLtvPercentValue(value: string) {
  return formatLtvPercent(new BigNumber(value))
}


export interface IncrementalLeverageResult {
  // This increment
  addBorrowAmount: string
  addBorrowValue: string
  addCollateralFromBorrow: string
  addCollateralAmount: string
  addCollateralValue: string

  // Final total state
  finalCollateralAmount: string
  finalCollateralValue: string
  finalDebtAmount: string
  finalDebtValue: string

  // Validation
  leverage: string
}
/**
 * Constant leverage · Incremental addition model
 */
export function calcIncrementalLeverage(
  // Current state
  currentCollateralAmount: string, // C_cur
  currentDebtAmount: string,       // D_cur

  // This increment
  addedCollateralAmount: string,   // C_add

  // Prices
  collateralPrice: string,         // Pc
  debtPrice: string,               // Pd

  // Target leverage
  targetLeverage: string           // L
): IncrementalLeverageResult {
  const Ccur = new BigNumber(currentCollateralAmount)
  const Dcur = new BigNumber(currentDebtAmount)
  const Cadd = new BigNumber(addedCollateralAmount)

  const Pc = new BigNumber(collateralPrice)
  const Pd = new BigNumber(debtPrice)
  const L = new BigNumber(targetLeverage)

  // Current value
  const CVcur = Ccur.times(Pc)
  const DVcur = Dcur.times(Pd)
  const Ecur = CVcur.minus(DVcur)


  // Incremental equity
  const Eadd = Cadd.times(Pc)

  // Target state
  const Enew = Ecur.plus(Eadd)
  const CVtarget = Enew.times(L)
  const DVtarget = CVtarget.minus(Enew)

  // Incremental borrowing needed this time
  const DVadd = DVtarget.minus(DVcur)
  if (DVadd.lt(0)) {
    throw new Error('Target leverage lower than current leverage')
  }

  // Derived amounts
  const Dadd = DVadd.div(Pd)
  const addedCollateralFromBorrow = DVadd.div(Pc)

  // Final state
  const Cfinal = Ccur.plus(Cadd).plus(addedCollateralFromBorrow)
  const Dfinal = Dcur.plus(Dadd)

  // Validation
  const CVfinal = Cfinal.times(Pc)
  const DVfinal = Dfinal.times(Pd)
  const actualLeverage = CVfinal.div(CVfinal.minus(DVfinal))

  // Total incremental collateral amount = direct increment + collateral from borrowing
  const totalAddCollateralAmount = Cadd.plus(addedCollateralFromBorrow)
  // Total incremental collateral value = direct increment value + collateral value from borrowing
  const totalAddCollateralValue = Eadd.plus(addedCollateralFromBorrow.times(Pc))

  return {
    addBorrowAmount: Dadd.toString(),
    addBorrowValue: DVadd.toString(),
    addCollateralFromBorrow: addedCollateralFromBorrow.toString(),
    addCollateralAmount: totalAddCollateralAmount.toString(),
    addCollateralValue: totalAddCollateralValue.toString(),

    finalCollateralAmount: Cfinal.toString(),
    finalCollateralValue: CVfinal.toString(),
    finalDebtAmount: Dfinal.toString(),
    finalDebtValue: DVfinal.toString(),

    leverage: actualLeverage.toString()
  }
}