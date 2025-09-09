import { d, DETAILS_KEYS, toDecimalsAmount } from '@cetusprotocol/common-sdk'
import {
  CrossSwapPlatform,
  CrossSwapToken,
  Chain,
  ChainId,
  EstimateQuoteOptions,
  MayanConfigs,
  SwapOptions,
  CrossSwapRouter,
  CrossSwapQuote,
  UpdateCrossSwapAction,
} from '../types/cross_swap'
import { fetchTokenList, fetchQuote, createSwapFromSuiMoveCalls, swapFromEvm, swapFromSolana, Erc20Permit } from '@mayanfinance/swap-sdk'
import { Transaction } from '@mysten/sui/transactions'
import { CetusCrossSwapSDK } from '../sdk'
import { CrossSwapErrorCode, handleError } from '../errors/errors'
import { TransactionResponse } from 'ethers'
import { getErcPermitOrAllowance, isEqualTokenAddress, parseCrossTokenFromMayan } from '../utils/mayan'
import { supportChainMayanList } from '../config/support_chain_mayan'
import { CrossSwapMayan } from '../interfaces/crossSwapMayan'
import { ChainType } from '@lifi/sdk'

export class MayanCrossSwapModule extends CrossSwapMayan {
  private _mayanConfigs: MayanConfigs = {}

  constructor(sdk: CetusCrossSwapSDK) {
    super(sdk)
  }

  /**
   * Get the platform identifier for this CrossSwap
   * @returns CrossSwapPlatform The platform identifier
   */
  getPlatform(): CrossSwapPlatform {
    return CrossSwapPlatform.MAYAN
  }

  /**
   * Get the current Mayan configs
   * @returns The current Mayan configs
   */
  get mayanConfigs(): MayanConfigs {
    return this._mayanConfigs
  }

  /**
   * Set the Mayan configs
   * @param configs The Mayan configs to set
   */
  set mayanConfigs(configs: MayanConfigs) {
    const { solana, evm } = configs
    if (solana) {
      this._mayanConfigs.solana = solana
    }
    if (evm) {
      this._mayanConfigs.evm = evm
    }
  }

  /**
   * CrossSwap swap from SUI
   * @param option - The options for the swap
   * @param suiClient - The SUI client
   * @returns Promise<Transaction> The transaction
   */
  async buildSwapFromSui(option: SwapOptions): Promise<Transaction> {
    const { quote, swap_wallet_address, destination_address } = option
    const { referrer_addresses } = this.sdk.sdkOptions.mayan

    if (quote === undefined) {
      return handleError(CrossSwapErrorCode.MayanQuoteRequired, 'Mayan quote is required', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          option,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.buildSwapFromSui',
      })
    }

    try {
      const tx = await createSwapFromSuiMoveCalls(
        quote.quote.mayan_quote!,
        swap_wallet_address,
        destination_address,
        referrer_addresses,
        undefined,
        this.sdk.FullClient as any
      )
      return tx
    } catch (error: any) {
      console.log('🚀 ~ MayanCrossSwap.buildSwapFromSui ~ error:', error)
      return handleError(CrossSwapErrorCode.SwapFailed, error, {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          option,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.CrossSwapSwapFromSui',
      })
    }
  }

  /**
   * CrossSwap swap from EVM
   * @param option - The options for the swap
   * @returns Promise<any> The transaction
   */
  async buildSwapFromEvm(option: SwapOptions, updateCrossSwapAction?: UpdateCrossSwapAction): Promise<TransactionResponse | string> {
    const { quote, swap_wallet_address, destination_address } = option
    const { referrer_addresses } = this.sdk.sdkOptions.mayan

    if (quote === undefined) {
      return handleError(CrossSwapErrorCode.MayanQuoteRequired, 'Mayan quote is required', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          option,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.buildSwapFromEvm',
      })
    }

    const { evm } = this.mayanConfigs
    if (!evm) {
      return handleError(CrossSwapErrorCode.InvalidConfigs, 'EVM configs are required', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          quote,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.CrossSwapSwapFromEvm',
      })
    }

    const signer = evm.evm_signer

    try {
      let permit: Erc20Permit | undefined = await getErcPermitOrAllowance(
        quote.quote.mayan_quote!,
        signer,
        swap_wallet_address,
        updateCrossSwapAction
      )

      const tx = await swapFromEvm(
        quote.quote.mayan_quote!,
        swap_wallet_address,
        destination_address,
        referrer_addresses,
        evm.evm_signer,
        permit,
        undefined,
        undefined
      )
      return tx
    } catch (error: any) {
      return handleError(CrossSwapErrorCode.SwapFailed, error, {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          quote,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.CrossSwapSwapFromEvm',
      })
    }
  }

  /**
   * CrossSwap swap from Solana
   * @param option - The options for the swap
   * @returns Promise<{
   *   signature: string
   *   serializedTrx: Uint8Array | null
   * }> The transaction
   */
  async buildSwapFromSolana(option: SwapOptions): Promise<{
    signature: string
    serializedTrx: Uint8Array | null
  }> {
    const { quote, swap_wallet_address, destination_address } = option
    const { referrer_addresses } = this.sdk.sdkOptions.mayan
    if (quote === undefined) {
      return handleError(CrossSwapErrorCode.MayanQuoteRequired, 'Mayan quote is required', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          option,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.buildSwapFromSolana',
      })
    }

    const { solana } = this.mayanConfigs
    if (!solana) {
      return handleError(CrossSwapErrorCode.InvalidConfigs, 'Solana configs are required', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          quote,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.CrossSwapSwapFromSolana',
      })
    }

    try {
      const swapRes = await swapFromSolana(
        quote.quote.mayan_quote!,
        swap_wallet_address,
        destination_address,
        referrer_addresses,
        solana.signer,
        solana.connection,
        [],
        { skipPreflight: true }
      )
      return swapRes
    } catch (error: any) {
      return handleError(CrossSwapErrorCode.SwapFailed, error, {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          quote,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'MayanCrossSwap.CrossSwapSwapFromSolana',
      })
    }
  }

  /**
   * Estimate quote for the CrossSwap
   * @param options - The options for the quote
   * @returns Promise<any> The quote
   */
  async estimateQuote(options: EstimateQuoteOptions): Promise<CrossSwapRouter> {
    const { amount, from_token, to_token, from_chain_id, to_chain_id, slippage, mayan_configs } = options
    const { referrer_addresses, referrer_bps } = this.sdk.sdkOptions.mayan
    const from_chain = this.getChain(from_chain_id)
    const to_chain = this.getChain(to_chain_id)
    try {
      const res = await fetchQuote({
        amountIn64: amount,
        fromToken: from_token,
        fromChain: from_chain.name_id as any,
        toToken: to_token,
        toChain: to_chain.name_id as any,
        slippageBps: slippage ? Math.round(slippage * 10000) : 'auto',
        gasDrop: mayan_configs?.gas_drop,
        referrer: referrer_addresses.solana,
        referrerBps: referrer_bps,
      })

      if (!Array.isArray(res) || res.length === 0) {
        return {
          error: {
            code: 'NO_ROUTE_FOUND',
            message: 'No valid route found for the swap',
            data: res,
          },
        } as CrossSwapRouter
      }

      const mayan_routes = res.map((route) => {
        return this.parseCrossSwapQuote(route)
      })

      return {
        quotes: mayan_routes,
      }
    } catch (error: any) {
      if (error?.code === 9999) {
        return {
          error: {
            code: 'SDK_VERSION_ERROR',
            message: error.message || 'Mayan Swap SDK is outdated!',
            data: error,
          },
        } as CrossSwapRouter
      }

      if (error?.code) {
        return {
          error: {
            code: String(error.code),
            message: error.message || 'Route not found',
            data: error,
          },
        } as CrossSwapRouter
      }

      return {
        error: {
          code: 'UNKNOWN_ERROR',
          message: error?.message || 'An unexpected error occurred while fetching quote',
          data: error?.data,
        },
      } as CrossSwapRouter
    }
  }

  /**
   * Get all supported tokens for the CrossSwap
   * @param chain_id - The chain id
   * @returns Promise<CrossSwapToken[]> Array of tokens
   */
  async getSupportedTokens(chain_ids: ChainId[]): Promise<Record<number, CrossSwapToken[]>> {
    const res = await Promise.allSettled(chain_ids.map((chain_id) => fetchTokenList(this.getChain(chain_id).name_id as any)))
    const tokenMap: Record<number, CrossSwapToken[]> = {}

    res.forEach((result, index) => {
      const chain_id = chain_ids[index]
      const chain = this.getChain(chain_id)
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        const tokenList: CrossSwapToken[] = result.value.map((token) => parseCrossTokenFromMayan(token, chain))

        tokenMap[Number(chain_id)] = tokenList
      } else {
        // Handle rejected promises by setting empty array
        tokenMap[Number(chain_id)] = []
      }
    })

    return tokenMap
  }

  /**
   * Get a cross swap token by chain id and token address
   * @param chain_id - The chain id
   * @param token_address - The token address
   * @param use_cache - Whether to use cache
   * @returns Promise<CrossSwapToken | undefined> The cross swap token
   */
  async getCrossSwapToken(chain_id: number, token_address: string, use_cache?: boolean): Promise<CrossSwapToken | undefined> {
    const chain = this.getChain(chain_id)
    const isMvm = chain.type === ChainType.MVM
    try {
      const tokenMap = await this.getSupportedTokens([chain_id as any])
      return tokenMap[chain_id]?.find((token) => isEqualTokenAddress(token.address, token_address, isMvm))
    } catch (error) {
      console.log('🚀 ~ MayanCrossSwapModule ~ getCrossSwapToken ~ error:', error)
      return undefined
    }
  }

  /**
   * Get all supported chains for the CrossSwap
   * @returns Promise<Chain[]> Array of supported chains
   */
  getSupportedChains(): Chain[] {
    // https://sia.mayan.finance/v6/init
    return supportChainMayanList
  }

  parseCrossSwapQuote(route: any): CrossSwapQuote {
    const fromChain = this.getChainByChainName(route.fromChain)
    const toChain = this.getChainByChainName(route.toChain)
    const fromToken = parseCrossTokenFromMayan(route.fromToken, fromChain)
    const toToken = parseCrossTokenFromMayan(route.toToken, toChain)
    const amount_out = toDecimalsAmount(route.expectedAmountOut, toToken.decimals)
    const amount_out_formatted = route.expectedAmountOut.toString()

    toToken.price_usd = toToken.price_usd || route.toTokenPrice || route.toPrice

    const gas_cost_usd = route.clientRelayerFeeSuccess ? route.clientRelayerFeeSuccess : route.clientRelayerFeeRefund

    const crossSwapQuote: CrossSwapQuote = {
      amount_in: route.effectiveAmountIn64,
      amount_in_formatted: route.effectiveAmountIn,
      amount_out: amount_out,
      amount_out_formatted,
      min_amount_out: toDecimalsAmount(route.minAmountOut, toToken.decimals),
      min_amount_out_formatted: route.minAmountOut.toString(),
      amount_in_usd: '',
      amount_out_usd: d(amount_out_formatted)
        .mul(toToken.price_usd || 0)
        .toString(),
      gas_cost_usd,
      execution_duration: route.etaSeconds,
      quote: {
        mayan_quote: route,
      },
      from_chain: fromChain,
      to_chain: toChain,
      from_token: fromToken,
      to_token: toToken,
      platform: CrossSwapPlatform.MAYAN,
    }
    return crossSwapQuote
  }
}
