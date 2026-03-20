import { LendingMarketMetadata, ParsedLendingMarket, ParsedReserve, SuilendClient } from "@suilend/sdk";
import { CoinMetadata } from "@mysten/sui/jsonRpc";
import { Reserve } from "@suilend/sdk/_generated/suilend/reserve/structs";
import BN from "bn.js";
export * from './config_types'
export * from './market_types'
export * from './position_types'
export * from './swap_types'
export * from './pyth_types'

export interface AppData {
  suilendClient: SuilendClient;

  lendingMarket: ParsedLendingMarket;
  coinMetadataMap: Record<string, CoinMetadata>;

  refreshedRawReserves: Reserve<string>[];
  reserveMap: Record<string, ParsedReserve>;
  reserveCoinTypes: string[];
  reserveCoinMetadataMap: Record<string, CoinMetadata>;

  rewardPriceMap: Record<string, BN | undefined>;
  rewardCoinTypes: string[];
  activeRewardCoinTypes: string[];
  rewardCoinMetadataMap: Record<string, CoinMetadata>;
}

export interface AllAppData {
  allLendingMarketData: Record<string, AppData>;
  lstStatsMap: Record<
    string,
    {
      lstToSuiExchangeRate: BigNumber;
      aprPercent: BigNumber;
    }
  >;
  sdeUsdAprPercent: BigNumber | undefined;
  eThirdAprPercent: BigNumber | undefined;
  eEarnAprPercent: BigNumber | undefined;
}

export interface SuiLendCoinAprResult {
  new_total_apr_percent: string | undefined
  total_apr_percent: string
}


