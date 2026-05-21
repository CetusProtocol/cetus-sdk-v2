import type { LendingMarketMetadata } from "@suilend/sdk/lib/types";
import type { ParsedLendingMarket } from "@suilend/sdk/parsers/lendingMarket";
import type { ParsedReserve } from "@suilend/sdk/parsers/reserve";
import { SuilendClient } from "@suilend/sdk/client";
import { Reserve } from "@suilend/sdk/_generated/suilend/reserve/structs";
import BN from "bn.js";
import { SuiClientTypes } from "@mysten/sui/client";
export * from './config_types'
export * from './market_types'
export * from './position_types'
export * from './swap_types'
export * from './pyth_types'
export * from './tspl_types'

export interface AppData {
  suilendClient: SuilendClient;

  lendingMarket: ParsedLendingMarket;
  coinMetadataMap: Record<string, SuiClientTypes.CoinMetadata>;

  refreshedRawReserves: Reserve<string>[];
  reserveMap: Record<string, ParsedReserve>;
  reserveCoinTypes: string[];
  reserveCoinMetadataMap: Record<string, SuiClientTypes.CoinMetadata>;

  rewardPriceMap: Record<string, BN | undefined>;
  rewardCoinTypes: string[];
  activeRewardCoinTypes: string[];
  rewardCoinMetadataMap: Record<string, SuiClientTypes.CoinMetadata>;
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


