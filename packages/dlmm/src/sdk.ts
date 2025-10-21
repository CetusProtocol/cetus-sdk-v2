import type { BaseSdkOptions, Package } from '@cetusprotocol/common-sdk'
import { SdkWrapper } from '@cetusprotocol/common-sdk'
import type { DlmmConfigs } from './types/dlmm'
import { dlmmMainnet } from './config/mainnet'
import { PoolModule } from './modules/poolModule'
import { dlmmTestnet } from './config/testnet'
import { PositionModule } from './modules/positionModule'
import { SwapModule } from './modules/swapModule'
import { PartnerModule } from './modules/partnerModule'
import { RewardModule } from './modules/rewardModule'
import { ConfigModule } from './modules/configModule'

/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions extends BaseSdkOptions {
  dlmm_pool: Package<DlmmConfigs>
  dlmm_router: Package
  faucet?: Package
}

/**
 * The entry class of CetusDcaSDK, which is almost responsible for all interactions with dca.
 */
export class CetusDlmmSDK extends SdkWrapper<SdkOptions> {
  protected _pool: PoolModule
  protected _position: PositionModule
  protected _swap: SwapModule
  protected _partner: PartnerModule
  protected _reward: RewardModule
  protected _config: ConfigModule

  constructor(options: SdkOptions) {
    super(options)

    this._pool = new PoolModule(this)
    this._position = new PositionModule(this)
    this._swap = new SwapModule(this)
    this._partner = new PartnerModule(this)
    this._reward = new RewardModule(this)
    this._config = new ConfigModule(this)
  }

  get Pool(): PoolModule {
    return this._pool
  }

  get Position(): PositionModule {
    return this._position
  }

  get Swap(): SwapModule {
    return this._swap
  }

  get Partner(): PartnerModule {
    return this._partner
  }

  get Reward(): RewardModule {
    return this._reward
  }

  get Config(): ConfigModule {
    return this._config
  }

  /**
   * Static factory method to initialize the SDK
   * @param options SDK initialization options
   * @returns An instance of CetusBurnDK
   */
  static createSDK(options: BaseSdkOptions): CetusDlmmSDK {
    const { env = 'mainnet' } = options
    return env === 'mainnet'
      ? CetusDlmmSDK.createCustomSDK({ ...dlmmMainnet, ...options })
      : CetusDlmmSDK.createCustomSDK({ ...dlmmTestnet, ...options })
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions): CetusDlmmSDK {
    return new CetusDlmmSDK(options)
  }
}
