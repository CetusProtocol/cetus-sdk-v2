import { Quote } from '@mayanfinance/swap-sdk'
import {
  CrossSwapPlatform,
  CrossSwapToken,
  EstimateQuoteOptions,
  Chain,
  ChainId,
  CrossSwapRouter,
  CrossSwapQuote,
} from '../types/cross_swap'
import { Route } from '@lifi/sdk'

/**
 * CrossSwap interface that defines the standard for different platform implementations
 */
export interface ICrossSwap {
  /**
   * Get the platform identifier for this CrossSwap
   * @returns CrossSwapPlatform The platform identifier
   */
  getPlatform(): CrossSwapPlatform

  /**
   * Get all supported chains for the CrossSwap
   * @returns Promise<Chain[]> Array of supported chains
   */
  getSupportedChains(): Chain[]

  /**
   * Get a chain config by chain id
   * @param chain_id - The chain id
   * @returns Chain The chain config
   */
  getChain(chain_id: ChainId): Chain

  /**
   * Get a chain config by chain id
   * @param chain_id - The chain id
   * @returns Chain The chain config
   */
  getChainByChainName(chain_name_id: string): Chain

  /**
   * Get all supported tokens for the CrossSwap
   * @param chain_id - The chain id
   * @returns Promise<CrossSwapToken[]> Array of tokens
   */
  getSupportedTokens(chain_ids: ChainId[]): Promise<Record<number, CrossSwapToken[]>>

  /**
   * Get a cross swap token by chain id and token address
   * @param chain_id - The chain id
   * @param token_address - The token address
   * @param use_cache - Whether to use cache
   * @returns Promise<CrossSwapToken | undefined> The cross swap token
   */
  getCrossSwapToken(chain_id: ChainId, token_address: string, use_cache?: boolean): Promise<CrossSwapToken | undefined>

  /**
   * Estimate quote for the CrossSwap
   * @param options - The options for the quote
   * @returns Promise<any> The quote
   */
  estimateQuote(options: EstimateQuoteOptions): Promise<CrossSwapRouter>

  /**
   * Parse the quote for the CrossSwap
   * @param route - The quote
   * @returns CrossSwapQuote The parsed quote
   */
  parseCrossSwapQuote(route: Quote | Route): CrossSwapQuote
}
