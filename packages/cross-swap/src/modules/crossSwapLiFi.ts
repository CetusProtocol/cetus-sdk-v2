import {
  CrossSwapLiFiConfigs,
  CrossSwapPlatform,
  CrossSwapToken,
  CrossSwapTokenBalance,
  Chain,
  ChainId,
  EstimateQuoteOptions,
  SwapOptions,
  CrossSwapRouter,
  CrossSwapQuote,
} from '../types/cross_swap'
import { CetusCrossSwapSDK } from '../sdk'
import {
  ChainType,
  createConfig,
  EVM,
  EVMProvider,
  executeRoute,
  ExecutionOptions,
  getRoutes,
  getToken,
  getTokenBalance,
  getTokenBalances,
  getTokens,
  Orders,
  Route,
  RouteExtended,
  RoutesRequest,
  SDKConfig,
  Solana,
  SolanaProvider,
  Sui,
  SuiProvider,
  Token,
  UTXO,
  UTXOProvider,
} from '@lifi/sdk'
import { supportChainLifiList } from '../config/support_chain_lifi'
import { getAccumulatedLifiFeeCosts, parseCrossTokenFromLiFi, parseLiFiTokenBalance } from '../utils/lifi'
import { CrossSwapLiFi } from '../interfaces/crossSwapLiFi'
import { CrossSwapErrorCode, handleError } from '../errors/errors'
import { d, DETAILS_KEYS, fromDecimalsAmount } from '@cetusprotocol/common-sdk'
import { isEqualTokenAddress } from '../utils/mayan'

export class LiFiCrossSwapModule extends CrossSwapLiFi {
  private _evmProvider: EVMProvider = EVM({})
  private _solanaProvider: SolanaProvider = Solana()
  private _suiProvider: SuiProvider = Sui()
  private _utxoProvider: UTXOProvider = UTXO()

  private _lifiConfigs: SDKConfig = {
    integrator: 'cetus',
    providers: [this._evmProvider, this._solanaProvider, this._suiProvider, this._utxoProvider],
  }

  private _CrossSwapLiFiConfigs: CrossSwapLiFiConfigs = {}

  constructor(sdk: CetusCrossSwapSDK) {
    super(sdk)
    const { lifi } = sdk.sdkOptions
    const { api_key, rpc_urls, referrer_bps } = lifi
    this._lifiConfigs.integrator = this.sdk.sdkOptions.lifi.integrator
    if (api_key) {
      this._lifiConfigs.apiKey = api_key
    }
    if (rpc_urls) {
      this._lifiConfigs.rpcUrls = rpc_urls
    }
    if (referrer_bps) {
      this._lifiConfigs.routeOptions = {
        fee: referrer_bps,
      }
    }
    this._lifiConfigs = createConfig({ ...this._lifiConfigs })
  }

  /**
   * Get the platform identifier for this CrossSwap
   * @returns CrossSwapPlatform The platform identifier
   */
  getPlatform(): CrossSwapPlatform {
    return CrossSwapPlatform.LI_FI
  }

  /**
   * Set the CrossSwap configs
   * @param configs
   * @returns
   */
  setCrossSwapLiFiConfigs(configs: CrossSwapLiFiConfigs) {
    const { sui, evm, solana, btc } = configs
    const { providers } = this._lifiConfigs
    if (!providers) {
      return
    }
    if (sui) {
      this._CrossSwapLiFiConfigs.sui = sui
      this._suiProvider.setOptions({ getWallet: async () => sui.wallet })
    }
    if (evm) {
      this._CrossSwapLiFiConfigs.evm = evm
      this._evmProvider.setOptions({ getWalletClient: async () => evm.wallet })
    }
    if (solana) {
      this._CrossSwapLiFiConfigs.solana = solana
      this._solanaProvider.setOptions({ getWalletAdapter: async () => solana.wallet })
    }
    if (btc) {
      this._CrossSwapLiFiConfigs.btc = btc
      this._utxoProvider.setOptions({ getWalletClient: async () => btc.wallet })
    }
  }

  /**
   * Get the CrossSwap configs
   * @returns CrossSwapLiFiConfigs The CrossSwap configs
   */
  getCrossSwapLiFiConfigs(): CrossSwapLiFiConfigs {
    return this._CrossSwapLiFiConfigs
  }

  /**
   * Execute the swap quote
   * @param option - The options for the swap
   * @param executionOptions - The execution options
   * @returns Promise<RouteExtended> The route
   */
  async executeSwapQuote(option: SwapOptions, executionOptions?: ExecutionOptions): Promise<RouteExtended> {
    const { quote } = option
    if (!quote.quote.lifi_quote) {
      return handleError(CrossSwapErrorCode.LifiQuoteRequired, 'Lifi quote is required', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          option,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'LiFiCrossSwapModule.crossSwapSwap',
      })
    }
    const executedRoute = await executeRoute(quote.quote.lifi_quote!, executionOptions)
    return executedRoute
  }

  /**
   * Estimate quote for the CrossSwap
   * @param options - The options for the quote
   * @returns Promise<any> The quote
   */
  async estimateQuote(options: EstimateQuoteOptions): Promise<CrossSwapRouter> {
    const { amount, from_token, to_token, from_chain_id, to_chain_id, slippage, lifi_configs } = options

    const quoteRequest: RoutesRequest = {
      fromChainId: from_chain_id,
      toChainId: to_chain_id,
      fromTokenAddress: from_token,
      toTokenAddress: to_token,
      fromAmount: amount,
      fromAddress: lifi_configs?.from_address,
      toAddress: lifi_configs?.to_address,
      options: {
        slippage: slippage,
        maxPriceImpact: 0.8,
        order: 'CHEAPEST',
      },
    }

    try {
      const res = await getRoutes(quoteRequest)
      const routes = res.routes
      if (routes.length === 0) {
        return {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: 'No route found',
            data: res,
          },
        } as CrossSwapRouter
      }

      const crossSwapQuotes = routes.map((route) => this.parseCrossSwapQuote(route))

      return {
        quotes: crossSwapQuotes,
      }
    } catch (error: any) {
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
    const res = await getTokens({ chains: chain_ids as any[] })
    const tokenMap: Record<number, CrossSwapToken[]> = {}

    Object.keys(res.tokens).forEach((chainId) => {
      const tokenList: CrossSwapToken[] = []
      const chain = this.getChain(Number(chainId) as any)
      res.tokens[Number(chainId)].forEach((t) => {
        tokenList.push(parseCrossTokenFromLiFi(t, chain))
      })

      tokenMap[Number(chainId)] = tokenList
    })
    return tokenMap
  }

  /**
   * Get a cross swap token by chain id and token address
   * @param chain_id - The chain id
   * @param token_address - The token address
   * @returns Promise<CrossSwapToken | undefined> The cross swap token
   */
  async getCrossSwapToken(chain_id: number, token_address: string): Promise<CrossSwapToken | undefined> {
    try {
      const token = await getToken(chain_id as any, token_address)
      return parseCrossTokenFromLiFi(token, this.getChain(chain_id))
    } catch (error) {
      console.log('🚀 ~ LiFiCrossSwapModule ~ getCrossSwapToken ~ error:', error)
      return undefined
    }
  }

  /**
   * Get all supported chains for the CrossSwap
   * @returns Promise<Chain[]> Array of supported chains
   */
  getSupportedChains(): Chain[] {
    // https://li.quest/v1/chains?chainTypes=EVM%2CSVM%2CUTXO%2CMVM
    return supportChainLifiList
  }

  /**
   * Get the token balances for the owner
   * @param walletAddress - The wallet address
   * @param tokens - The tokens to get the balances for
   * @returns Promise<Record<string, CrossSwapTokenBalance>> The token balances
   */
  async getOwnerTokenBalances(walletAddress: string, tokens: CrossSwapToken[]): Promise<CrossSwapTokenBalance[]> {
    const balances: CrossSwapTokenBalance[] = []
    if (tokens.length === 0) {
      return balances
    }

    const tokenList = tokens.map((item) => {
      const token: Token = {
        priceUSD: item.price_usd || '',
        symbol: item.symbol,
        decimals: item.decimals,
        name: item.name,
        chainId: item.chain_id,
        address: item.address,
      }
      return token
    })

    const res = await getTokenBalances(walletAddress, tokenList)
    res.forEach((balance) => {
      const data = parseLiFiTokenBalance(balance)
      if (data) {
        balances.push(data)
      }
    })

    return balances
  }

  parseCrossSwapQuote(route: Route): CrossSwapQuote {
    const fromChain = this.getChain(route.fromChainId)
    const toChain = this.getChain(route.toChainId)
    const fromToken = parseCrossTokenFromLiFi(route.fromToken, fromChain)
    const toToken = parseCrossTokenFromLiFi(route.toToken, toChain)

    let execution_duration = 0
    let gas_cost_usd = getAccumulatedLifiFeeCosts(route, this).gasCostUSD.toString()
    route.steps.forEach((step) => {
      const { estimate } = step
      const { executionDuration } = estimate
      execution_duration = d(execution_duration).add(executionDuration).toNumber()
    })

    const crossSwapQuote: CrossSwapQuote = {
      amount_in: route.fromAmount,
      amount_out: route.toAmount,
      min_amount_out: route.toAmountMin,
      amount_in_usd: route.fromAmountUSD,
      amount_out_usd: route.toAmountUSD,
      amount_in_formatted: fromDecimalsAmount(route.fromAmount, fromToken.decimals).toString(),
      amount_out_formatted: fromDecimalsAmount(route.toAmount, toToken.decimals).toString(),
      min_amount_out_formatted: fromDecimalsAmount(route.toAmountMin, toToken.decimals).toString(),
      gas_cost_usd,
      execution_duration,
      quote: {
        lifi_quote: route,
      },
      from_chain: fromChain,
      to_chain: toChain,
      from_token: fromToken,
      to_token: toToken,
      platform: CrossSwapPlatform.LI_FI,
    }
    return crossSwapQuote
  }
}
