import { BaseError } from '@cetusprotocol/common-sdk'

export enum SwapErrorCode {
  InvalidSqrtPriceLimitDirection = `InvalidSqrtPriceLimitDirection`,
  ZeroTradableAmount = `ZeroTradableAmount`,
  AmountOutBelowMinimum = `AmountOutBelowMinimum`,
  AmountInAboveMaximum = `AmountInAboveMaximum`,
  NextTickNotFound = `NextTickNotFound`,
  TickArraySequenceInvalid = `TickArraySequenceInvalid`,
  TickArrayCrossingAboveMax = `TickArrayCrossingAboveMax`,
  TickArrayIndexNotInitialized = `TickArrayIndexNotInitialized`,
  ParamsLengthNotEqual = `ParamsLengthNotEqual`,
  FetchError = `FetchError`,
}

export enum PositionErrorCode {
  InvalidTickEvent = `InvalidTickEvent`,
  InvalidPositionObject = `InvalidPositionObject`,
  InvalidPositionRewardObject = `InvalidPositionRewardObject`,
  InvalidParams = `InvalidParams`,
  FetchError = `FetchError`,
}

export enum PoolErrorCode {
  InvalidCoinTypeSequence = `InvalidCoinTypeSequence`,
  InvalidTickIndex = `InvalidTickIndex`,
  InvalidPoolObject = `InvalidPoolObject`,
  InvalidTickObjectId = `InvalidTickObjectId`,
  InvalidTickObject = `InvalidTickObject`,
  InvalidTickFields = `InvalidTickFields`,
  PoolsNotFound = `PoolsNotFound`,
  StatsPoolsUrlNotSet = `StatsPoolsUrlNotSet`,
  FetchError = `FetchError`,
}

export enum VestErrorCode {
  ClmmVestNotSet = `ClmmVestNotSet`,
  ClmmVestFetchError = `ClmmVestFetchError`,
}

export enum PartnerErrorCode {
  InvalidParams = `InvalidParams`,
  NotFoundPartnerObject = `NotFoundPartnerObject`,
  InvalidPartnerRefFeeFields = `InvalidPartnerRefFeeFields`,
  FetchError = `FetchError`,
}

export enum ConfigErrorCode {
  InvalidConfig = `InvalidConfig`,
  InvalidConfigHandle = `InvalidConfigHandle`,
  InvalidSimulateAccount = `InvalidSimulateAccount`,
}

export enum UtilsErrorCode {
  InvalidSendAddress = `InvalidSendAddress`,
  InvalidRecipientAddress = `InvalidRecipientAddress`,
  InvalidRecipientAndAmountLength = `InvalidRecipientAndAmountLength`,
  InsufficientBalance = `InsufficientBalance`,
  InvalidTarget = `InvalidTarget`,
  InvalidTransactionBuilder = `InvalidTransactionBuilder`,
}

export enum RouterErrorCode {
  InvalidCoin = `InvalidCoin`,
  NotFoundPath = `NotFoundPath`,
  NoDowngradeNeedParams = `NoDowngradeNeedParams`,
  InvalidSwapCountUrl = `InvalidSwapCountUrl`,
  InvalidTransactionBuilder = `InvalidTransactionBuilder`,
  InvalidServerResponse = `InvalidServerResponse`,
}

export enum TypesErrorCode {
  InvalidType = `InvalidType`,
}


export enum ZapErrorCode {
  UnsupportedDepositMode = 'UnsupportedDepositMode',
  PositionIdUndefined = 'PositionIdUndefined',
  ParameterError = 'ParameterError',
  ReachMaxIterations = 'ReachMaxIterations',
  BestLiquidityIsZero = 'BestLiquidityIsZero',
  SwapAmountError = 'SwapAmountError',
  AggregatorError = 'AggregatorError',
}

export type ClmmErrorCode =
  | SwapErrorCode
  | PoolErrorCode
  | PositionErrorCode
  | PartnerErrorCode
  | ConfigErrorCode
  | UtilsErrorCode
  | RouterErrorCode
  | TypesErrorCode
  | ZapErrorCode

export class ClmmError extends BaseError {
  constructor(message: string, errorCode?: ClmmErrorCode, details?: Record<string, any>) {
    super(message, errorCode || 'UnknownError', details)
  }

  static isVaultsErrorCode(e: any, code: ClmmErrorCode): boolean {
    return this.isErrorCode<ClmmError>(e, code)
  }
}

export const handleError = (code: ClmmErrorCode, error: Error, details?: Record<string, any>) => {
  throw new ClmmError(error.message, code, details)
}

export const handleMessageError = (code: ClmmErrorCode, message: string, details?: Record<string, any>) => {
  throw new ClmmError(message, code, details)
}
