import type { BaseSdkOptions } from '@cetusprotocol/common-sdk'
import { DETAILS_KEYS, SdkWrapper } from '@cetusprotocol/common-sdk'
import { CrossSwapMainnet } from './config/mainnet'
import { ExecutionOptions, RouteExtended, RPCUrls } from '@lifi/sdk'
import {
  CrossSwapPlatform,
  CrossSwapToken,
  EstimateQuoteOptions,
  SwapOptions,
  Chain,
  ChainId,
  MayanConfigs,
  CrossSwapLiFiConfigs,
  CrossSwapResult,
  CrossSwapTokenBalance,
  CrossSwapRouter,
  UpdateCrossSwapAction,
  SOL_MAYAN_ADDRESS,
  SOL_LI_FI_ADDRESS,
} from './types/cross_swap'
import { ICrossSwapMayan } from './interfaces/ICrossSwapMayan'
import { ICrossSwapLiFi } from './interfaces/ICrossSwapLiFi'
import { CrossSwapErrorCode, handleError } from './errors/errors'
import { LiFiCrossSwapModule, MayanCrossSwapModule } from './modules'

/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions extends BaseSdkOptions {
  mayan: {
    /**
     * if you wish to receive referrer fee you can assign your wallet address to these parameters.
     */
    referrer_addresses: {
      solana?: string
      sui?: string
      evm?: string
    }
    /**
     * You can set the referrerBps you are willing to receive from user (Max: 50 bps)
     */
    referrer_bps?: number
  }
  lifi: {
    integrator: string
    api_key?: string
    rpc_urls?: RPCUrls
    /**
     *  0.03 = take 3% integrator fee (requires verified integrator to be set)
     */
    referrer_bps?: number
  }
}

/**
 * The entry class of CetusCrossSwapSDK, which is almost responsible for all interactions with CrossSwap.
 */
export class CetusCrossSwapSDK extends SdkWrapper<SdkOptions> {
  protected readonly CrossSwaps: Map<CrossSwapPlatform, ICrossSwapMayan | ICrossSwapLiFi>

  constructor(options: SdkOptions) {
    super(options)

    this.CrossSwaps = new Map()
    this.CrossSwaps.set(CrossSwapPlatform.MAYAN, new MayanCrossSwapModule(this))
    this.CrossSwaps.set(CrossSwapPlatform.LI_FI, new LiFiCrossSwapModule(this))
  }

  /**
   * Set the CrossSwap configs
   * @param platform - The platform to set the configs for
   * @param configs - The configs to set
   */
  setCrossSwapConfigs(platform: CrossSwapPlatform, configs: CrossSwapLiFiConfigs | MayanConfigs) {
    if (platform === CrossSwapPlatform.LI_FI) {
      const CrossSwap = this.getPlatformCrossSwap(CrossSwapPlatform.LI_FI) as LiFiCrossSwapModule
      CrossSwap.setCrossSwapLiFiConfigs(configs as CrossSwapLiFiConfigs)
    } else if (platform === CrossSwapPlatform.MAYAN) {
      const CrossSwap = this.getPlatformCrossSwap(CrossSwapPlatform.MAYAN) as MayanCrossSwapModule
      CrossSwap.mayanConfigs = configs as MayanConfigs
    }
  }

  /**
   * Get the CrossSwap configs
   * @param platform - The platform to get the configs for
   * @returns The configs
   */
  getCrossSwapConfigs<T extends CrossSwapLiFiConfigs | MayanConfigs>(platform: CrossSwapPlatform): T {
    if (platform === CrossSwapPlatform.LI_FI) {
      const CrossSwap = this.getPlatformCrossSwap(CrossSwapPlatform.LI_FI) as LiFiCrossSwapModule
      return CrossSwap.getCrossSwapLiFiConfigs() as T
    } else if (platform === CrossSwapPlatform.MAYAN) {
      const CrossSwap = this.getPlatformCrossSwap(CrossSwapPlatform.MAYAN) as MayanCrossSwapModule
      return CrossSwap.mayanConfigs as T
    }
    throw new Error(`Unsupported platform: ${platform} for getCrossSwapConfigs`)
  }

  /**
   * Get the CrossSwap for the platform
   * @param platform - The platform to get the CrossSwap for
   * @returns ICrossSwapMayan | ICrossSwapLiFi The CrossSwap
   */
  getPlatformCrossSwap(platform: CrossSwapPlatform): ICrossSwapMayan | ICrossSwapLiFi {
    const CrossSwap = this.CrossSwaps.get(platform)
    if (!CrossSwap) {
      throw new Error(`Unsupported platform: ${platform}`)
    }
    return CrossSwap
  }

  /**
   * Get supported platforms for the CrossSwap
   * @returns CrossSwapPlatform[] Array of supported platforms
   */
  getSupportedPlatforms(): CrossSwapPlatform[] {
    return Array.from(this.CrossSwaps.keys())
  }

  /**
   * Get supported chains for the CrossSwap
   * @param platform - The platform to get supported chains for
   * @returns Chain[] Array of supported chains
   */
  getSupportedChains(platform: CrossSwapPlatform): Chain[] {
    return this.getPlatformCrossSwap(platform).getSupportedChains()
  }

  /**
   * Get the chain for the platform
   * @param platform - The platform to get the chain for
   * @param chain_id - The chain id to get
   * @returns Chain The chain
   */
  getChain(platform: CrossSwapPlatform, chain_id: ChainId): Chain {
    return this.getPlatformCrossSwap(platform).getChain(chain_id)
  }

  /**
   * Fetch token list from the CrossSwap
   * @param platform - The platform to fetch tokens for
   * @param chain - The chain to fetch tokens for
   * @param nonPortal - Whether to include non-portal tokens
   * @param tokenStandards - The token standards to include
   * @returns Promise<CrossSwapToken[]> Array of tokens
   */
  async getSupportedTokens(platform: CrossSwapPlatform, chain_ids: ChainId[]): Promise<Record<ChainId, CrossSwapToken[]>> {
    return await this.getPlatformCrossSwap(platform).getSupportedTokens(chain_ids)
  }

  /**
   * Get a cross swap token by chain id and token address
   * @param platform - The platform to get the token for
   * @param chain_id - The chain id to get the token for
   * @param token_address - The token address to get the token for
   * @param use_cache - Whether to use cache
   * @returns Promise<CrossSwapToken | undefined> The cross swap token
   */
  getCrossSwapToken(
    platform: CrossSwapPlatform,
    chain_id: ChainId,
    token_address: string,
    use_cache?: boolean
  ): Promise<CrossSwapToken | undefined> {
    return this.getPlatformCrossSwap(platform).getCrossSwapToken(chain_id, token_address, use_cache)
  }

  /**
   * Estimate quote for the CrossSwap
   * @param platforms - The platforms to estimate quote for
   * @param options - The options for the quote
   * @returns Promise<any> The quote
   */
  async estimateQuote(platform: CrossSwapPlatform, options: EstimateQuoteOptions): Promise<CrossSwapRouter> {
    console.log('🚀 ~ CetusCrossSwapSDK.estimateQuote ~ options:', {
      platform,
      options,
    })
    return await this.getPlatformCrossSwap(platform).estimateQuote(options)
  }

  /**
   * Build the CrossSwap swap payload
   * @param option - The options for the swap
   * @returns Promise<CrossSwapSwapPayload> The payload
   */
  async buildCrossSwapResult(option: SwapOptions, updateCrossSwapAction?: UpdateCrossSwapAction): Promise<CrossSwapResult> {
    console.log('🚀 ~ CetusCrossSwapSDK.buildCrossSwapSwapPayload ~ option:', option)
    const { platform, from_chain } = option.quote
    const CrossSwap = this.getPlatformCrossSwap(platform)
    const from_chain_id = from_chain.id

    if (platform === CrossSwapPlatform.MAYAN) {
      const mayanCrossSwap = CrossSwap as ICrossSwapMayan
      if (from_chain_id === ChainId.SOL_MAYAN) {
        const res = await mayanCrossSwap.buildSwapFromSolana(option)
        return {
          solana: res,
        } as CrossSwapResult
      } else if (from_chain_id === ChainId.SUI_MAYAN) {
        const res = await mayanCrossSwap.buildSwapFromSui(option)
        return {
          sui: res,
        } as CrossSwapResult
      } else {
        const res = await mayanCrossSwap.buildSwapFromEvm(option, updateCrossSwapAction)
        return {
          evm: res,
        } as CrossSwapResult
      }
    }
    throw new Error(`Unsupported platform: ${platform} for buildCrossSwapSwapPayload`)
  }

  /**
   * Execute the swap quote from LiFi
   * @param option - The options for the swap
   * @param executionOptions - The execution options
   * @returns Promise<RouteExtended> The route
   */
  async executeSwapQuoteFromLiFi(option: SwapOptions, executionOptions?: ExecutionOptions): Promise<RouteExtended> {
    console.log('🚀 ~ CetusCrossSwapSDK.buildCrossSwapSwapPayload ~ option:', option)
    const { platform } = option.quote
    const CrossSwap = this.getPlatformCrossSwap(platform)

    if (platform === CrossSwapPlatform.LI_FI) {
      const lifiCrossSwap = CrossSwap as ICrossSwapLiFi
      const res = await lifiCrossSwap.executeSwapQuote(option, executionOptions)
      return res
    }
    throw new Error(`Unsupported platform: ${platform} for CrossSwapLiFiSwap`)
  }

  /**
   * Get the owner token balances
   * @param platform - The platform to get the balances for
   * @param walletAddress - The wallet address
   * @param tokens - The tokens to get the balances for
   * @returns Promise<Record<string, CrossSwapTokenBalance>> The token balances
   */
  async getOwnerTokenBalances(
    platform: CrossSwapPlatform,
    walletAddress: string,
    tokens: CrossSwapToken[]
  ): Promise<CrossSwapTokenBalance[]> {
    const liFiCrossSwap = this.CrossSwaps.get(CrossSwapPlatform.LI_FI) as LiFiCrossSwapModule
    if (platform === CrossSwapPlatform.MAYAN) {
      const chainId = tokens[0].chain_id
      let tempTokens: CrossSwapToken[] = []
      // Mayan chain id is not the same as LiFi chain id, so we need to convert it
      const liFiChainId = chainId === ChainId.SUI_MAYAN ? ChainId.SUI_LI_FI : ChainId.SOL_LI_FI
      const needConvert = chainId === ChainId.SUI_MAYAN || chainId === ChainId.SOL_MAYAN
      if (needConvert) {
        tempTokens = tokens.map((token) => {
          if (chainId === ChainId.SOL_MAYAN && token.address === SOL_MAYAN_ADDRESS) {
            return {
              ...token,
              chain_id: liFiChainId,
              address: SOL_LI_FI_ADDRESS,
            }
          }
          return {
            ...token,
            chain_id: liFiChainId,
          }
        })
      } else {
        tempTokens = tokens
      }
      const mayanBalances = await liFiCrossSwap.getOwnerTokenBalances(walletAddress, tempTokens)
      if (needConvert) {
        mayanBalances.forEach((item) => {
          item.chain_id = chainId
          if (chainId === ChainId.SOL_MAYAN && item.address === SOL_LI_FI_ADDRESS) {
            item.address = SOL_MAYAN_ADDRESS
          }
        })
      }
      return mayanBalances
    } else {
      const liFiBalances = await liFiCrossSwap.getOwnerTokenBalances(walletAddress, tokens)
      return liFiBalances
    }
  }

  /**
   * Static factory method to initialize the SDK
   * @param options SDK initialization options
   * @returns An instance of CetusBurnDK
   */
  static createSDK(options: BaseSdkOptions): CetusCrossSwapSDK {
    const { env = 'mainnet' } = options
    if (env === 'testnet') {
      handleError(CrossSwapErrorCode.InvalidEnvironment, 'Testnet is not supported for CrossSwap', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          env,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'CetusCrossSwapSDK.createSDK',
      })
    }
    return CetusCrossSwapSDK.createCustomSDK({ ...CrossSwapMainnet, ...options })
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions): CetusCrossSwapSDK {
    if (options.env === 'testnet') {
      handleError(CrossSwapErrorCode.InvalidEnvironment, 'Testnet is not supported for CrossSwap', {
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          env: options.env,
        },
        [DETAILS_KEYS.METHOD_NAME]: 'CetusCrossSwapSDK.createCustomSDK',
      })
    }
    return new CetusCrossSwapSDK(options)
  }
}
