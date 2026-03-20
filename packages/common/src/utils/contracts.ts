import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'
import { fromBase64, fromHex, normalizeSuiObjectId } from '@mysten/sui/utils'
import type { SuiAddressType, SuiStructTag } from '../type/sui'
import { CoinAssist, GAS_TYPE_ARG, GAS_TYPE_ARG_LONG } from './coinAssist'
import { removeHexPrefix } from './hex'

const EQUAL = 0
const LESS_THAN = 1
const GREATER_THAN = 2

function cmp(a: number, b: number) {
  if (a === b) {
    return EQUAL
  }
  if (a < b) {
    return LESS_THAN
  }
  return GREATER_THAN
}

function compare(symbol_x: string, symbol_y: string) {
  let i = 0

  const len = symbol_x.length <= symbol_y.length ? symbol_x.length : symbol_y.length

  const len_cmp = cmp(symbol_x.length, symbol_y.length)
  while (i < len) {
    const elem_cmp = cmp(symbol_x.charCodeAt(i), symbol_y.charCodeAt(i))
    i += 1
    if (elem_cmp !== 0) {
      return elem_cmp
    }
  }

  return len_cmp
}

export function isSortedSymbols(symbol_x: string, symbol_y: string) {
  return compare(symbol_x, symbol_y) === LESS_THAN
}

export function composeType(address: string, generics: SuiAddressType[]): SuiAddressType
export function composeType(address: string, struct: string, generics?: SuiAddressType[]): SuiAddressType
export function composeType(address: string, module: string, struct: string, generics?: SuiAddressType[]): SuiAddressType
export function composeType(address: string, ...args: unknown[]): SuiAddressType {
  const generics: string[] = Array.isArray(args[args.length - 1]) ? (args.pop() as string[]) : []
  const chains = [address, ...args].filter(Boolean)

  let result: string = chains.join('::')

  if (generics && generics.length) {
    result += `<${generics.join(', ')}>`
  }

  return result
}

export function extractAddressFromType(type: string) {
  return type.split('::')[0]
}

export function extractStructTagFromType(type: string): SuiStructTag {
  try {
    let _type = type.replace(/\s/g, '')

    const genericsString = _type.match(/(<.+>)$/)
    const generics = genericsString?.[0]?.match(/(\w+::\w+::\w+)(?:<.*?>(?!>))?/g)
    if (generics) {
      _type = _type.slice(0, _type.indexOf('<'))
      const tag = extractStructTagFromType(_type)
      const structTag: SuiStructTag = {
        ...tag,
        type_arguments: generics.map((item) => extractStructTagFromType(item).source_address),
      }
      structTag.type_arguments = structTag.type_arguments.map((item) => {
        return CoinAssist.isSuiCoin(item) ? item : extractStructTagFromType(item).source_address
      })
      structTag.source_address = composeType(structTag.full_address, structTag.type_arguments)
      return structTag
    }
    const parts = _type.split('::')

    const isSuiCoin = _type === GAS_TYPE_ARG || _type === GAS_TYPE_ARG_LONG

    const structTag: SuiStructTag = {
      full_address: _type,
      address: isSuiCoin ? '0x2' : normalizeSuiObjectId(parts[0]),
      module: parts[1],
      name: parts[2],
      type_arguments: [],
      source_address: '',
    }
    structTag.full_address = `${structTag.address}::${structTag.module}::${structTag.name}`
    structTag.source_address = composeType(structTag.full_address, structTag.type_arguments)
    return structTag
  } catch (error) {
    return {
      full_address: type,
      address: '',
      module: '',
      name: '',
      type_arguments: [],
      source_address: type,
    }
  }
}

export function normalizeCoinType(coin_type: string): string {
  return extractStructTagFromType(coin_type).source_address
}

export function fixSuiObjectId(value: string): string {
  if (value.toLowerCase().startsWith('0x')) {
    return normalizeSuiObjectId(value)
  }
  return value
}

/**
 * Fixes and normalizes a coin type by removing or keeping the prefix.
 *
 * @param {string} coin_type - The coin type to be fixed.
 * @param {boolean} remove_prefix - Whether to remove the prefix or not (default: true).
 * @returns {string} - The fixed and normalized coin type.
 */
export const fixCoinType = (coin_type: string, remove_prefix = true) => {
  const arr = coin_type.split('::')
  const address = arr.shift() as string
  let normalize_address = normalizeSuiObjectId(address)
  if (remove_prefix) {
    normalize_address = removeHexPrefix(normalize_address)
  }
  return `${normalize_address}::${arr.join('::')}`
}

/**
 * Recursively traverses the given data object and patches any string values that represent Sui object IDs.
 *
 * @param {any} data - The data object to be patched.
 */
export function patchFixSuiObjectId(data: any) {
  for (const key in data) {
    const type = typeof data[key]

    if (type === 'object') {
      patchFixSuiObjectId(data[key])
    } else if (type === 'string') {
      const value = data[key]
      if (value && !value.includes('::')) {
        data[key] = fixSuiObjectId(value)
      }
    }
  }
}

/**
 * Converts a secret key in string or Uint8Array format to an Ed25519 key pair.
 * @param {string|Uint8Array} secret_key - The secret key to convert.
 * @param {string} ecode - The encoding of the secret key ('hex' or 'base64'). Defaults to 'hex'.
 * @returns {Ed25519Keypair} - Returns the Ed25519 key pair.
 */
export function secretKeyToEd25519Keypair(secret_key: string | Uint8Array, ecode: 'hex' | 'base64' = 'hex'): Ed25519Keypair {
  if (secret_key instanceof Uint8Array) {
    const key = Buffer.from(secret_key)
    return Ed25519Keypair.fromSecretKey(new Uint8Array(key))
  }

  const hex_key = ecode === 'hex' ? fromHex(secret_key) : fromBase64(secret_key)
  return Ed25519Keypair.fromSecretKey(hex_key)
}

/**
 * Converts a secret key in string or Uint8Array format to a Secp256k1 key pair.
 * @param {string|Uint8Array} secret_key - The secret key to convert.
 * @param {string} ecode - The encoding of the secret key ('hex' or 'base64'). Defaults to 'hex'.
 * @returns {Ed25519Keypair} - Returns the Secp256k1 key pair.
 */
export function secretKeyToSecp256k1Keypair(secret_key: string | Uint8Array, ecode: 'hex' | 'base64' = 'hex'): Secp256k1Keypair {
  if (secret_key instanceof Uint8Array) {
    const key = Buffer.from(secret_key)
    return Secp256k1Keypair.fromSecretKey(new Uint8Array(key))
  }
  const hex_key = ecode === 'hex' ? fromHex(secret_key) : fromBase64(secret_key)
  return Secp256k1Keypair.fromSecretKey(hex_key)
}
