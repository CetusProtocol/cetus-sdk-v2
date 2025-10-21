import type {
  CoinBalance,
  CoinMetadata,
  DryRunTransactionBlockResponse,
  DynamicFieldPage,
  PaginatedEvents,
  PaginatedObjectsResponse,
  PaginatedTransactionResponse,
  SuiEvent,
  SuiEventFilter,
  SuiObjectDataOptions,
  SuiObjectResponse,
  SuiObjectResponseQuery,
  SuiTransactionBlockResponse,
  TransactionFilter,
} from '@mysten/sui/client'
import { SuiClient } from '@mysten/sui/client'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'
import type { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import type { CoinAsset } from '../type/clmm'
import type { DataPage, PaginationArgs, SuiObjectIdType, SuiResource } from '../type/sui'
import { CACHE_TIME_24H, CachedContent, getFutureTime } from '../utils/cachedContent'
import { extractStructTagFromType } from '../utils/contracts'
import { deriveDynamicFieldIdByType, ValueBcsType } from '../utils/dynamicField'
import { CoinAssist } from '../utils'
import { SuiGraphQLClient } from '@mysten/sui/graphql'
import { graphql } from '@mysten/sui/graphql/schemas/latest'

/**
 * A wrapper around the SuiClient that provides additional methods for querying and sending transactions.
 * This class is designed to be used in conjunction with the SuiClient to provide a more comprehensive API for interacting with the Sui blockchain.
 */
export class ExtendedSuiClient<T extends SuiClient> {
  /**
   * The underlying SuiClient instance used for making RPC calls to the Sui network.
   * This client is used to interact with the Sui blockchain and execute various operations.
   */
  public readonly _client: T
  private readonly _cache: Record<string, CachedContent> = {}
  private readonly _env: 'mainnet' | 'testnet' = 'mainnet'

  private readonly _graphQLClient: SuiGraphQLClient | undefined

  constructor(client: T, _graphQLClient?: SuiGraphQLClient, env?: 'mainnet' | 'testnet') {
    this._client = client
    this._env = env || 'mainnet'
    this._graphQLClient = _graphQLClient
  }

  async fetchCoinMetadata(coin_type: string): Promise<CoinMetadata | null> {
    const cacheKey = `coin_metadata_${coin_type}`
    const cachedData = this.getCache<CoinMetadata>(cacheKey)
    if (cachedData) {
      return cachedData
    }
    const res = await this._client.getCoinMetadata({ coinType: coin_type })
    this.updateCache(cacheKey, res)
    return res
  }

  async fetchCoinMetadataId(coin_type: string): Promise<string | null> {
    if (!this._graphQLClient) {
      throw new Error('graphQLClient is not set')
    }

    const cacheKey = `coin_metadata_id_${coin_type}`
    const cachedData = this.getCache<string>(cacheKey)
    if (cachedData) {
      return cachedData
    }

    const CoinMetadataIdQuery = graphql(`
      query coinMetadataId($coinType: String!) {
        objects(filter: { type: $coinType }, first: 1) {
          nodes {
            address
          }
        }
      }
    `)
    const result = await this._graphQLClient.query({
      query: CoinMetadataIdQuery,
      variables: {
        coinType: `0x2::coin::CoinMetadata<${coin_type}>`,
      },
    })
    const id = result.data?.objects.nodes[0]?.address ?? null
    if (id) {
      this.updateCache(cacheKey, id)
    }
    return id
  }

  /**
   * Gets the SUI transaction response for a given transaction digest.
   * @param digest - The digest of the transaction for which the SUI transaction response is requested.
   * @returns A Promise that resolves with the SUI transaction block response or null if the response is not available.
   */
  async getSuiTransactionResponse(digest: string): Promise<SuiTransactionBlockResponse | null> {
    let objects
    try {
      objects = (await this._client.getTransactionBlock({
        digest,
        options: {
          showEvents: true,
          showEffects: true,
          showBalanceChanges: true,
          showInput: true,
          showObjectChanges: true,
        },
      })) as SuiTransactionBlockResponse
    } catch (error) {
      objects = (await this._client.getTransactionBlock({
        digest,
        options: {
          showEvents: true,
          showEffects: true,
        },
      })) as SuiTransactionBlockResponse
    }

    return objects
  }

  /**
   * Get events for a given query criteria
   * @param query
   * @param pagination_args
   * @returns
   */
  async queryEventsByPage(query: SuiEventFilter, pagination_args: PaginationArgs = 'all'): Promise<DataPage<SuiEvent>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = pagination_args === 'all'
    let nextCursor = queryAll ? null : pagination_args.cursor

    do {
      const res: PaginatedEvents = await this._client.queryEvents({
        query,
        cursor: nextCursor,
        limit: queryAll ? null : pagination_args.limit,
      })
      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, next_cursor: nextCursor, has_next_page: hasNextPage }
  }

  async queryTransactionBlocksByPage(
    filter?: TransactionFilter,
    pagination_args: PaginationArgs = 'all',
    order: 'ascending' | 'descending' | null | undefined = 'ascending'
  ): Promise<DataPage<SuiTransactionBlockResponse>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = pagination_args === 'all'
    let nextCursor = queryAll ? null : pagination_args.cursor

    do {
      const res: PaginatedTransactionResponse = await this._client.queryTransactionBlocks({
        filter,
        cursor: nextCursor,
        order,
        limit: queryAll ? null : pagination_args.limit,
        options: { showEvents: true },
      })
      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, next_cursor: nextCursor, has_next_page: hasNextPage }
  }

  /**
   * Get all objects owned by an address
   * @param owner
   * @param query
   * @param pagination_args
   * @returns
   */
  async getOwnedObjectsByPage(
    owner: string,
    query: SuiObjectResponseQuery,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<SuiObjectResponse>> {
    let result: SuiObjectResponse[] = []
    let hasNextPage = true
    const queryAll = pagination_args === 'all'
    let nextCursor = queryAll ? null : pagination_args.cursor
    do {
      const res: PaginatedObjectsResponse = await this._client.getOwnedObjects({
        owner,
        ...query,
        cursor: nextCursor,
        limit: queryAll ? null : pagination_args.limit,
      })
      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, next_cursor: nextCursor, has_next_page: hasNextPage }
  }

  /**
   * Return the list of dynamic field objects owned by an object
   * @param parent_id
   * @param pagination_args
   * @returns
   */
  async getDynamicFieldsByPage(parent_id: SuiObjectIdType, pagination_args: PaginationArgs = 'all'): Promise<DataPage<any>> {
    let result: any = []
    let has_next_page = true
    const query_all = pagination_args === 'all'
    let nextCursor = query_all ? null : pagination_args.cursor
    do {
      const res: DynamicFieldPage = await this._client.getDynamicFields({
        parentId: parent_id,
        cursor: nextCursor,
        limit: query_all ? null : pagination_args.limit,
      })

      if (res.data) {
        result = [...result, ...res.data]
        has_next_page = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        has_next_page = false
      }
    } while (query_all && has_next_page)

    return { data: result, next_cursor: nextCursor, has_next_page: has_next_page }
  }

  /**
   * Get dynamic field objects by parent id, value array, type tag, and value bcs type
   * @param parent_id
   * @param value_arr
   * @param typeTag
   * @param value_bcs_type
   * @param options
   * @returns
   */
  async getDynamicFieldObjects(
    parent_id: string,
    value_arr: string[] | number[],
    typeTag: string,
    value_bcs_type: ValueBcsType,
    options: SuiObjectDataOptions = {
      showContent: true,
      showType: true,
      showOwner: true,
    }
  ): Promise<SuiObjectResponse[]> {
    const warpIds = value_arr.map((value) => {
      const dynamic_field_id = deriveDynamicFieldIdByType(parent_id, value, typeTag, value_bcs_type)
      return dynamic_field_id
    })

    if (warpIds.length === 0) {
      return []
    }
    const res = await this.batchGetObjects(warpIds, options)
    return res
  }

  /**
   * Batch get details about a list of objects. If any of the object ids are duplicates the call will fail
   * @param ids
   * @param options
   * @param limit
   * @returns
   */
  async batchGetObjects(ids: SuiObjectIdType[], options?: SuiObjectDataOptions, limit = 50): Promise<SuiObjectResponse[]> {
    let object_data_responses: SuiObjectResponse[] = []

    try {
      for (let i = 0; i < Math.ceil(ids.length / limit); i++) {
        const res = await this._client.multiGetObjects({
          ids: ids.slice(i * limit, limit * (i + 1)),
          options,
        })
        object_data_responses = [...object_data_responses, ...res]
      }
    } catch (error) {
      console.log(error)
    }

    return object_data_responses
  }

  /**
   * Calculates the gas cost of a transaction block.
   * @param {Transaction} tx - The transaction block to calculate gas for.
   * @returns {Promise<number>} - The estimated gas cost of the transaction block.
   * @throws {Error} - Throws an error if the sender is empty.
   */
  async calculationTxGas(tx: Transaction): Promise<number> {
    const { sender } = tx.blockData

    if (sender === undefined) {
      throw Error('sdk sender is empty')
    }

    const devResult = await this._client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    })
    const { gasUsed } = devResult.effects

    const estimateGas = Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate)
    return estimateGas
  }

  /**
   * Sends a transaction block after signing it with the provided keypair.
   *
   * @param {Ed25519Keypair | Secp256k1Keypair} keypair - The keypair used for signing the transaction.
   * @param {Transaction} tx - The transaction block to send.
   * @returns {Promise<SuiTransactionBlockResponse | undefined>} - The response of the sent transaction block.
   */
  async sendTransaction(keypair: Ed25519Keypair | Secp256k1Keypair, tx: Transaction): Promise<SuiTransactionBlockResponse | undefined> {
    try {
      const resultTxn: any = await this._client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      })
      return resultTxn
    } catch (error) {
      console.log('error: ', error)
    }
    return undefined
  }

  /**
   * Send a simulation transaction.
   * @param tx - The transaction block.
   * @param simulation_account - The simulation account.
   * @returns A promise that resolves to DevInspectResults or undefined.
   */
  async sendSimulationTransaction(tx: Transaction, simulation_account: string): Promise<DryRunTransactionBlockResponse | undefined> {
    try {
      tx.setSender(simulation_account)
      const simulateRes = await this._client.dryRunTransactionBlock({
        transactionBlock: await tx.build({
          client: this._client,
        }),
      })
      return simulateRes
    } catch (error) {
      console.log('devInspectTransactionBlock error', error)
      throw error
    }

    return undefined
  }

  async executeTx(keypair: Ed25519Keypair | Secp256k1Keypair | string, tx: Transaction, simulate: boolean): Promise<any> {
    try {
      if (simulate) {
        const address =
          typeof keypair === 'string' ? normalizeSuiAddress(keypair) : normalizeSuiAddress(keypair.getPublicKey().toSuiAddress())
        const res = await this.sendSimulationTransaction(tx, address)
        return res!.events.length > 0 ? res!.events : res
      } else {
        if (typeof keypair === 'string') {
          throw new Error('Cannot send transaction with string address - keypair required for signing')
        }
        const txResult = await this.sendTransaction(keypair, tx)
        return txResult
      }
    } catch (error) {
      return error
    }
  }

  /**
   * Gets all coin assets for the given owner and coin type.
   *
   * @param sui_address The address of the owner.
   * @param coin_type The type of the coin.
   * @returns an array of coin assets.
   */
  async getOwnerCoinAssets(sui_address: string, coin_type?: string | null): Promise<CoinAsset[]> {
    const allCoinAsset: CoinAsset[] = []
    let nextCursor: string | null | undefined = null

    while (true) {
      const allCoinObject: any = await (coin_type
        ? this._client.getCoins({
            owner: sui_address,
            coinType: coin_type,
            cursor: nextCursor,
          })
        : this._client.getAllCoins({
            owner: sui_address,
            cursor: nextCursor,
          }))

      allCoinObject.data.forEach((coin: any) => {
        if (BigInt(coin.balance) > 0) {
          allCoinAsset.push({
            coin_type: extractStructTagFromType(coin.coinType).source_address,
            coin_object_id: coin.coinObjectId,
            balance: BigInt(coin.balance),
          })
        }
      })
      nextCursor = allCoinObject.nextCursor

      if (!allCoinObject.hasNextPage) {
        break
      }
    }
    return allCoinAsset
  }

  /**
   * Gets all coin balances for the given owner and coin type.
   *
   * @param sui_address The address of the owner.
   * @param coin_type The type of the coin.
   * @returns an array of coin balances.
   */
  async getOwnerCoinBalances(sui_address: string, coin_type?: string | null): Promise<CoinBalance[]> {
    let allCoinBalance: CoinBalance[] = []

    if (coin_type) {
      const res = await this._client.getBalance({
        owner: sui_address,
        coinType: coin_type,
      })
      allCoinBalance = [res]
    } else {
      const res = await this._client.getAllBalances({
        owner: sui_address,
      })
      allCoinBalance = [...res]
    }
    return allCoinBalance
  }

  /**
   * Updates the cache for the given key.
   *
   * @param key The key of the cache entry to update.
   * @param data The data to store in the cache.
   * @param time The time in minutes after which the cache entry should expire.
   */
  private updateCache(key: string, data: SuiResource, time = CACHE_TIME_24H): void {
    let cacheData = this._cache[key]
    if (cacheData) {
      cacheData.overdue_time = getFutureTime(time)
      cacheData.value = data
    } else {
      cacheData = new CachedContent(data, getFutureTime(time))
    }
    this._cache[key] = cacheData
  }

  /**
   * Gets the cache entry for the given key.
   *
   * @param key The key of the cache entry to get.
   * @param force_refresh Whether to force a refresh of the cache entry.
   * @returns The cache entry for the given key, or undefined if the cache entry does not exist or is expired.
   */
  private getCache<T>(key: string, force_refresh = false): T | undefined {
    const cacheData = this._cache[key]
    const isValid = cacheData?.isValid()
    if (!force_refresh && isValid) {
      return cacheData.value as T
    }
    if (!isValid) {
      delete this._cache[key]
    }
    return undefined
  }
}

export function createFullClient<T extends SuiClient>(
  client: T,
  graphQLClient?: SuiGraphQLClient,
  env?: 'mainnet' | 'testnet'
): ExtendedSuiClient<T> & T {
  const fullClient = new ExtendedSuiClient(client, graphQLClient, env)

  return new Proxy(fullClient, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver)
      }

      if (prop in target._client) {
        const value = Reflect.get(target._client, prop)
        if (typeof value === 'function') {
          return value.bind(target._client)
        }
        return value
      }

      throw new Error(`Property or method "${String(prop)}" does not exist on FullClient or its client.`)
    },
  }) as ExtendedSuiClient<T> & T
}
