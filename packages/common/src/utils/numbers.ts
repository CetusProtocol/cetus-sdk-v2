import Decimal from 'decimal.js'

/**
 * Creates a Decimal instance from a value
 * @param value - The value to convert to Decimal
 * @returns A Decimal instance
 */
export function d(value?: Decimal.Value): Decimal.Instance {
  if (Decimal.isDecimal(value)) {
    return value as Decimal
  }

  return new Decimal(value === undefined ? 0 : value)
}

/**
 * Calculates the multiplier for decimal places
 * @param decimals - The number of decimal places
 * @returns A Decimal instance representing the multiplier
 */
export function decimalsMultiplier(decimals?: Decimal.Value): Decimal.Instance {
  return d(10).pow(d(decimals).abs())
}

/**
 * Converts an amount to a decimal value, based on the number of decimals specified.
 * @param  {number | string} amount - The amount to convert to decimal.
 * @param  {number | string} decimals - The number of decimals to use in the conversion.
 * @returns {number} - Returns the converted amount as a number.
 */
export function toDecimalsAmount(amount: number | string, decimals: number | string, rounding = Decimal.ROUND_DOWN): string {
  const mul = decimalsMultiplier(d(decimals))

  return d(amount).mul(mul).toFixed(0, rounding).toString()
}

/**
 * Converts a bigint to an unsigned integer of the specified number of bits.
 * @param {bigint} int - The bigint to convert.
 * @param {number} bits - The number of bits to use in the conversion. Defaults to 32 bits.
 * @returns {string} - Returns the converted unsigned integer as a string.
 */
export function asUintN(int: bigint, bits = 32) {
  return BigInt.asUintN(bits, BigInt(int)).toString()
}

/**
 * Converts a bigint to a signed integer of the specified number of bits.
 * @param {bigint} int - The bigint to convert.
 * @param {number} bits - The number of bits to use in the conversion. Defaults to 32 bits.
 * @returns {number} - Returns the converted signed integer as a number.
 */
export function asIntN(int: bigint, bits = 32) {
  return Number(BigInt.asIntN(bits, BigInt(int)))
}

/**
 * Converts an amount in decimals to its corresponding numerical value.
 * @param {number|string} amount - The amount to convert.
 * @param {number|string} decimals - The number of decimal places used in the amount.
 * @returns {string} - Returns the converted numerical value.
 */
export function fromDecimalsAmount(amount: number | string, decimals: number | string): string {
  const mul = decimalsMultiplier(d(decimals))

  return d(amount).div(mul).toString()
}

/**
 * Handles precision calculation for scientific notation addition
 * @param num - The number to process
 * @param precision - The desired precision
 * @param auto_fix - Whether to automatically fix the precision
 * @returns The processed number as a string
 */
const fixDEAdd = (num: any, precision: any, auto_fix = true) => {
  if (`${num}` === '0') {
    if (!parseFloat(precision) || !auto_fix) return '0'
    return '0.'.padEnd(precision + 2, '0')
  }
  if (!num) return '--'

  const number = parseFloat(num)
  const strN = num.toString()
  const flag = number < 0
  let result = strN

  if (strN.toLowerCase().includes('e')) {
    const n = strN.match(/(\d+?)(?:\.(\d*))?e([+-])(\d+)/)
    // Avoid array out-of-bounds errors, return the original value if matching fails
    if (!n) {
      return num.toString() // Return original value if pattern matching fails to avoid array out of bounds
    }

    const nl = n[1] || '0' // Left part of decimal point
    const nr = n[2] || '' // Right part of decimal point
    const type = n[3] // '+' or '-'
    const floatN = parseInt(n[4], 10) // Exponent part

    let params = ''
    let pr = nr.substring(floatN) || ''
    if (pr) pr = `.${pr}`

    if (type !== '-') {
      for (let i = 0; i < floatN; i++) {
        params += nr[i] || '0'
      }
      result = nl + params + pr
    } else {
      let strL = '0'
      for (let i = 0; i < floatN; i++) {
        params = (nl[nl.length - i - 1] || '0') + params
      }
      if (nl.length > floatN) {
        strL = nl.substring(0, nl.length - floatN)
      }
      result = `${strL}.${params}${nr}`
    }
  }

  if (precision && auto_fix) {
    let pal = `${result.split('.')[0]}.`
    const par = result.split('.')[1] || ''

    for (let i = 0; i < precision; i++) {
      pal += par[i] || '0'
    }
    result = pal
  }

  return `${flag ? '-' : ''}${result}`
}

/**
 * Converts a scientific notation number string to decimal form
 * @param num_str - The number string to convert
 * @param precision - The precision (number of decimal places to keep)
 * @returns The decimal form string
 */
export function convertScientificToDecimal(num_str?: string, precision = 9): string {
  if (num_str === undefined) {
    return ''
  }
  // Convert to lowercase for consistency
  const new_num = num_str?.toLowerCase()

  // Check if it contains scientific notation 'e'
  if (new_num.includes('e')) {
    // Check if it's in 'e+' format
    if (new_num.includes('+')) {
      return fixDEAdd(new_num, precision)
    }

    // Handle 'e-' case
    const [base, exponent_str] = new_num.split('e')
    let integer_part = base
    const exponent = Math.abs(parseInt(exponent_str, 10)) // Get absolute value of exponent part
    let zeros = ''
    let integer_length = integer_part.length

    // Check for decimal point and remove it
    if (base.includes('.')) {
      const [int_part, frac_part] = base.split('.')
      integer_part = int_part + frac_part // Remove decimal point
      integer_length = int_part.length
    }

    // Generate the necessary leading zeros
    for (let i = 0; i < exponent - integer_length; i++) {
      zeros += '0'
    }

    // Combine into decimal format
    return `0.${zeros}${integer_part}`.slice(0, precision + 2) // precision + 2 ensures enough decimal places
  }

  // If not scientific notation, return as is
  return num_str
}
