// External dependencies - Sui related
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js'

// External dependencies - Cetus related
import type { BaseSdkOptions, Package } from '@cetusprotocol/common-sdk'
import { SdkWrapper } from '@cetusprotocol/common-sdk'
import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk'
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk'

// Internal modules
import { margin_trading_mainnet } from './config/mainnet'
import { MarketModules } from './modules/marketModules'
import { PermissionModules } from './modules/permissionModules'
import { PositionModules } from './modules/positionModules'
import { SuiLendModule } from './modules/suilendModule'
import { SwapModules } from './modules/swapModules'
import { LeverageThresholdConfig, MarginTradingConfigs, MarketLeverageThresholds, SuiLendConfigs } from './types'
import { SuiGrpcClient } from '@mysten/sui/grpc'

export interface SdkOptions extends BaseSdkOptions {
  full_rpc_url: string
  env: 'mainnet' | 'testnet'
  aggregator_url: string
  margin_trading: Package<MarginTradingConfigs>
  suilend: Package<SuiLendConfigs>
}

export class CetusMarginTradingSDK extends SdkWrapper<SdkOptions> {
  // Modules
  protected _marketModules: MarketModules
  protected _permissionModules: PermissionModules
  protected _positionModules: PositionModules
  protected _suilendModule: SuiLendModule
  protected _swapModules: SwapModules

  // Clients and utilities
  protected _aggregatorClient: AggregatorClient
  protected _clmmSDK: CetusClmmSDK
  protected _pythConnection: SuiPriceServiceConnection

  // Public properties
  senderAddress: string | undefined

  constructor(options: SdkOptions, clmmSDK?: CetusClmmSDK) {
    super(options)

    // Initialize modules
    this._suilendModule = new SuiLendModule(this)
    this._permissionModules = new PermissionModules(this)
    this._marketModules = new MarketModules(this)
    this._positionModules = new PositionModules(this)
    this._swapModules = new SwapModules(this)

    // Initialize clients
    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: options.sui_client || new SuiJsonRpcClient({ url: options.full_rpc_url!, network: options.env === 'testnet' ? 'testnet' : 'mainnet' }),
      env: options.env === 'testnet' ? Env.Testnet : Env.Mainnet,
    })

    this._clmmSDK = clmmSDK || CetusClmmSDK.createSDK({ env: options.env, full_rpc_url: options.full_rpc_url })

    this._pythConnection = new SuiPriceServiceConnection('https://hermes.pyth.network', {
      timeout: 30 * 1000,
    })

    this.setMarketLeverageThresholds({
      '0x7c62cbfa1884c02eec32cfa6a1e4325550fb6dda9579b030c3bae3031b80e0e4': {
        long_threshold: 1.65,
        short_threshold: 1.7,
      },
      '0xe41b1cc8154300743bfd7bb9e6325edc2beea98e957dbe4c68790e7a92a13922': {
        long_threshold: 1.55,
        short_threshold: 1.7,
      },
      "0x71bc9710e59c3f2c385e1530e16e9aecbcd02a1bab8a557825c73760efd9d0ec": {
        long_threshold: 1.65,
        short_threshold: 1.7,
      },
    })
  }

  // Module getters
  get SuiLendModule(): SuiLendModule {
    return this._suilendModule
  }

  get PermissionModules(): PermissionModules {
    return this._permissionModules
  }

  get MarketModules(): MarketModules {
    return this._marketModules
  }

  get PositionModules(): PositionModules {
    return this._positionModules
  }

  get SwapModules(): SwapModules {
    return this._swapModules
  }

  // Client getters
  get AggregatorClient(): AggregatorClient {
    return this._aggregatorClient
  }

  get ClmmSDK(): CetusClmmSDK {
    return this._clmmSDK
  }

  get PythConnection(): SuiPriceServiceConnection {
    return this._pythConnection
  }

  private _marketLeverageThresholds: MarketLeverageThresholds = {}

  /**
   * Get all leverage thresholds for all markets.
   */
  getMarketLeverageThresholds(): MarketLeverageThresholds {
    return { ...this._marketLeverageThresholds }
  }

  /**
   * Get leverage threshold for a specific market.
   * @param marketId The market id string.
   */
  getLeverageThresholdForMarket(marketId: string): LeverageThresholdConfig | undefined {
    return this._marketLeverageThresholds[marketId]
  }

  /**
   * Set leverage threshold for a specific market.
   * @param marketId The market id string.
   * @param thresholdConfig The threshold configuration.
   */
  setLeverageThresholdForMarket(marketId: string, thresholdConfig: LeverageThresholdConfig): void {
    this._marketLeverageThresholds[marketId] = thresholdConfig
  }

  /**
   * Set all market leverage thresholds at once.
   * @param thresholds The map of marketId to LeverageThresholdConfig.
   */
  setMarketLeverageThresholds(thresholds: MarketLeverageThresholds): void {
    this._marketLeverageThresholds = { ...thresholds }
  }

  // Static factory methods
  static createSDK(options: BaseSdkOptions): CetusMarginTradingSDK {
    return CetusMarginTradingSDK.createCustomSDK({ ...margin_trading_mainnet, ...options })
  }

  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions): CetusMarginTradingSDK {
    return new CetusMarginTradingSDK(options)
  }
}
