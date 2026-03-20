import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk'
import { BaseSdkOptions, Package, SdkWrapper } from '@cetusprotocol/common-sdk'
import { CetusFarmsSDK } from '@cetusprotocol/farms-sdk'
import { vaultsMainnet } from './config/mainnet'
import { vaultsTestnet } from './config/testnet'
import { VaultsModule } from './modules/vaultsModule'
import { VaultsConfigs } from './types/vaults'
import { VestConfigs } from './types/vest'
import { VestModule } from './modules/vestModule'
import { MigrateModule } from './modules/migrateModule'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
/**
 * Represents options and configurations for an SDK.
 */
export interface SdkOptions extends BaseSdkOptions {
  /**
   * The URL of the aggregator service.
   */
  aggregator_url: string
  /**
   * A list of  aggregator providers.
   */
  providers: string[]

  /**
   * A list of Pyth price ID.
   */
  pyth_urls?: string[]

  vaults: Package<VaultsConfigs>

  vest?: Package<VestConfigs>
}

/**
 * The entry class of CetusFarmsSDK, which is almost responsible for all interactions with farms.
 */
export class CetusVaultsSDK extends SdkWrapper<SdkOptions> {
  /**
   * Module for managing vaults.
   */
  protected _vaultsModule: VaultsModule

  protected _migrateModule: MigrateModule

  protected _clmmSDK: CetusClmmSDK

  protected _farmsSDK: CetusFarmsSDK

  /**
   * Client for interacting with the Aggregator service.
   */
  protected _aggregatorClient: AggregatorClient

  protected _vestModule: VestModule

  constructor(options: SdkOptions, clmmSDK?: CetusClmmSDK) {
    super(options)

    this._vaultsModule = new VaultsModule(this)
    this._clmmSDK = clmmSDK || CetusClmmSDK.createSDK({ env: options.env, full_rpc_url: options.full_rpc_url })
    this._farmsSDK = CetusFarmsSDK.createSDK({ env: options.env, full_rpc_url: options.full_rpc_url }, this._clmmSDK)
    this._vestModule = new VestModule(this)
    this._migrateModule = new MigrateModule(this)
    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: options.sui_client || new SuiJsonRpcClient({ url: options.full_rpc_url!, network: options.env === 'testnet' ? 'testnet' : 'mainnet' }),
      env: options.env === 'testnet' ? Env.Testnet : Env.Mainnet,
      pythUrls: options.pyth_urls,
    })
  }

  setSenderAddress(value: string): void {
    this._farmsSDK.setSenderAddress(value)
  }

  getSenderAddress(validate: boolean = true): string {
    return this._farmsSDK.getSenderAddress(validate)
  }

  get ClmmSDK(): CetusClmmSDK {
    return this._clmmSDK
  }

  get FarmsSDK(): CetusFarmsSDK {
    return this._farmsSDK
  }

  get AggregatorClient(): AggregatorClient {
    return this._aggregatorClient
  }

  get Vaults(): VaultsModule {
    return this._vaultsModule
  }

  get Migrate(): MigrateModule {
    return this._migrateModule
  }

  get Vest(): VestModule {
    return this._vestModule
  }

  /**
   * Updates the providers for the AggregatorClient.
   * @param providers - The new providers to set.
   */
  updateProviders(providers: string[]) {
    if (providers.length === 0) {
      throw new Error('providers is empty')
    }
    this._sdkOptions.providers = providers
  }

  updateFullRpcUrl(url: string): void {
    super.updateFullRpcUrl(url)
    this._farmsSDK.updateFullRpcUrl(url)

    this._aggregatorClient = new AggregatorClient({
      signer: normalizeSuiAddress('0x0'),
      client: new SuiJsonRpcClient({ url: url, network: this._sdkOptions.env === 'testnet' ? 'testnet' : 'mainnet' }),
      env: this._sdkOptions.env === 'testnet' ? Env.Testnet : Env.Mainnet,
      pythUrls: this._sdkOptions.pyth_urls,
    })
  }

  static createSDK(options: BaseSdkOptions, clmm_sdk?: CetusClmmSDK): CetusVaultsSDK {
    const { env = 'mainnet', full_rpc_url } = options
    return env === 'mainnet'
      ? CetusVaultsSDK.createCustomSDK({ ...vaultsMainnet, ...options }, clmm_sdk)
      : CetusVaultsSDK.createCustomSDK({ ...vaultsTestnet, ...options }, clmm_sdk)
  }

  /**
   * Create a custom SDK instance with the given options
   * @param options The options for the SDK
   * @returns An instance of CetusBurnSDK
   */
  static createCustomSDK<T extends BaseSdkOptions>(options: T & SdkOptions, clmm_sdk?: CetusClmmSDK): CetusVaultsSDK {
    return new CetusVaultsSDK(options, clmm_sdk)
  }
}
