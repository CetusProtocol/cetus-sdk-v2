import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'
import type { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import type { CoinAsset } from '../type/clmm'
import type { DataPage, PaginationArgs, SuiObjectIdType, SuiResource } from '../type/sui'
import { CACHE_TIME_24H, CachedContent, getFutureTime } from '../utils/cachedContent'
import { extractStructTagFromType, fixCoinType } from '../utils/contracts'
import { deriveDynamicFieldIdByType, ValueBcsType } from '../utils/dynamicField'
import { GraphQLQueryResult, SuiGraphQLClient } from '@mysten/sui/graphql'
import {
  CoinMetadataIdQuery,
  GetTxQuery,
  GetAllDynamicFieldsQuery,
  QueryEventsQuery,
  QueryTransactionsQuery,
  type TransactionFilterInput,
} from '../type/graphqlQueries'
import { ERROR_HANDLING_RPC_LIST } from '../type/sui'
import { SuiGrpcClient } from '@mysten/sui/grpc'
import type {
  CoinMetadata,
  SuiEvent,
  SuiEventFilter,
  PaginatedEvents,
  SuiJsonRpcClient,
} from '@mysten/sui/jsonRpc'
import { SuiClientTypes } from '@mysten/sui/client'



/**
 * A wrapper around the SuiGrpcClient that provides additional methods for querying and sending transactions.
 * This class is designed to be used in conjunction with the SuiGrpcClient to provide a more comprehensive API for interacting with the Sui blockchain.
 */
export class ExtendedSuiClient<T extends SuiGrpcClient> {
  public readonly _client: T
  public readonly _jsonRpcClient: SuiJsonRpcClient | undefined
  private readonly _cache: Record<string, CachedContent> = {}
  public readonly _env: 'mainnet' | 'testnet' = 'mainnet'

  public readonly _graphQLClient: SuiGraphQLClient | undefined

  constructor(client: T, _graphQLClient?: SuiGraphQLClient, env?: 'mainnet' | 'testnet', _jsonRpcClient?: SuiJsonRpcClient) {
    this._client = client
    this._env = env || 'mainnet'
    this._graphQLClient = _graphQLClient
    this._jsonRpcClient = _jsonRpcClient
  }

  async fetchCoinMetadata(coin_type: string): Promise<CoinMetadata | null> {
    const cacheKey = `coin_metadata_${coin_type}`
    const cachedData = this.getCache<CoinMetadata>(cacheKey)
    if (cachedData) {
      return cachedData
    }
    const res = await this._client.getCoinMetadata({ coinType: coin_type })
    this.updateCache(cacheKey, res.coinMetadata)
    return res.coinMetadata
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

    const result = await this._graphQLClient.query({
      query: CoinMetadataIdQuery,
      variables: {
        coinType: `0x2::coin::CoinMetadata<${coin_type}>`,
      },
    })
    const data = result.data as { objects?: { nodes?: Array<{ address?: string }> } } | undefined
    const id = data?.objects?.nodes?.[0]?.address ?? null
    if (id) {
      this.updateCache(cacheKey, id)
    }
    return id
  }

  async getSuiTransactionResponse(digest: string): Promise<SuiClientTypes.TransactionResult> {
    try {
      const result = await this._client.getTransaction({
        digest,
        include: {
          effects: true,
          events: true,
          balanceChanges: true,
          transaction: true,
          objectTypes: true,
        },
      });
      return result
    } catch (error: any) {
      console.log('getSuiTransactionResponse error', error)
      throw error
    }
  }


  async getTransactionByGraphQL(digest: string): Promise<GraphQLQueryResult<any>> {
    try {
      const result = await this._graphQLClient!.query({
        query: GetTxQuery,
        variables: {
          digest,
        },
      });
      return result
    } catch (error: any) {
      console.log('getTransactionByGraphQL error', error)
      throw error
    }
  }



  /**
   * Query events by type via GraphQL.
   * Requires GraphQL client.
   */
  async queryEventsByGraphQL(
    type: string,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<Record<string, unknown>>> {
    if (!this._graphQLClient) {
      throw new Error('graphQLClient is not set')
    }
    const queryAll = pagination_args === 'all'
    const limit = queryAll ? 50 : pagination_args.limit ?? 50
    let result: Record<string, unknown>[] = []
    let nextCursor: string | null = queryAll ? null : pagination_args.cursor ?? null
    let hasNextPage = true

    do {
      const res = await this._graphQLClient.query({
        query: QueryEventsQuery,
        variables: {
          type,
          first: limit,
          ...(nextCursor ? { after: nextCursor } : {}),
        },
      })
      const data = res.data as {
        events?: {
          nodes?: unknown[]
          pageInfo?: { hasNextPage?: boolean; endCursor?: string }
        }
      } | undefined
      const events = data?.events
      const nodes = events?.nodes ?? []
      const pageInfo = events?.pageInfo

      result = [...result, ...(nodes as Record<string, unknown>[])]
      hasNextPage = pageInfo?.hasNextPage ?? false
      nextCursor = pageInfo?.endCursor ?? null
    } while (queryAll && hasNextPage)

    return {
      data: result,
      next_cursor: nextCursor,
      has_next_page: hasNextPage,
    }
  }

  /**
   * Query transactions by filter via GraphQL.
   * Filter: sentAddress | affectedAddress | affectedObject | function.
   * Requires GraphQL client.
   */
  async queryTransactionBlocksByPage(
    filter: TransactionFilterInput,
    pagination_args: PaginationArgs = 'all',
    order: 'ascending' | 'descending' | null | undefined = 'descending'
  ): Promise<DataPage<Record<string, unknown>>> {
    if (!this._graphQLClient) {
      throw new Error('graphQLClient is not set')
    }
    const hasFilter =
      filter.sentAddress != null ||
      filter.affectedAddress != null ||
      filter.affectedObject != null ||
      filter.function != null
    if (!hasFilter) {
      throw new Error('At least one of sentAddress, affectedAddress, affectedObject, function is required')
    }
    const queryAll = pagination_args === 'all'
    const limit = queryAll ? 50 : pagination_args.limit ?? 50
    let result: Record<string, unknown>[] = []
    let nextCursor: string | null = queryAll ? null : pagination_args.cursor ?? null
    let hasNextPage = true
    const descending = order !== 'ascending'

    const filterPayload: Record<string, string> = {}
    if (filter.sentAddress) filterPayload.sentAddress = normalizeSuiAddress(filter.sentAddress)
    if (filter.affectedAddress) filterPayload.affectedAddress = normalizeSuiAddress(filter.affectedAddress)
    if (filter.affectedObject) filterPayload.affectedObject = normalizeSuiAddress(filter.affectedObject)
    if (filter.function) filterPayload.function = filter.function

    do {
      const res = descending
        ? await this._graphQLClient.query({
            query: QueryTransactionsQuery,
            variables: {
              filter: filterPayload,
              last: limit,
              ...(nextCursor ? { before: nextCursor } : {}),
            },
          })
        : await this._graphQLClient.query({
            query: QueryTransactionsQuery,
            variables: {
              filter: filterPayload,
              first: limit,
              ...(nextCursor ? { after: nextCursor } : {}),
            },
          })
      const data = res.data as {
        transactions?: {
          nodes?: unknown[]
          pageInfo?: {
            hasNextPage?: boolean
            endCursor?: string
            hasPreviousPage?: boolean
            startCursor?: string
          }
        }
      } | undefined
      const transactions = data?.transactions
      const nodes = transactions?.nodes ?? []
      const pageInfo = transactions?.pageInfo
      const pageNodes = descending ? [...nodes].reverse() : nodes

      result = [...result, ...(pageNodes as Record<string, unknown>[])]
      hasNextPage = descending ? pageInfo?.hasPreviousPage ?? false : pageInfo?.hasNextPage ?? false
      nextCursor = descending ? pageInfo?.startCursor ?? null : pageInfo?.endCursor ?? null
    } while (queryAll && hasNextPage)

    return {
      data: result,
      next_cursor: nextCursor,
      has_next_page: hasNextPage,
    }
  }

  /**
   * Get events for a given query criteria.
   * Requires GraphQL client; gRPC does not support queryEvents. Use SuiGraphQLClient or SuiJsonRpcClient for this method.
   */
  async queryEventsByPage(
    query: SuiEventFilter,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<SuiEvent>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = pagination_args === 'all'
    let nextCursor = queryAll ? null : pagination_args.cursor

    do {
      const res: PaginatedEvents = await this._jsonRpcClient!.queryEvents({
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




  async getOwnedObjectsByPage(
    owner: string,
    type?: string,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<SuiClientTypes.Object>> {

    const fetchOwnedObjects = async (client: SuiGrpcClient) => {
      let result: SuiClientTypes.Object[] = []
      let hasNextPage = true
      const queryAll = pagination_args === 'all'
      let nextCursor = queryAll ? null : pagination_args.cursor
      do {
        const res = await client.listOwnedObjects({
          owner,
          type: type,
          cursor: nextCursor ?? undefined,
          limit: queryAll ? 1000 : pagination_args.limit ?? undefined,
          include: {
            content: true,
            previousTransaction: true,
            json: true,
          },
        })
        result = [...result, ...res.objects]
        hasNextPage = res.hasNextPage
        nextCursor = res.cursor ?? null
      } while (queryAll && hasNextPage)

      return { data: result, next_cursor: nextCursor, has_next_page: hasNextPage }
    }

    try {
      return await fetchOwnedObjects(this._client)
    } catch (error) {
      let lastError: unknown = error
      const network = this._env === 'testnet' ? 'testnet' : 'mainnet'
      for (const rpcUrl of ERROR_HANDLING_RPC_LIST) {
        try {
          const fallbackClient = createFullClient(
            new SuiGrpcClient({ baseUrl: rpcUrl, network }),
            this._graphQLClient,
            this._env
          )
          return await fetchOwnedObjects(fallbackClient._client)
        } catch (fallbackError) {
          lastError = fallbackError
          continue
        }
      }
      throw lastError
    }
  }

  /**
   * Get dynamic fields by object address via GraphQL.
   * Requires GraphQL client.
   */
  async getAllDynamicFields(
    id: SuiObjectIdType,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<Record<string, unknown>>> {
    if (!this._graphQLClient) {
      throw new Error('graphQLClient is not set')
    }
    const queryAll = pagination_args === 'all'
    const limit = queryAll ? 50 : pagination_args.limit ?? 50
    let result: Record<string, unknown>[] = []
    let nextCursor: string | null = queryAll ? null : pagination_args.cursor ?? null
    let hasNextPage = true

    do {
      const res = await this._graphQLClient.query({
        query: GetAllDynamicFieldsQuery,
        variables: {
          id: normalizeSuiAddress(id),
          first: limit,
          ...(nextCursor ? { after: nextCursor } : {}),
        },
      })
      const data = res.data as {
        address?: {
          dynamicFields?: {
            nodes?: unknown[]
            pageInfo?: { hasNextPage?: boolean; endCursor?: string }
          }
        }
      } | undefined
      const dynamicFields = data?.address?.dynamicFields
      const nodes = dynamicFields?.nodes ?? []
      const pageInfo = dynamicFields?.pageInfo

      result = [...result, ...(nodes as Record<string, unknown>[])]
      hasNextPage = pageInfo?.hasNextPage ?? false
      nextCursor = pageInfo?.endCursor ?? null
    } while (queryAll && hasNextPage)

    return {
      data: result,
      next_cursor: nextCursor,
      has_next_page: hasNextPage,
    }
  }

  async getDynamicFieldsByPage(
    parent_id: SuiObjectIdType,
    pagination_args: PaginationArgs = 'all'
  ): Promise<DataPage<SuiClientTypes.DynamicFieldEntry>> {
    let result: SuiClientTypes.DynamicFieldEntry[] = []
    let has_next_page = true
    const query_all = pagination_args === 'all'
    let nextCursor = query_all ? null : pagination_args.cursor
    do {
      const res: SuiClientTypes.ListDynamicFieldsResponse = await this._client.listDynamicFields({
        parentId: parent_id,
        cursor: nextCursor ?? undefined,
        limit: query_all ? 1000 : pagination_args.limit ?? undefined,
      })
      result = [...result, ...res.dynamicFields]
      has_next_page = res.hasNextPage
      nextCursor = res.cursor ?? null
    } while (query_all && has_next_page)

    return { data: result, next_cursor: nextCursor, has_next_page: has_next_page }
  }

  async getDynamicFieldObjects(
    parent_id: string,
    value_arr: string[] | number[],
    typeTag: string,
    value_bcs_type: ValueBcsType,
    include?: SuiClientTypes.ObjectInclude,
  ): Promise<SuiClientTypes.Object[]> {
    const warpIds = value_arr.map((value) => {
      const dynamic_field_id = deriveDynamicFieldIdByType(parent_id, value, typeTag, value_bcs_type)
      return dynamic_field_id
    })

    if (warpIds.length === 0) {
      return []
    }
    return this.batchGetObjects(warpIds, include)
  }

  async batchGetObjects(
    ids: SuiObjectIdType[],
    include?: SuiClientTypes.ObjectInclude,
    limit = 1000
  ): Promise<SuiClientTypes.Object[]> {
    let object_data_responses: SuiClientTypes.Object[] = []

    try {
      for (let i = 0; i < Math.ceil(ids.length / limit); i++) {
        const batch = ids.slice(i * limit, limit * (i + 1))
        const res: any = await this._client.getObjects({
          objectIds: batch,
          include,
        })
        object_data_responses = [...object_data_responses, ...res.objects]
      }
    } catch (error) {
      console.log(error)
    }

    return object_data_responses
  }

  async calculationTxGas(tx: Transaction): Promise<number> {
    const sender = (tx as any).getData?.()?.sender ?? (tx as any).blockData?.sender

    if (sender === undefined || sender === null) {
      throw Error('sdk sender is empty')
    }

    tx.setSender(sender)
    const result = await this._client.simulateTransaction({
      transaction: tx,
      include: { effects: true },
    })
    const txResult = result.Transaction ?? result.FailedTransaction
    if (!txResult?.effects?.gasUsed) {
      throw new Error('Simulation did not return effects')
    }
    const { gasUsed } = txResult.effects
    const estimateGas =
      Number(gasUsed.computationCost) +
      Number(gasUsed.storageCost) -
      Number(gasUsed.storageRebate)
    return estimateGas
  }

  async sendTransaction(
    keypair: Ed25519Keypair | Secp256k1Keypair,
    tx: Transaction
  ): Promise<SuiClientTypes.TransactionResult | undefined> {
    try {
      const result = await this._client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        include: { effects: true, events: true },
      })
      return result
    } catch (error) {
      console.log('error: ', error)
    }
    return undefined
  }

  async sendSimulationTransaction(
    tx: Transaction,
    simulation_account: string,
    checksEnabled: boolean = true
  ): Promise<SuiClientTypes.SimulateTransactionResult> {
    try {
      tx.setSender(simulation_account)
      const result = await this._client.simulateTransaction({
        transaction: tx,
        include: { events: true, balanceChanges: true, effects: true, objectChanges: true, commandResults: true },
        checksEnabled,
      })
      return result as any
    } catch (error) {
      console.log('simulateTransaction error', error)
      throw error
    }
  }

  async executeTx(
    keypair: Ed25519Keypair | Secp256k1Keypair | string,
    tx: Transaction,
    simulate: boolean
  ): Promise<any> {
    try {
      if (simulate) {
        const address =
          typeof keypair === 'string'
            ? normalizeSuiAddress(keypair)
            : normalizeSuiAddress(keypair.getPublicKey().toSuiAddress())
        const res = await this.sendSimulationTransaction(tx, address)
        return res
      } else {
        if (typeof keypair === 'string') {
          throw new Error('Cannot send transaction with string address - keypair required for signing')
        }
        return await this.sendTransaction(keypair, tx)
      }
    } catch (error) {
      return error
    }
  }

  async getOwnerCoinAssets(sui_address: string, coin_type?: string | null): Promise<CoinAsset[]> {
    const allCoinAsset: CoinAsset[] = []
    let nextCursor: string | null | undefined = null

    if (coin_type) {
      while (true) {
        const res = await this._client.listCoins({
          owner: sui_address,
          coinType: coin_type,
          cursor: nextCursor ?? undefined,
        })
        for (const coin of res.objects) {
          if (BigInt(coin.balance) > 0) {
            allCoinAsset.push({
              coin_type: extractStructTagFromType(coin.type).type_arguments[0],
              coin_object_id: coin.objectId,
              balance: BigInt(coin.balance),
            })
          }
        }
        nextCursor = res.cursor ?? null
        if (!res.hasNextPage) break
      }
    } else {
      let cursor: string | null | undefined = null
      do {
        const res: SuiClientTypes.ListOwnedObjectsResponse = await this._client.listOwnedObjects({
          owner: sui_address,
          cursor: cursor ?? undefined,
          include: {
            json: true,
          },
        })
        res.objects.forEach((item: any) => {
          const type = extractStructTagFromType(item.type)
          if (item.type.includes('"0x0000000000000000000000000000000000000000000000000000000000000002::coin::Coin') && BigInt(item.balance) > 0) {
            allCoinAsset.push({
              coin_type: fixCoinType(type.type_arguments[0], false),
              coin_object_id: item.json.id,
              balance: BigInt(item.json.balance),
            })
          }
        })
        cursor = res.cursor ?? null
        if (!res.hasNextPage) break
      } while (true)
    }
    return allCoinAsset
  }

  async getOwnerCoinBalances(sui_address: string, coin_type?: string | null): Promise<SuiClientTypes.Balance[]> {
    if (coin_type) {
      const res = await this._client.getBalance({
        owner: sui_address,
        coinType: coin_type,
      })
      return [res.balance]
    }
    const allBalances: SuiClientTypes.Balance[] = []
    let cursor: string | null | undefined = null
    do {
      const res = await this._client.listBalances({
        owner: sui_address,
        cursor: cursor ?? undefined,
      })
      allBalances.push(...res.balances)
      cursor = res.cursor ?? null
      if (!res.hasNextPage) break
    } while (true)
    return allBalances
  }

  public updateCache(key: string, data: SuiResource, time = CACHE_TIME_24H): void {
    let cacheData = this._cache[key]
    if (cacheData) {
      cacheData.overdue_time = getFutureTime(time)
      cacheData.value = data
    } else {
      cacheData = new CachedContent(data, getFutureTime(time))
    }
    this._cache[key] = cacheData
  }

  public getCache<T>(key: string, force_refresh = false): T | undefined {
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

export function createFullClient<T extends SuiGrpcClient>(
  client: T,
  graphQLClient?: SuiGraphQLClient,
  env?: 'mainnet' | 'testnet',
  jsonRpcClient?: SuiJsonRpcClient
): ExtendedSuiClient<T> & T {
  const fullClient = new ExtendedSuiClient(client, graphQLClient, env, jsonRpcClient)

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
