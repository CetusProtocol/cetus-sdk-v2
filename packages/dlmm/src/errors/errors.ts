import { BaseError } from '@cetusprotocol/common-sdk'

export enum DlmmErrorCode {
  FetchError = 'FetchError',
  ParseError = 'ParseError',
  InvalidStrategyParams = 'InvalidStrategyParams',
  InvalidBinWidth = 'InvalidBinWidth',
  GetObjectError = 'GetObjectError',
  InvalidBinId = 'InvalidBinId',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidParams = 'InvalidParams',
  InvalidCoinTypeSequence = 'InvalidCoinTypeSequence',
  NotFound = 'NotFound',
  AmountTooSmall = 'AmountTooSmall',
  LiquiditySupplyIsZero = 'LiquiditySupplyIsZero',
  InvalidDeltaLiquidity = 'InvalidDeltaLiquidity',
}

export class DlmmError extends BaseError {
  constructor(message: string, error_code?: DlmmErrorCode, details?: Record<string, any>) {
    super(message, error_code || 'UnknownError', details)
  }

  static isDlmmErrorCode(e: any, code: DlmmErrorCode): boolean {
    return this.isErrorCode<DlmmError>(e, code)
  }
}

export const handleError = (code: DlmmErrorCode, error: Error | string, details?: Record<string, any>) => {
  const errorDetails = {
    ...details,
    stack: error instanceof Error ? error.stack : undefined,
  }

  if (error instanceof Error) {
    throw new DlmmError(error.message, code, errorDetails)
  } else {
    throw new DlmmError(error, code, errorDetails)
  }
}
