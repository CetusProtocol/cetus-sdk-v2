import { SwapOptions, UpdateCrossSwapAction } from '../types/cross_swap'
import { Transaction } from '@mysten/sui/transactions'
import { TransactionResponse } from 'ethers'
import { ICrossSwap } from './ICrossSwap'

/**
 * CrossSwap interface that defines the standard for different platform implementations
 */
export interface ICrossSwapMayan extends ICrossSwap {
  /**
   * CrossSwap swap from SUI
   * @param option - The options for the swap
   * @param suiClient - The SUI client
   * @returns Promise<Transaction> The transaction
   */
  buildSwapFromSui(option: SwapOptions): Promise<Transaction>

  /**
   * CrossSwap swap from EVM
   * @param option - The options for the swap
   * @returns Promise<any> The transaction
   */
  buildSwapFromEvm(option: SwapOptions, updateCrossSwapAction?: UpdateCrossSwapAction): Promise<TransactionResponse | string>

  /**
   * CrossSwap swap from Solana
   * @param option - The options for the swap
   * @returns Promise<any> The transaction
   */
  buildSwapFromSolana(option: SwapOptions): Promise<{
    signature: string
    serializedTrx: Uint8Array | null
  }>
}
