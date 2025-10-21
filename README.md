# cetus-ts-sdk

Cetus TypeScript SDK is a comprehensive collection of TypeScript libraries for interacting with various Cetus protocol features. This monorepo contains multiple SDK packages, each focusing on specific functionality within the Cetus ecosystem.

## SDK Modules

| Module                                                                                   | Version                                                                                     | Description                               | Documentation                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| [@cetusprotocol/sui-clmm-sdk](https://www.npmjs.com/package/@cetusprotocol/sui-clmm-sdk) | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fsui-clmm-sdk?logo=npm&logoColor=rgb) | Concentrated Liquidity Market Maker SDK   | [View Docs](./packages/clmm/README.md)   |
| [@cetusprotocol/vaults-sdk](https://www.npmjs.com/package/@cetusprotocol/vaults-sdk)     | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fvaults-sdk?logo=npm&logoColor=rgb)   | Vaults Management SDK                     | [View Docs](./packages/vaults/README.md) |
| [@cetusprotocol/farms-sdk](https://www.npmjs.com/package/@cetusprotocol/farms-sdk)       | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Ffarms-sdk?logo=npm&logoColor=rgb)    | Farming and Yield Generation SDK          | [View Docs](./packages/farms/README.md)  |
| [@cetusprotocol/xcetus-sdk](https://www.npmjs.com/package/@cetusprotocol/xcetus-sdk)     | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fxcetus-sdk?logo=npm&logoColor=rgb)   | XCETUS Token Operations SDK               | [View Docs](./packages/xcetus/README.md) |
| [@cetusprotocol/limit-sdk](https://www.npmjs.com/package/@cetusprotocol/limit-sdk)       | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Flimit-sdk?logo=npm&logoColor=rgb)    | Limit Order Operations SDK                | [View Docs](./packages/limit/README.md)  |
| [@cetusprotocol/burn-sdk](https://www.npmjs.com/package/@cetusprotocol/burn-sdk)         | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fburn-sdk?logo=npm&logoColor=rgb)     | Token Burning Operations SDK              | [View Docs](./packages/burn/README.md)   |
| [@cetusprotocol/dca-sdk](https://www.npmjs.com/package/@cetusprotocol/dca-sdk)           | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fdca-sdk?logo=npm&logoColor=rgb)      | Dollar Cost Averaging SDK                 | [View Docs](./packages/dca/README.md)    |
| [@cetusprotocol/common-sdk](https://www.npmjs.com/package/@cetusprotocol/common-sdk)     | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fcommon-sdk?logo=npm&logoColor=rgb)   | Common Utilities and Shared Components    | [View Docs](./packages/common/README.md) |
| [@cetusprotocol/zap-sdk](https://www.npmjs.com/package/@cetusprotocol/zap-sdk)           | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fzap-sdk?logo=npm&logoColor=rgb)      | Liquidity operations with different modes | [View Docs](./packages/zap/README.md)    |
| [@cetusprotocol/dlmm-sdk](https://www.npmjs.com/package/@cetusprotocol/dlmm-sdk)         | ![npm](https://img.shields.io/npm/v/%40cetusprotocol%2Fdlmm-sdk?logo=npm&logoColor=rgb)     | SDK for cetus dlmm                        | [View Docs](./packages/dlmm/README.md)   |

## Getting Started

Each SDK module can be installed individually using npm or yarn. For example:

```bash
npm install @cetusprotocol/sui-clmm-sdk

```

## Development

This is a monorepo managed by pnpm. To get started with development:

1. Install dependencies:

```bash
pnpm install
```

2. Build all packages:

```bash
pnpm build
```

3. Run tests:

```bash
pnpm test
```

## License

MIT
