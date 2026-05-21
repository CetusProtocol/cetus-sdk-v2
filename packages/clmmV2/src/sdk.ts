import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk'
import type { BaseSdkOptions, Package } from '@cetusprotocol/common-sdk'
import { SdkWrapper } from '@cetusprotocol/common-sdk'
import { ConfigModule, RewarderModule, ZapModule } from './modules'
import { PoolModule } from './modules/poolModule'
import { PositionModule } from './modules/positionModule'
import { SwapModule } from './modules/swapModule'
import { ClmmV2Config } from './types/clmm_type'
import { clmmMainnet } from './config/mainnet'
import { clmmTestnet } from './config/testnet'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { PartnerModule } from './modules/partnerModule'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'

/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions extends BaseSdkOptions {

  /**
   * Package containing Cryptocurrency Liquidity Mining Module (CLMM) pool configurations.
   */
  clmm_pool: Package<ClmmV2Config>

  /**
   * Package containing integration-related configurations.
   */
  router: Package

  pyth_urls?: string[]
}

/**
 * The entry class of CetusClmmSDK, which is almost responsible for all interactions with CLMM.
 */
export class CetusClmmV2SDK extends SdkWrapper<SdkOptions> {
  /**
   * Provide interact with clmm pools with a pool router interface.
   */
  protected _pool: PoolModule

  /**
   * Provide interact  with a position rewarder interface.
   */
  protected _rewarder: RewarderModule

  /**
   * Provide interact with a pool swap router interface.
   */
  protected _swap: SwapModule

  /**
   * Provide interact with clmm position with a position router interface.
   */
  protected _position: PositionModule

  /**
   * Provide  interact with clmm pool and coin and launchpad pool config
   */
  protected _config: ConfigModule

  protected _zap: ZapModule

  protected _partner: PartnerModule


  protected _aggregatorClient: AggregatorClient
  FarmsSDK: any


  constructor(options: SdkOptions) {
    super(options)

    this._swap = new SwapModule(this)
    this._pool = new PoolModule(this)
    this._position = new PositionModule(this)
    this._config = new ConfigModule(this)
    this._rewarder = new RewarderModule(this)
    this._zap = new ZapModule(this)
    this._partner = new PartnerModule(this)

    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: options.sui_client || this.FullClient._client,
      env: options.env === 'testnet' ? Env.Testnet : Env.Mainnet,
      pythUrls: options.pyth_urls,
    })
  }

  /**
   * Getter for the Pool property.
   * @returns {PoolModule} The Pool property value.
   */
  get Pool(): PoolModule {
    return this._pool
  }


  get Partner(): PartnerModule {
    return this._partner
  }

  get Zap(): ZapModule {
    return this._zap
  }

  /**
   * Getter for the Position property.
   * @returns {PositionModule} The Position property value.
   */
  get Position(): PositionModule {
    return this._position
  }

  /**
   * Getter for the Config property.
   * @returns {ConfigModule} The Config property value.
   */
  get Config(): ConfigModule {
    return this._config
  }

  /**
   * Getter for the Rewarder property.
   * @returns {RewarderModule} The Rewarder property value.
   */
  get Rewarder(): RewarderModule {
    return this._rewarder
  }

  /**
   * Getter for the Swap property.
   * @returns {SwapModule} The Swap property value.
   */
  get Swap(): SwapModule {
    return this._swap
  }


  get AggregatorClient(): AggregatorClient {
    return this._aggregatorClient
  }


  static createSDK(options: BaseSdkOptions): CetusClmmV2SDK {
    const { env = 'mainnet' } = options
    return env === 'mainnet'
      ? CetusClmmV2SDK.createCustomSDK({ ...clmmMainnet, ...options })
      : CetusClmmV2SDK.createCustomSDK({ ...clmmTestnet, ...options })
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions): CetusClmmV2SDK {
    return new CetusClmmV2SDK(options)
  }
}
