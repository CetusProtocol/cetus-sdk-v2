import type { GraphQLDocument } from '@mysten/sui/graphql'
import { graphql } from '@mysten/sui/graphql/schema'



export const CoinMetadataIdQuery: GraphQLDocument<
  Record<string, unknown>,
  { coinType: string }
> = graphql(`
  query coinMetadataId($coinType: String!) {
    objects(filter: { type: $coinType }, first: 1) {
      nodes {
        address
      }
    }
  }
`)

export const GetTxQuery: GraphQLDocument<
  Record<string, unknown>,
  { digest: string }
> = graphql(`
  query GetTx($digest: String!) {
    transaction(digest: $digest) {
      digest
      sender {
        address
      }
      gasInput {
        gasSponsor {
          address
        }
        gasPrice
        gasBudget
      }
      effects {
        status
        timestamp
        checkpoint {
          sequenceNumber
        }
        epoch {
          epochId
          referenceGasPrice
        }
        balanceChanges {
          nodes {
            owner {
              id
            }
            coinType {
              repr
            }
            amount
          }
        }
        events {
          nodes {
            sender {
              address
            }
            timestamp
            contents {
              json
              type {
                repr
              }
            }
          }
        }
      }
      transactionJson
    }
  }
`)

export const GetAllDynamicFieldsQuery: GraphQLDocument<
  Record<string, unknown>,
  { id: string; first?: number; after?: string }
> = graphql(`
  query GetAllDynamicFields($id: SuiAddress!, $first: Int, $after: String) {
    address(address: $id) {
      dynamicFields(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name {
            type {
              repr
            }
            json
          }
          value {
            __typename
            ... on MoveValue {
              type {
                repr
              }
              json
            }
            ... on MoveObject {
              contents {
                type {
                  repr
                }
                json
              }
            }
          }
        }
      }
    }
  }
`)

export const QueryEventsQuery: GraphQLDocument<
  Record<string, unknown>,
  { type: string; first?: number; after?: string }
> = graphql(`
  query QueryEvents($type: String!, $first: Int, $after: String) {
    events(first: $first, after: $after, filter: { type: $type }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        transactionModule {
          package {
            address
          }
          name
        }
        sender {
          address
        }
        contents {
          type {
            repr
          }
          json
        }
      }
    }
  }
`)

/** Filter for querying transactions via GraphQL. */
export type TransactionFilterInput = {
  sentAddress?: string
  affectedAddress?: string
  affectedObject?: string
  function?: string
}

export const QueryTransactionsQuery: GraphQLDocument<
  Record<string, unknown>,
  {
    filter: TransactionFilterInput
    first?: number
    after?: string
    last?: number
    before?: string
  }
> = graphql(`
  query QueryTransactions(
    $filter: TransactionFilter
    $first: Int
    $after: String
    $last: Int
    $before: String
  ) {
    transactions(first: $first, after: $after, last: $last, before: $before, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
        hasPreviousPage
        startCursor
      }
      nodes {
        digest
        gasInput {
          gasSponsor {
            address
          }
          gasPrice
          gasBudget
        }
        effects {
          status
          epoch {
            epochId
            referenceGasPrice
          }
          events {
            nodes {
              sender {
                address
              }
              timestamp
              contents {
                json
                type {
                  repr
                }
              }
            }
          }
        }
      }
    }
  }
`)
