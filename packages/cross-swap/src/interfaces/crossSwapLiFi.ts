import { CetusCrossSwapSDK } from '../sdk'
import {
  CrossSwapPlatform,
  CrossSwapToken,
  Chain,
  ChainId,
  EstimateQuoteOptions,
  SwapOptions,
  CrossSwapTokenBalance,
  CrossSwapRouter,
  CrossSwapQuote,
} from '../types/cross_swap'
import { DETAILS_KEYS } from '@cetusprotocol/common-sdk'
import { ExecutionOptions, Route, RouteExtended, Token } from '@lifi/sdk'
import { ICrossSwapLiFi } from './ICrossSwapLiFi'
import { CrossSwapErrorCode, handleError } from '../errors/errors'

export abstract class CrossSwapLiFi implements ICrossSwapLiFi {
  protected constructor(protected readonly sdk: CetusCrossSwapSDK) {}

  /**
   * Get a chain config by chain id
   * @param chain_id - The chain id
   * @returns Chain The chain config
   */
  getChain(chain_id: ChainId): Chain {
    const chain = this.getSupportedChains().find((chain) => chain.id === chain_id)
    if (!chain) {
      return handleError(CrossSwapErrorCode.ChainNotFound, `Chain ${chain_id} not found`, {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          chain_id,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'getChain',
      })
    }
    return chain
  }

  getChainByChainName(chain_name_id: string): Chain {
    const chain = this.getSupportedChains().find((chain) => chain.name_id === chain_name_id)
    if (!chain) {
      return handleError(CrossSwapErrorCode.ChainNotFound, `Chain ${chain_name_id} not found`, {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          chain_name_id,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'getChainByChainName',
      })
    }
    return chain
  }

  abstract getPlatform(): CrossSwapPlatform

  abstract getSupportedChains(): Chain[]

  abstract getSupportedTokens(chain_ids: ChainId[]): Promise<Record<number, CrossSwapToken[]>>

  abstract estimateQuote(options: EstimateQuoteOptions): Promise<CrossSwapRouter>

  abstract executeSwapQuote(option: SwapOptions, executionOptions?: ExecutionOptions): Promise<RouteExtended>

  abstract getOwnerTokenBalances(walletAddress: string, tokens: CrossSwapToken[]): Promise<CrossSwapTokenBalance[]>

  abstract parseCrossSwapQuote(route: Route): CrossSwapQuote

  abstract getCrossSwapToken(chain_id: ChainId, token_address: string, use_cache?: boolean): Promise<CrossSwapToken | undefined>
}
