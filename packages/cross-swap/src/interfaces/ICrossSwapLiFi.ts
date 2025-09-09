import { CrossSwapToken, ChainId, SwapOptions, CrossSwapTokenBalance } from '../types/cross_swap'
import { ExecutionOptions, RouteExtended, Token } from '@lifi/sdk'
import { ICrossSwap } from './ICrossSwap'

/**
 * CrossSwap interface that defines the standard for different platform implementations
 */
export interface ICrossSwapLiFi extends ICrossSwap {
  /**
   * Execute the swap quote
   * @param option - The options for the swap
   * @param executionOptions - The execution options
   * @returns Promise<RouteExtended> The route
   */
  executeSwapQuote(option: SwapOptions, executionOptions?: ExecutionOptions): Promise<RouteExtended>

  /**
   * Get the token balances for the owner
   * @param walletAddress - The wallet address
   * @param tokens - The tokens to get the balances for
   * @returns Promise<Record<string, CrossSwapTokenBalance>> The token balances
   */
  getOwnerTokenBalances(walletAddress: string, tokens: CrossSwapToken[]): Promise<CrossSwapTokenBalance[]>
}
