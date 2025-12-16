import { BaseError } from '@cetusprotocol/common-sdk'

export enum ZapErrorCode {
  UnsupportedDepositMode = 'UnsupportedDepositMode',
  PositionIdUndefined = 'PositionIdUndefined',
  ParameterError = 'ParameterError',
  ReachMaxIterations = 'ReachMaxIterations',
  BestLiquidityIsZero = 'BestLiquidityIsZero',
  SwapAmountError = 'SwapAmountError',
  AggregatorError = 'AggregatorError',
}

export class ZapError extends BaseError {
  constructor(message: string, errorCode?: ZapErrorCode, details?: Record<string, any>) {
    super(message, errorCode || 'UnknownError', details)
  }

  static isZapErrorCode(e: any, code: ZapErrorCode): boolean {
    return this.isErrorCode<ZapError>(e, code)
  }
}

export const handleError = (code: ZapErrorCode, error: Error, details?: Record<string, any>) => {
  throw new ZapError(error.message, code, details)
}

export const handleMessageError = (code: ZapErrorCode, message: string, details?: Record<string, any>) => {
  throw new ZapError(message, code, details)
}
