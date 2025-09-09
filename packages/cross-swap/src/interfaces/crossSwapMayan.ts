import { ICrossSwap } from './ICrossSwap'
import { CetusCrossSwapSDK } from '../sdk'
import {
  CrossSwapPlatform,
  CrossSwapToken,
  Chain,
  ChainId,
  EstimateQuoteOptions,
  SwapOptions,
  CrossSwapRouter,
  CrossSwapQuote,
  UpdateCrossSwapAction,
} from '../types/cross_swap'
import { Transaction } from '@mysten/sui/transactions'
import { TransactionResponse } from 'ethers'
import { CrossSwapErrorCode, handleError } from '../errors/errors'
import { DETAILS_KEYS } from '@cetusprotocol/common-sdk'
import { ICrossSwapMayan } from './ICrossSwapMayan'
import { Quote } from '@mayanfinance/swap-sdk'

export abstract class CrossSwapMayan implements ICrossSwapMayan {
  protected constructor(protected readonly sdk: CetusCrossSwapSDK) {}

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

  abstract buildSwapFromSui(option: SwapOptions): Promise<Transaction>

  abstract buildSwapFromEvm(option: SwapOptions, updateCrossSwapAction?: UpdateCrossSwapAction): Promise<TransactionResponse | string>

  abstract parseCrossSwapQuote(route: Quote): CrossSwapQuote

  abstract buildSwapFromSolana(option: SwapOptions): Promise<{
    signature: string
    serializedTrx: Uint8Array | null
  }>

  abstract getCrossSwapToken(chain_id: ChainId, token_address: string, use_cache?: boolean): Promise<CrossSwapToken | undefined>
}
