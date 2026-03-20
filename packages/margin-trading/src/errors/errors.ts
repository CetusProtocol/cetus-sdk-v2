import { BaseError } from "@cetusprotocol/common-sdk"

export enum MarginTradingErrorCode {
  MarketNotFound = 'MarketNotFound',
  FetchError = 'FetchError',
  PositionNotFound = 'PositionNotFound',
  FlashLoanPoolNotFound = 'FlashLoanPoolNotFound',
  PriceNotFound = 'PriceNotFound',
}


export class MarginTradingError extends BaseError {
  constructor(message: string, error_code?: MarginTradingErrorCode, details?: Record<string, any>) {
    super(message, error_code || 'UnknownError', details)
  }

  static isCrossSwapErrorCode(e: any, code: MarginTradingErrorCode): boolean {
    return this.isErrorCode<MarginTradingError>(e, code)
  }
}

export const handleError = (code: MarginTradingErrorCode, error: Error | string, details?: Record<string, any>) => {
  const errorDetails = {
    ...details,
    stack: error instanceof Error ? error.stack : undefined,
  }

  if (error instanceof Error) {
    throw new MarginTradingError(error.message, code, errorDetails)
  } else {
    throw new MarginTradingError(error, code, errorDetails)
  }
}