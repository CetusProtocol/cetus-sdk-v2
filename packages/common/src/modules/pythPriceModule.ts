import { Transaction } from '@mysten/sui/transactions'
import { HermesClient, PriceUpdate } from "@pythnetwork/hermes-client"
import { bcs } from '@mysten/sui/bcs'
import { defaultPythConfigs, feed_map_mainnet, FeedInfo, FullClient, getPriceWithFormattedDecimals, Price, PythUpdateOraclePriceCallback, toSuiObjectId } from '../type'
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils'
import { d } from '../utils/numbers'
import { fixCoinType } from '../utils/contracts'

const MAX_ARGUMENT_SIZE = 16 * 1024

export type PythConfigs = {
  // Pyth network price feed details for Sui blockchain
  // Documentation: https://docs.pyth.network/price-feeds/contract-addresses/sui
  pyth_package_id: string // Pyth package ID for the price feed
  pyth_published_at: string // Timestamp when the Pyth price feed was published
  pyth_state_id: string // State ID for the Pyth price feed
  wormhole_state_id: string // State ID for Wormhole (cross-chain communication)
  // Hermes service URL for accessing Pyth price feed data
  // Documentation: https://docs.pyth.network/price-feeds/api-instances-and-providers/hermes
  hermes_service_urls: string[] // URLs for the Hermes service to retrieve price feeds

  feed_info_handle?: string
}


/**
 * The PythPriceModule handles interactions with the Pyth Price Service.
 * It allows fetching price data for different coin types and performing updates on Pyth price feeds.
 */
export class PythPriceModule {
  private hermesClients: HermesClient[]
  protected hasChangeConnection = false
  protected pythConfigs: PythConfigs
  protected fullClient: FullClient
  private priceTableInfo: { id: string; fieldType: string } | undefined;
  private baseUpdateFee: number | undefined;

  constructor(
    fullClient: FullClient,
    pythConfigs: PythConfigs = defaultPythConfigs,
  ) {
    this.pythConfigs = pythConfigs
    this.fullClient = fullClient

    const urls = [...pythConfigs.hermes_service_urls]
    if (!urls.includes("https://hermes.pyth.network")) {
      urls.push("https://hermes.pyth.network")
    }

    this.hermesClients = urls.map(
      url => new HermesClient(url, { timeout: 3000 })
    )
  }



  /**
   * Fetches the feed information for a list of coin types.
   *
   * @param coinTypeList - The list of coin types for which feed information is required.
   * @returns A promise that resolves to a list of FeedInfo objects.
   */
  async getFeedInfoList(coinTypeList: string[]): Promise<FeedInfo[]> {
    const requestFeedInfoList = coinTypeList.map((coinType) => this.getFeedInfo(coinType, false))
    const list = await Promise.all(requestFeedInfoList)
    return list
  }

  /**
   * Checks if the price has been updated within the last 60 seconds.
   *
   * @param price - The price object to check.
   * @returns The price object if it has been updated within the last 60 seconds, otherwise undefined.
   */
  priceCheck(price: Price, age = 60) {
    const currentTime = Math.floor(Date.now() / 1000)
    if (Math.abs(currentTime - price.last_update_time) > age) {
      return undefined
    }

    return price
  }

  async getPackageId(objectId: string): Promise<string> {
    const result: any = await this.fullClient.getObject({
      id: objectId,
      options: {
        showContent: true,
      },
    })

    if (result.data?.content?.dataType == "moveObject") {
      return result.data.content.fields.upgrade_cap.fields.package;;
    }
    throw new Error("upgrade_cap not found")
  }


  async getWormholePackageId(): Promise<string> {
    const { wormhole_state_id } = this.pythConfigs
    const cacheKey = `getWormholePackageId_${wormhole_state_id}`
    const cacheValue = this.fullClient.getCache<string>(cacheKey)
    if (cacheValue) {
      return cacheValue
    }
    const wormholePackageId = await this.getPackageId(this.pythConfigs.wormhole_state_id)
    this.fullClient.updateCache(cacheKey, wormholePackageId)
    return wormholePackageId
  }

  /**
   * Fetches the latest prices for a list of coin types.
   * Optionally uses cached prices if available.
   *
   * @param coinTypeList - The list of coin types for which prices are required.
   * @param useCache - A flag to indicate whether to use cached prices (default: false).
   * @returns A promise that resolves to a record mapping coin types to their respective price information.
   */
  async getLatestPrice(coinTypeList: string[], useCache = false): Promise<Record<string, Price>> {
    const priceMap: Record<string, Price> = {}
    let notFindList: string[] = []
    // Check if prices can be fetched from the cache
    if (useCache) {
      coinTypeList.forEach((coinType) => {
        const data = this.fullClient.getCache<Price>(`getLatestPrice_${coinType}`)
        if (data && this.priceCheck(data, 60)) {
          priceMap[coinType] = data
        } else {
          notFindList.push(coinType)
        }
      })
    } else {
      notFindList = [...coinTypeList]
    }
    // If all prices are already available in the cache, return them
    if (notFindList.length === 0) {
      return priceMap
    }

    // Fetch feed info for the coin types that need their prices updated
    const feedInfoList = await this.getFeedInfoList(notFindList)

    // Fetch the latest price data from the Pyth Price Service
    const priceUpdateData = await this.getLatestPriceFeeds(feedInfoList.map((info) => info.price_feed_id))

    // Process the fetched price data and update the price map
    priceUpdateData?.parsed?.forEach((priceFeed: any, index: number) => {
      //  console.log('🚀 ~ PythPriceModule ~ priceUpdateData?.forEach ~ priceObj:', priceObj)

      if (priceFeed) {
        const { price, expo, publish_time } = priceFeed.price
        // Adjust the price based on the exponent (decimals)
        const realPrice = d(price)
          .mul(d(10).pow(d(expo)))
          .toString()
        const info = feedInfoList[index]
        const data: Price = {
          coin_type: info.coin_type,
          price: realPrice,
          coin_decimals: info.coin_decimals,
          oracle_price: 0n,
          last_update_time: publish_time,
        }
        // Calculate the formatted oracle price and update the map
        data.oracle_price = getPriceWithFormattedDecimals(BigInt(price), BigInt(expo))
        priceMap[notFindList[index]] = data

        this.fullClient.updateCache(`getLatestPrice_${data.coin_type}`, data)
      }
    })

    return priceMap
  }

  async getPriceFeedsUpdateData(priceIDs: string[]): Promise<Buffer[]> {
    let lastError: Error | null = null

    for (const hermes of this.hermesClients) {
      try {
        const response = await hermes.getLatestPriceUpdates(priceIDs, {
          encoding: "hex",
        })
        return response.binary.data.map(hex => Buffer.from(hex, "hex"))
      } catch (e) {
        console.log('🚀 ~ PythPriceModule ~ getPriceFeedsUpdateData ~ e:', e)
        lastError = e as Error
        continue
      }
    }

    throw new Error(
      `All Pyth Hermes endpoints are unavailable. getPriceFeedsUpdateData Detailed error: ${lastError?.message}`
    )
  }

  async getLatestPriceFeeds(feedIds: string[]): Promise<PriceUpdate | undefined> {
    let lastError: Error | null = null

    for (const hermes of this.hermesClients) {
      try {
        const response = await hermes.getLatestPriceUpdates(feedIds, { parsed: true })
        return response
      } catch (error) {
        console.log('🚀 ~ PythPriceModule ~ getLatestPriceFeeds ~ error:', error)
        lastError = error as Error
        continue
      }
    }

    throw new Error(
      `All Pyth Hermes endpoints are unavailable. getLatestPriceFeeds Detailed error: ${lastError?.message}`
    )
  }

  extractVaaBytesFromAccumulatorMessage(
    accumulatorMessage: Buffer
  ): Buffer {
    const trailingPayloadSize = accumulatorMessage.readUint8(6)
    const vaaSizeOffset =
      7 + trailingPayloadSize + 1 // header(7) + trailing payload + proof_type(1)
    const vaaSize = accumulatorMessage.readUint16BE(vaaSizeOffset)
    const vaaOffset = vaaSizeOffset + 2
    return accumulatorMessage.subarray(vaaOffset, vaaOffset + vaaSize)
  }

  private async verifyVaas(vaas: Buffer[], tx: Transaction) {
    const wormholePackageId = await this.getWormholePackageId()
    const verifiedVaas = []

    for (const vaa of vaas) {
      const [verifiedVaa] = tx.moveCall({
        target: `${wormholePackageId}::vaa::parse_and_verify`,
        arguments: [
          tx.object(this.pythConfigs.wormhole_state_id),
          tx.pure(
            bcs
              .vector(bcs.u8())
              .serialize(Array.from(vaa), { maxSize: MAX_ARGUMENT_SIZE })
              .toBytes()
          ),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      })
      verifiedVaas.push(verifiedVaa)
    }

    return verifiedVaas
  }

  /**
     * Fetches the price table object id for the current state id if not cached
     * @returns price table object id
     */
  async getPriceTableInfo(): Promise<{ id: string; fieldType: string }> {
    if (this.priceTableInfo === undefined) {
      const result = await this.fullClient.getDynamicFieldObject({
        parentId: this.pythConfigs.pyth_state_id,
        name: {
          type: "vector<u8>",
          value: "price_info",
        },
      });
      if (!result.data?.type) {
        throw new Error(
          "Price Table not found, contract may not be initialized",
        );
      }
      let type = result.data.type.replace("0x2::table::Table<", "");
      type = type.replace(
        "::price_identifier::PriceIdentifier, 0x2::object::ID>",
        "",
      );
      this.priceTableInfo = { id: result.data.objectId, fieldType: type };
    }
    return this.priceTableInfo;
  }
  /**
   * Get the priceFeedObjectId for a given feedId if not already cached
   * @param feedId - the feed id
   */
  async getPriceFeedObjectId(feedId: string): Promise<string | undefined> {
    const normalizedFeedId = feedId.replace("0x", "");
    const cacheKey = `getPriceFeedObjectId_${normalizedFeedId}`
    const cacheValue = this.fullClient.getCache<string>(cacheKey)
    if (cacheValue) {
      return cacheValue
    }
    const { id: tableId, fieldType } = await this.getPriceTableInfo();
    const result: any = await this.fullClient.getDynamicFieldObject({
      parentId: tableId,
      name: {
        type: `${fieldType}::price_identifier::PriceIdentifier`,
        value: {
          bytes: [...Buffer.from(normalizedFeedId, "hex")],
        },
      },
    });
    if (!result.data?.content) {
      return undefined;
    }
    if (result.data.content.dataType !== "moveObject") {
      throw new Error("Price feed type mismatch");
    }
    this.fullClient.updateCache(cacheKey, result.data.content.fields.value)
    return result.data.content.fields.value
  }


  private async verifyVaasAndGetHotPotato(
    tx: Transaction,
    updates: Buffer[],
    packageId: string
  ) {
    if (updates.length > 1) {
      throw new Error(
        "SDK does not support sending multiple accumulator messages in a single transaction"
      )
    }

    const vaa = this.extractVaaBytesFromAccumulatorMessage(updates[0])
    const verifiedVaas = await this.verifyVaas([vaa], tx)

    const [priceUpdatesHotPotato] = tx.moveCall({
      target: `${packageId}::pyth::create_authenticated_price_infos_using_accumulator`,
      arguments: [
        tx.object(this.pythConfigs.pyth_state_id),
        tx.pure(
          bcs
            .vector(bcs.u8())
            .serialize(Array.from(updates[0]), { maxSize: MAX_ARGUMENT_SIZE })
            .toBytes()
        ),
        verifiedVaas[0],
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    })

    return priceUpdatesHotPotato
  }

  /**
   * Builds the payload to update Pyth price feeds with the provided coin types and transaction.
   *
   * @param coinTypeList - The list of coin types to update the price feeds for.
   * @param tx - The transaction object to include in the payload.
   * @param updateOraclePriceCb - Optional callback for updating oracle price (caller-defined).
   * @returns The transaction object with the Pyth price update payload.
   */
  async buildUpdatePythPricePayload(
    coinTypeList: string[],
    tx: Transaction,
    updateOraclePriceCb: PythUpdateOraclePriceCallback
  ) {
    const { pyth_state_id, pyth_published_at, pyth_package_id } = this.pythConfigs

    // Get the price feed IDs for the coin types
    const feedIds = (await this.getFeedInfoList(coinTypeList)).map((info) => info.price_feed_id)

    if (coinTypeList.length !== feedIds.length) {
      throw Error('find feed id fail')
    }

    // Fetch the price updates from the Pyth Price Service
    const priceUpdateData = await this.getPriceFeedsUpdateData(feedIds)

    if (!priceUpdateData) {
      throw new Error('get price update data fail')
    }



    if (priceUpdateData.length > 1) {
      throw new Error('SDK does not support sending multiple accumulator messages in a single transaction')
    }

    let priceUpdatesHotPotato = await this.verifyVaasAndGetHotPotato(tx, priceUpdateData, pyth_published_at)

    // Loop through the coin types and update their respective price feeds
    let coinIndex = 0
    for (const feedId of feedIds) {
      const priceInfoObjectId = await this.getPriceFeedObjectId(feedId)

      if (!priceInfoObjectId) {
        throw new Error(`Price feed ${feedId} not found, please create it first`)
      }
      priceUpdatesHotPotato = updateOraclePriceCb({
        tx,
        coinType: coinTypeList[coinIndex],
        priceUpdatesHotPotato,
        priceInfoObjectId,
      })

      coinIndex += 1
    }

    // Clean up the price update data
    tx.moveCall({
      target: `${pyth_published_at}::hot_potato_vector::destroy`,
      arguments: [priceUpdatesHotPotato],
      typeArguments: [`${pyth_package_id}::price_info::PriceInfo`],
    })

    return tx
  }

  async getBaseUpdateFee(): Promise<number> {
    if (this.baseUpdateFee === undefined) {
      const result = await this.fullClient.getObject({
        id: this.pythConfigs.pyth_state_id,
        options: { showContent: true },
      });
      if (
        !result.data?.content ||
        result.data.content.dataType !== "moveObject"
      )
        throw new Error("Unable to fetch pyth state object");
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.baseUpdateFee = result.data.content.fields.base_update_fee as number;
    }

    return this.baseUpdateFee;
  }

  async updatePriceFeeds(
    tx: Transaction,
    updates: Buffer[],
    feedIds: string[]
  ): Promise<string[]> {
    const packageId = this.pythConfigs.pyth_package_id
    let priceUpdatesHotPotato = await this.verifyVaasAndGetHotPotato(
      tx,
      updates,
      packageId
    )

    const baseUpdateFee = await this.getBaseUpdateFee()
    const coins = tx.splitCoins(
      tx.gas,
      feedIds.map(() => tx.pure.u64(baseUpdateFee))
    )

    const priceInfoObjects: string[] = []
    let coinId = 0

    for (const feedId of feedIds) {
      const priceInfoObjectId = await this.getPriceFeedObjectId(feedId)
      if (!priceInfoObjectId) {
        throw new Error(
          `Price feed ${feedId} not found, please create it first`
        )
      }
      priceInfoObjects.push(priceInfoObjectId)

        ;[priceUpdatesHotPotato] = tx.moveCall({
          target: `${packageId}::pyth::update_single_price_feed`,
          arguments: [
            tx.object(this.pythConfigs.pyth_state_id),
            priceUpdatesHotPotato,
            tx.object(priceInfoObjectId),
            coins[coinId],
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        })
      coinId++
    }

    tx.moveCall({
      target: `${packageId}::hot_potato_vector::destroy`,
      arguments: [priceUpdatesHotPotato],
      typeArguments: [`${packageId}::price_info::PriceInfo`],
    })

    return priceInfoObjects
  }

  async buildUpdatePythPricePayloadV2(coinTypeList: string[], tx: Transaction, updateOraclePriceCb: PythUpdateOraclePriceCallback) {
    if (coinTypeList.length === 0) {
      return tx
    }
    // Get the price feed IDs for the coin types
    const feedIds = (await this.getFeedInfoList(coinTypeList)).map((info) => info.price_feed_id)

    if (coinTypeList.length !== feedIds.length) {
      throw Error('find feed id fail')
    }

    // Fetch the price updates from the Pyth Price Service
    const priceUpdateData = await this.getPriceFeedsUpdateData(feedIds)

    if (!priceUpdateData) {
      throw new Error('get price update data fail')
    }

    if (priceUpdateData.length > 1) {
      throw new Error('SDK does not support sending multiple accumulator messages in a single transaction')
    }

    const priceInfoObjectIds = await this.updatePriceFeeds(tx as any, priceUpdateData, feedIds)

    let coinIndex = 0
    for (const priceInfoObjectId of priceInfoObjectIds) {
      updateOraclePriceCb({
        tx,
        coinType: coinTypeList[coinIndex],
        priceUpdatesHotPotato: {},
        priceInfoObjectId,
      })

      coinIndex += 1
    }

    return tx
  }

  /**
   * Retrieves feed information by parsing JSON data based on the environment and coin type.
   *
   * @param coinType - The coin type for which feed info is required.
   * @returns The feed info corresponding to the given coin type.
   */
  getFeedInfoByJson(coinType: string) {
    const type = fixCoinType(coinType, false)
    return feed_map_mainnet[type]
  }

  /**
   * Retrieves feed information for a specific coin type.
   * If not found in the cache, it will fetch the data from an external source.
   *
   * @param coinType - The coin type for which feed info is required.
   * @param forceRefresh - A flag to indicate whether to force a refresh and skip the cache.
   * @returns A promise that resolves to the FeedInfo for the specified coin type.
   */
  async getFeedInfo(coinType: string, forceRefresh: boolean): Promise<FeedInfo> {
    const cacheKey = `getFeedInfo_${coinType}`
    const cacheValue = this.fullClient.getCache<FeedInfo>(cacheKey, forceRefresh)
    if (cacheValue) {
      return cacheValue
    }

    const jsonValue = this.getFeedInfoByJson(coinType)
    if (jsonValue) {
      return jsonValue
    }
    const { feed_info_handle } = this.pythConfigs
    if (!feed_info_handle) {
      throw new Error('feed_info_handle is not set')
    }

    const res: any = await this.fullClient.getDynamicFieldObject({
      parentId: feed_info_handle,
      name: {
        type: '0x1::type_name::TypeName',
        value: fixCoinType(coinType, true),
      },
    })
    const { fields } = res.data.content.fields.value
    const info: FeedInfo = {
      coin_type: coinType,
      price_feed_id: toSuiObjectId(fields.price_feed_id),
      coin_decimals: fields.coin_decimals,
    }
    console.log('🚀 ~ PythPriceModule ~ getFeedInfo ~ info:', info)
    this.fullClient.updateCache(cacheKey, info)
    return info
  }
}
