import { CLOCK_ADDRESS, getPackagerConfigs } from '@cetusprotocol/common-sdk'
import { CetusMarginTradingSDK } from '../sdk'
import { Transaction } from '@mysten/sui/transactions'
import { wrapMarketPermissions } from '../utils'

export class PermissionModules {
  protected _sdk: CetusMarginTradingSDK

  constructor(sdk: CetusMarginTradingSDK) {
    this._sdk = sdk
  }

  queryGlobalPermissions = async () => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id } = getPackagerConfigs(config)
    const globalConfig: any = await this._sdk.FullClient.getObject({
      id: global_config_id,
      options: { showContent: true },
    })
    if (globalConfig) {
      // u32Max
      const permissions = globalConfig.data.content.fields.permissions.toString(2)
      const {
        open_permissions_pause,
        close_permissions_pause,
        deposit_permissions_pause,
        withdraw_permissions_pause,
        borrow_permissions_pause,
        repay_permissions_pause,
      } = wrapMarketPermissions(permissions)
      return {
        open_permissions_pause,
        close_permissions_pause,
        deposit_permissions_pause,
        withdraw_permissions_pause,
        borrow_permissions_pause,
        repay_permissions_pause,
      }
    }
  }

  updateGlobalPermissions = async (pause: boolean) => {
    const tx = new Transaction()
    this.updateGlobalOpenPositionPermissions(pause, tx)
    this.updateGlobalClosePositionPermissions(pause, tx)
    this.updateGlobalDepositPermissions(pause, tx)
    this.updateGlobalBorrowPermissions(pause, tx)
    this.updateGlobalWithdrawPermissions(pause, tx)
    this.updateGlobalRepayPermissions(pause, tx)
    return tx
  }

  updateGlobalOpenPositionPermissions = async (pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id, versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::config::update_global_open_position_permissions`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.pure.bool(pause),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  updateGlobalClosePositionPermissions = async (pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id, versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::config::update_global_close_position_permissions`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.pure.bool(pause),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  updateGlobalDepositPermissions = async (pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id, versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::config::update_global_deposit_permissions`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.pure.bool(pause),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  updateGlobalBorrowPermissions = async (pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id, versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::config::update_global_borrow_permissions`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.pure.bool(pause),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  updateGlobalWithdrawPermissions = async (pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id, versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::config::update_global_withdraw_permissions`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.pure.bool(pause),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  updateGlobalRepayPermissions = async (pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { global_config_id, versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::config::update_global_repay_permissions`,
      arguments: [
        tx.object(admin_cap_id),
        tx.object(global_config_id),
        tx.pure.bool(pause),
        tx.object(CLOCK_ADDRESS),
        tx.object(versioned_id),
      ],
      typeArguments: [],
    })
    return tx
  }

  updateMarketCreatePositionPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::market::update_market_open_position_permission`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.pure.bool(pause), tx.object(versioned_id)],
      typeArguments: [],
    })
    return tx
  }

  updateMarketClosePositionPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::market::update_market_close_position_permission`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.pure.bool(pause), tx.object(versioned_id)],
      typeArguments: [],
    })
    return tx
  }

  updateMarketDepositPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::market::update_market_deposit_permission`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.pure.bool(pause), tx.object(versioned_id)],
      typeArguments: [],
    })
    return tx
  }

  updateMarketWithdrawPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::market::update_market_withdraw_permission`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.pure.bool(pause), tx.object(versioned_id)],
      typeArguments: [],
    })
    return tx
  }

  updateMarketBorrowPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::market::update_market_borrow_permission`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.pure.bool(pause), tx.object(versioned_id)],
      typeArguments: [],
    })
    return tx
  }

  updateMarketRepayPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const config = this._sdk.sdkOptions.margin_trading
    const { versioned_id, admin_cap_id } = getPackagerConfigs(config)
    const tx = txb || new Transaction()
    tx.moveCall({
      target: `${config.published_at}::market::update_market_repay_permission`,
      arguments: [tx.object(admin_cap_id), tx.object(market_id), tx.pure.bool(pause), tx.object(versioned_id)],
      typeArguments: [],
    })
    return tx
  }

  updateMarketPermissions = async (market_id: string, pause: boolean, txb?: Transaction) => {
    const tx = txb || new Transaction()
    this.updateMarketCreatePositionPermissions(market_id, pause, tx)
    this.updateMarketClosePositionPermissions(market_id, pause, tx)
    this.updateMarketDepositPermissions(market_id, pause, tx)
    this.updateMarketWithdrawPermissions(market_id, pause, tx)
    this.updateMarketBorrowPermissions(market_id, pause, tx)
    this.updateMarketRepayPermissions(market_id, pause, tx)
    return tx
  }
}
