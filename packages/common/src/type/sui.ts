import { getFullnodeUrl, SuiClient } from '@mysten/sui/client'
import type { TransactionArgument } from '@mysten/sui/transactions'
import Decimal from 'decimal.js'
import { ExtendedSuiClient } from '../modules/extendedSuiClient'
import { SuiGraphQLClient } from '@mysten/sui/graphql'

/**
 * Represents a SUI address, which is a string.
 */
export type SuiAddressType = string
/**
 * Represents a SUI object identifier, which is a string.
 */
export type SuiObjectIdType = string
/**
 * Represents a BigNumber, which can be a Decimal.Value, number, or string.
 */
export type BigNumber = Decimal.Value | number | string
/**
 * The address representing the clock in the system.
 */
export const CLOCK_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000006'

/**
 * The address for CoinInfo module.
 */
export const CoinInfoAddress = '0x1::coin::CoinInfo'
/**
 * The address for CoinStore module.
 */
export const CoinStoreAddress = '0x1::coin::CoinStore'

/**
 * Represents a SUI resource, which can be of any type.
 */
export type SuiResource = any

export const FullRpcUrlMainnet = getFullnodeUrl('mainnet')
export const FullRpcUrlTestnet = getFullnodeUrl('testnet')

export const GraphRpcUrlMainnet = 'https://graphql.mainnet.sui.io/graphql'
export const GraphRpcUrlTestnet = 'https://graphql.testnet.sui.io/graphql'

export const DefaultProviders = [
  'CETUS',
  'TURBOS',
  'STEAMM',
  'SPRINGSUI',
  'HAEDAL',
  'FLOWX',
  'AFTERMATH',
  'ALPHAFI',
  'BLUEFIN',
  'METASTABLE',
  'VOLO',
  'SCALLOP',
  'KRIYA',
  'FLOWXV3',
  'DEEPBOOKV3',
  'AFSUI',
  'BLUEMOVE',
  'KRIYAV3',
  'HAEDALPMM',
  'OBRIC',
]

/**
 * Represents a package containing specific configuration or data.
 * @template T - The type of configuration or data contained in the package.
 */
export type Package<T = undefined> = {
  /**
   * The unique identifier of the package.
   */
  package_id: string
  /**
   * the package was published.
   */
  published_at: string
  /**
   * The version number of the package (optional).
   */
  version?: number
  /**
   * The configuration or data contained in the package (optional).
   */
  config?: T
}

/**
 * Represents a paginated data page with optional cursor and limit.
 */
export type DataPage<T> = {
  data: T[]
  next_cursor?: any
  has_next_page: boolean
}

/**
 * Represents query parameters for pagination.
 */
export type PageQuery = {
  cursor?: any
  limit?: number | null
}

/**
 * Represents arguments for pagination, with options for fetching all data or using PageQuery.
 */
export type PaginationArgs = 'all' | PageQuery

/**
 * Represents a Non-Fungible Token (NFT) with associated metadata.
 */
export type NFT = {
  /**
   * The address or identifier of the creator of the NFT.
   */
  creator: string

  /**
   * A description providing additional information about the NFT.
   */
  description: string

  /**
   * The URL to the image representing the NFT visually.
   */
  image_url: string

  /**
   * A link associated with the NFT, providing more details or interactions.
   */
  link: string

  /**
   * The name or title of the NFT.
   */
  name: string

  /**
   * The URL to the project or collection associated with the NFT.
   */
  project_url: string
}

/**
 * Represents a SUI struct tag.
 */
export type SuiStructTag = {
  /**
   * The full address of the struct.
   */
  full_address: string

  /**
   * The source address of the struct.
   */
  source_address: string

  /**
   * The address of the struct.
   */
  address: SuiAddressType

  /**
   * The module to which the struct belongs.
   */
  module: string

  /**
   * The name of the struct.
   */
  name: string

  /**
   * An array of type arguments (SUI addresses) for the struct.
   */
  type_arguments: SuiAddressType[]
}

/**
 * Represents basic SUI data types.
 */
export type SuiBasicTypes = 'address' | 'bool' | 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256'

/**
 * Represents a SUI transaction argument, which can be of various types.
 */
export type SuiTxArg = TransactionArgument | string | number | bigint | boolean

/**
 * Represents input types for SUI data.
 */
export type SuiInputTypes = 'object' | SuiBasicTypes

export type BaseSdkOptions = {
  env?: 'mainnet' | 'testnet'
  full_rpc_url?: string
  graph_rpc_url?: string
  sui_client?: SuiClient
  graph_client?: SuiGraphQLClient
}

export type FullClient = ExtendedSuiClient<SuiClient> & SuiClient

export type TableHandle = {
  id: string
  size: number
}
