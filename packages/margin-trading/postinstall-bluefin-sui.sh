#!/usr/bin/env bash
# 勿使用 set -e：find 为空时 read 会失败导致脚本中途退出、后续补丁不执行
set -uo pipefail

# 仓库根（脚本位于 packages/web/）
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PKG=node_modules/@bluefin-exchange/bluefin7k-aggregator-sdk

if [ -d "$PKG" ] && [ ! -d "$PKG/node_modules/@mysten/sui" ]; then
  echo "Installing nested sui for bluefin sdk..."
  (cd "$PKG" && pnpm add @mysten/sui@1.14.0)
fi


