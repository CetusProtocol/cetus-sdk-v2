import { addresses, Quote, Token } from '@mayanfinance/swap-sdk'
import { Contract, parseUnits, Signature, Signer, TypedDataEncoder, Wallet } from 'ethers'
import { abi as ERC20Permit_ABI } from '@openzeppelin/contracts/build/contracts/ERC20Permit.json'
import MayanForwarderArtifact from '../contacts/MayanForwarderArtifact'
import { SolanaTransactionSigner } from '@mayanfinance/swap-sdk'
import { Transaction as SolanaTransaction, VersionedTransaction, Keypair } from '@solana/web3.js'
import { Chain, CrossSwapToken, UpdateCrossSwapAction } from '../types/cross_swap'
import { fixCoinType } from '@cetusprotocol/common-sdk'
import { ChainType } from '@lifi/sdk'

export function getAmountOfFractionalAmount(amount: string | number, decimals: string | number): bigint {
  const cutFactor = Math.min(8, Number(decimals))
  const numStr = Number(amount).toFixed(cutFactor + 1)
  const reg = new RegExp(`^-?\\d+(?:\\.\\d{0,${cutFactor}})?`)
  const matchResult = numStr.match(reg)
  if (!matchResult) {
    throw new Error('getAmountOfFractionalAmount: fixedAmount is null')
  }
  const fixedAmount = matchResult[0]
  return parseUnits(fixedAmount, Number(decimals))
}

export async function getErcPermitOrAllowance(
  quote: Quote,
  signer: Signer,
  walletSrcAddr: string,
  updateCrossSwapAction?: UpdateCrossSwapAction
) {
  if (quote.fromToken.standard !== 'erc20') {
    return undefined
  }
  const tokenContract = new Contract(quote.fromToken.contract, ERC20Permit_ABI, signer)
  const amountIn = getAmountOfFractionalAmount(quote.effectiveAmountIn, quote.fromToken.decimals)
  if (quote.fromToken.supportsPermit) {
    const nonce = await tokenContract.nonces(walletSrcAddr)
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10

    const domain = {
      name: await tokenContract.name(),
      version: '1',
      chainId: quote.fromToken.chainId,
      verifyingContract: await tokenContract.getAddress(),
    }
    const domainSeparator = await tokenContract.DOMAIN_SEPARATOR()
    for (let i = 1; i < 11; i++) {
      domain.version = String(i)
      const hash = TypedDataEncoder.hashDomain(domain)
      if (hash.toLowerCase() === domainSeparator.toLowerCase()) {
        break
      }
    }

    let spender = addresses.MAYAN_FORWARDER_CONTRACT
    if (quote.type === 'SWIFT' && quote.gasless) {
      const forwarderContract = new Contract(addresses.MAYAN_FORWARDER_CONTRACT, MayanForwarderArtifact.abi, signer.provider)
      const isValidSwiftContract = await forwarderContract.mayanProtocols(quote.swiftMayanContract)
      if (!isValidSwiftContract) {
        throw new Error('Invalid Swift contract for gasless swap')
      }
      if (!quote.swiftMayanContract) {
        throw new Error('Swift contract not found')
      }
      spender = quote.swiftMayanContract
    }

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    }

    const value = {
      owner: walletSrcAddr,
      spender,
      value: amountIn,
      nonce,
      deadline,
    }
    updateCrossSwapAction?.updatePermitState(quote, 'start')
    const signature = await signer.signTypedData(domain, types, value)
    const { v, r, s } = Signature.from(signature)
    updateCrossSwapAction?.updatePermitState(quote, 'success')
    // const permitTx = await tokenContract.permit(walletSrcAddr, spender, amountIn, deadline, v, r, s)
    // await permitTx.wait()
    return {
      value: amountIn,
      deadline,
      v,
      r,
      s,
    }
  }

  const allowance: bigint = await tokenContract.allowance(walletSrcAddr, addresses.MAYAN_FORWARDER_CONTRACT)
  if (allowance < amountIn) {
    updateCrossSwapAction?.updatePermitState(quote, 'start')
    const approveTx = await tokenContract.approve(addresses.MAYAN_FORWARDER_CONTRACT, amountIn)
    await approveTx.wait()
    updateCrossSwapAction?.updatePermitState(quote, 'success')
  }
}

/**
 * Create a Solana signer function from a keypair
 * This is useful for testing or when you have access to the keypair
 * In production DApps, you should use the wallet's signer function instead
 *
 * @param keypair The Solana keypair
 * @returns SolanaTransactionSigner The signer function
 */
export function createSolanaSignerFromKeypair(keypair: Keypair): SolanaTransactionSigner {
  return ((trx: SolanaTransaction | VersionedTransaction): Promise<SolanaTransaction | VersionedTransaction> => {
    if ('version' in trx) {
      ;(trx as VersionedTransaction).sign([keypair])
    } else {
      ;(trx as SolanaTransaction).sign(keypair)
    }
    return Promise.resolve(trx)
  }) as SolanaTransactionSigner
}

/**
 * Create a Solana signer function from a wallet adapter
 * This is the recommended approach for production DApps
 *
 * @param walletAdapter The wallet adapter with signTransaction method
 * @returns SolanaTransactionSigner The signer function
 */
export function createSolanaSignerFromWallet(walletAdapter: {
  signTransaction: (transaction: SolanaTransaction | VersionedTransaction) => Promise<SolanaTransaction | VersionedTransaction>
}): SolanaTransactionSigner {
  return walletAdapter.signTransaction.bind(walletAdapter) as SolanaTransactionSigner
}

export const parseCrossTokenFromMayan = (token: Token, chain: Chain) => {
  const crossSwapToken: CrossSwapToken = {
    address: token.contract,
    name: token.name,
    type: chain.type,
    symbol: token.symbol,
    decimals: token.decimals,
    chain_id: Number(chain.id),
    logo_url: token.logoURI,
    supports_permit: token.supportsPermit,
    coingecko_id: token.coingeckoId,
  }
  return crossSwapToken
}

export const isEqualTokenAddress = (token_address_a: string, token_address_b: string, isMvm: boolean) => {
  return isMvm ? fixCoinType(token_address_a, false) === fixCoinType(token_address_b, false) : token_address_a === token_address_b
}

export const isEqualToken = (token_a: CrossSwapToken, token_b: CrossSwapToken) => {
  if (token_a.chain_id === token_b.chain_id) {
    return isEqualTokenAddress(token_a.address, token_b.address, token_a.type === ChainType.MVM)
  }
  return false
}

export const generateTokenKey = (token: CrossSwapToken) => {
  if (token.type === ChainType.MVM) {
    return `${fixCoinType(token.address, false)}-${token.chain_id}`
  }
  return `${token.address}-${token.chain_id}`
}
