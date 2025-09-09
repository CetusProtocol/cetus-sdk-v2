import { BaseError } from '@cetusprotocol/common-sdk'

export enum CrossSwapErrorCode {
  NoPlatformsProvided = 'NoPlatformsProvided',
  SwapFailed = 'SwapFailed',
  EvmSignerNotSet = 'EvmSignerNotSet',
  SolanaTransactionSignerNotSet = 'SolanaTransactionSignerNotSet',
  SolanaConnectionNotSet = 'SolanaConnectionNotSet',
  ChainNotFound = 'ChainNotFound',
  InvalidEnvironment = 'InvalidEnvironment',
  InvalidConfigs = 'InvalidConfigs',
  InvalidPlatform = 'InvalidPlatform',
  LifiQuoteRequired = 'LifiQuoteRequired',
  MayanQuoteRequired = 'MayanQuoteRequired',
}

export class CrossSwapError extends BaseError {
  constructor(message: string, error_code?: CrossSwapErrorCode, details?: Record<string, any>) {
    super(message, error_code || 'UnknownError', details)
  }

  static isCrossSwapErrorCode(e: any, code: CrossSwapErrorCode): boolean {
    return this.isErrorCode<CrossSwapError>(e, code)
  }
}

export const handleError = (code: CrossSwapErrorCode, error: Error | string, details?: Record<string, any>) => {
  const errorDetails = {
    ...details,
    stack: error instanceof Error ? error.stack : undefined,
  }

  if (error instanceof Error) {
    throw new CrossSwapError(error.message, code, errorDetails)
  } else {
    throw new CrossSwapError(error, code, errorDetails)
  }
}
