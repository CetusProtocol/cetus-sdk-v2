import { ChainType, Route, RouteExtended, RoutesResponse } from '@lifi/sdk'
import { Quote, SolanaTransactionSigner } from '@mayanfinance/swap-sdk'
import { Transaction } from '@mysten/sui/transactions'
import { Connection } from '@solana/web3.js'
import { Signer, TransactionResponse } from 'ethers'
import { WalletWithRequiredFeatures } from '@mysten/wallet-standard'
import { WalletClient } from 'viem'
import type { SignerWalletAdapter } from '@solana/wallet-adapter-base'
import type { Client } from '@bigmi/core'

export type CrossSwapLiFiConfigs = {
  sui?: {
    wallet: WalletWithRequiredFeatures
  }
  evm?: {
    wallet: WalletClient
  }
  solana?: {
    wallet: SignerWalletAdapter
  }
  btc?: {
    wallet: Client
  }
}

export type MayanConfigs = {
  solana?: {
    signer: SolanaTransactionSigner
    connection: Connection
  }
  evm?: {
    evm_signer: Signer
  }
}

export enum CrossSwapPlatform {
  MAYAN = 'mayan',
  LI_FI = 'li.fi',
}

export type Chain = {
  name_id: string
  chain_name: string
  type: ChainType
  id: ChainId
  logo_url: string
  rpc_urls: string[]
  platform: CrossSwapPlatform
  block_explorer: string
  native_token: {
    address: string
    symbol: string
    decimals: number
    name: string
    logo_url: string
  }
}

export enum ChainId {
  ETH = 1,
  POL = 137,
  BSC = 56,
  DAI = 100,
  FTM = 250,
  AVA = 43114,
  ARB = 42161,
  OPT = 10,
  ONE = 1666600000,
  FSN = 32659,
  MOR = 1285,
  CEL = 42220,
  FUS = 122,
  TLO = 40,
  CRO = 25,
  BOB = 288,
  RSK = 30,
  VEL = 106,
  MOO = 1284,
  MAM = 1088,
  AUR = 1313161554,
  EVM = 9001,
  ARN = 42170,
  ERA = 324,
  PZE = 1101,
  LNA = 59144,
  BAS = 8453,
  SCL = 534352,
  MOD = 34443,
  MNT = 5000,
  BLS = 81457,
  SEI = 1329,
  FRA = 252,
  TAI = 167000,
  GRA = 1625,
  IMX = 13371,
  KAI = 8217,
  XLY = 196,
  OPB = 204,
  WCC = 480,
  LSK = 1135,
  ABS = 2741,
  BER = 80094,
  SON = 146,
  UNI = 130,
  APE = 33139,
  SOE = 1868,
  INK = 57073,
  LNS = 232,
  SWL = 1923,
  CRN = 21000000,
  ETL = 42793,
  SUP = 55244,
  HYP = 999,
  XDC = 50,
  BOC = 60808, // BOB was already taken by Boba
  VIC = 88,
  FLR = 14,
  KAT = 747474,

  // None-EVM (IDs are made up by the LI.FI team)
  SOL_LI_FI = 1151111081099710,
  SOL_MAYAN = 0,
  TER = 1161011141099710,
  OAS = 111971151099710,

  // MVM (IDs are made up by the LI.FI team)
  SUI_LI_FI = 9270000000000000, // First 16 non-letter hex digits of SUI genesis blob
  SUI_MAYAN = 1999, // First 16 non-letter hex digits of SUI genesis blob

  // UTXO (IDs are made up by the LI.FI team)
  BTC = 20000000000001,
  BCH = 20000000000002,
  LTC = 20000000000003,
  DGE = 20000000000004,
}

export const SOL_MAYAN_ADDRESS = '0x0000000000000000000000000000000000000000'
export const SOL_LI_FI_ADDRESS = '11111111111111111111111111111111'

export const wChainId: Record<number, ChainId> = {
  21: ChainId.SUI_MAYAN,
  1: ChainId.SOL_MAYAN,
  30: ChainId.BAS,
  23: ChainId.ARB,
  24: ChainId.OPT,
  5: ChainId.POL,
  6: ChainId.AVA,
  4: ChainId.BSC,
  2: ChainId.ETH,
  44: ChainId.UNI,
  38: ChainId.LNA,
}

export type CrossSwapToken = {
  name: string
  symbol: string
  type: ChainType
  address: string
  chain_id: number
  decimals: number
  logo_url: string
  price_usd?: string
  supports_permit?: boolean
  coingecko_id?: string
}

export type CrossSwapTokenBalance = {
  chain_id: ChainId
  address: string
  balance: string
  balance_usd?: string
  balance_formatted?: string
}

export type EstimateQuoteOptions = {
  amount: string
  from_token: string
  to_token: string
  from_chain_id: ChainId
  to_chain_id: ChainId
  slippage?: number
  mayan_configs?: {
    gas_drop?: number
  }
  lifi_configs?: {
    from_address?: string
    to_address?: string
  }
}

export type SwapOptions = {
  swap_wallet_address: string
  destination_address: string
  quote: CrossSwapQuote
}

export type CrossSwapResult = {
  solana?: {
    signature: string
    serializedTrx: Uint8Array | null
  }
  sui?: Transaction
  evm?: TransactionResponse | string | RouteExtended
}

export type CrossSwapQuoteError = {
  code: string
  message: any
  data?: any
}

export type CrossSwapQuote = {
  amount_in: string
  amount_in_formatted: string
  amount_in_usd?: string
  amount_out: string
  amount_out_formatted: string
  amount_out_usd?: string
  min_amount_out: string
  min_amount_out_formatted: string
  gas_cost_usd: string
  execution_duration: number
  quote: {
    mayan_quote?: Quote
    lifi_quote?: Route
  }
  from_chain: Chain
  to_chain: Chain
  from_token: CrossSwapToken
  to_token: CrossSwapToken
  platform: CrossSwapPlatform
}

export type CrossSwapRouter = {
  error?: CrossSwapQuoteError
  quotes: CrossSwapQuote[]
}

export type CrossSwapFee = {
  amount: string
  amount_formatted: string
  amountUSD: string
  token: CrossSwapToken
}

export type UpdateCrossSwapAction = {
  updatePermitState: (quote: Quote, state: 'success' | 'start') => void
}
