#  Contract Error Codes

the Cetus smart contract may return the following error codes:

| Module                   | Error Code | Description                                 | Contract Methods                                                                                              |
| ------------------------ | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| cetus_clmm::pool         | 0          | Amount is incorrect                         | flash_swap_internal,add_liquidity_fix_coin,repay_add_liquidity,repay_flash_swap,repay_flash_swap_with_partner |
| cetus_clmm::pool         | 1          | Liquidity overflow                          | add_liquidity_internal,calculate_swap_result                                                                  |
| cetus_clmm::pool         | 3          | Liquidity is zero                           | add_liquidity,remove_liquidity,add_liquidity_internal                                                         |
| cetus_clmm::pool         | 4          | Not enough liquidity                        | swap_in_pool                                                                                                  |
| cetus_clmm::pool         | 5          | Remainder amount underflow                  | check_remainer_amount_sub                                                                                     |
| cetus_clmm::pool         | 6          | Swap amount in overflow                     | update_swap_result                                                                                            |
| cetus_clmm::pool         | 7          | Swap amount out overflow                    | update_swap_result                                                                                            |
| cetus_clmm::pool         | 8          | Fee amount overflow                         | update_swap_result                                                                                            |
| cetus_clmm::pool         | 9          | Invalid fee rate                            | update_fee_rate                                                                                               |
| cetus_clmm::pool         | 10         | Invalid fixed coin type                     | get_liquidity_from_amount                                                                                     |
| cetus_clmm::pool         | 11         | Wrong sqrt price limit                      | flash_swap_internal                                                                                           |
| cetus_clmm::pool         | 12         | Pool ID is error                            | repay_add_liquidity                                                                                           |
| cetus_clmm::pool         | 13         | Pool is paused                              |                                                                                                               |
| cetus_clmm::pool         | 14         | Flash swap receipt not match                | repay_flash_swap_with_partner, repay_flash_swap                                                               |
| cetus_clmm::pool         | 16         | Invalid partner ref fee rate                | swap_in_pool                                                                                                  |
| cetus_clmm::pool         | 17         | Reward does not exist                       | get_position_reward ,calculate_and_update_reward,collect_reward                                               |
| cetus_clmm::pool         | 18         | Amount out is zero                          | flash_swap_internal                                                                                           |
| cetus_clmm::pool         | 19         | Pool position not match                     | collect_reward,add_liquidity,add_liquidity_fix_coin,remove_liquidity,close_position,collect_fee               |
| cetus_clmm::position     | 1          | Fee owned overflow                          | update_fee_internal                                                                                           |
| cetus_clmm::position     | 2          | Reward owned overflow                       | update_rewards_internal                                                                                       |
| cetus_clmm::position     | 3          | Points owned overflow                       | update_points_internal                                                                                        |
| cetus_clmm::position     | 5          | Invalid position tick range                 | check_position_tick_range                                                                                     |
| cetus_clmm::position     | 6          | Position does not exist                     | borrow_mut_position_info，fetch_positions，borrow_position_info                                               |
| cetus_clmm::position     | 7          | Position is not empty                       | close_position                                                                                                |
| cetus_clmm::position     | 8          | Liquidity change overflow                   | increase_liquidity                                                                                            |
| cetus_clmm::position     | 9          | Liquidity change underflow                  | decrease_liquidity                                                                                            |
| cetus_clmm::position     | 10         | Invalid reward index                        | update_and_reset_rewards                                                                                      |
| cetus_clmm::rewarder     | 1          | Reward slot is full                         | add_rewarder                                                                                                  |
| cetus_clmm::rewarder     | 2          | Reward already exists                       | add_rewarder                                                                                                  |
| cetus_clmm::rewarder     | 3          | Invalid time                                | settle                                                                                                        |
| cetus_clmm::rewarder     | 4          | Reward amount insufficient                  | update_emission                                                                                               |
| cetus_clmm::rewarder     | 5          | Reward does not exist                       | borrow_mut_rewarder，borrow_rewarder                                                                          |
| cetus_clmm::tick         | 0          | Liquidity overflow                          | update_by_liquidity                                                                                           |
| cetus_clmm::tick         | 1          | Liquidity underflow                         | update_by_liquidity，cross_by_swap                                                                            |
| cetus_clmm::tick         | 2          | Invalid tick                                | tick_score，                                                                                                  |
| cetus_clmm::tick         | 3          | Tick not found                              | decrease_liquidity，                                                                                          |
| cetus_clmm::pool_creator | 1          | Pool is permission                          | create_pool_v2                                                                                                |
| cetus_clmm::pool_creator | 4          | Cap not match with pool key                 | create_pool_v2_with_creation_cap                                                                              |
| cetus_clmm::pool_creator | 5          | Init sqrt price not between lower and upper | create_pool_v2                                                                                                |
| cetus_clmm::partner      | 1          | Partner already exists                      | create_partner                                                                                                |
| cetus_clmm::partner      | 2          | Invalid time                                | create_partner，update_time_range                                                                             |
| cetus_clmm::partner      | 3          | Invalid partner ref fee rate                | update_ref_fee_rate，create_partner                                                                           |
| cetus_clmm::partner      | 4          | Invalid partner cap                         | claim_ref_fee                                                                                                 |
| cetus_clmm::partner      | 5          | Invalid coin type                           | claim_ref_fee                                                                                                 |
| cetus_clmm::partner      | 6          | Invalid partner name                        | create_partner                                                                                                |
| cetus_clmm::factory      | 1          | Pool already exists                         | create_pool_internal                                                                                          |
| cetus_clmm::factory      | 2          | Invalid sqrt price                          | create_pool_internal                                                                                          |
| cetus_clmm::factory      | 3          | Same coin type                              | new_pool_key，create_pool_internal                                                                            |
| cetus_clmm::factory      | 4          | Amount in above max limit                   | create_pool_v2_                                                                                               |
| cetus_clmm::factory      | 5          | Amount out below min limit                  | create_pool_v2_                                                                                               |
| cetus_clmm::factory      | 6          | Invalid coin type sequence                  | new_pool_key                                                                                                  |
| cetus_clmm::factory      | 7          | Quote coin type not in allowed pair config  | register_permission_pair_internal                                                                             |
| cetus_clmm::factory      | 8          | Tick spacing not in allowed pair config     | register_permission_pair_internal                                                                             |
| cetus_clmm::factory      | 9          | Pool key already registered                 | register_permission_pair_internal                                                                             |
| cetus_clmm::factory      | 10         | Pool key not registered                     | unregister_permission_pair_internal                                                                           |
| cetus_clmm::factory      | 11         | Cap already registered                      | mint_pool_creation_cap_by_admin，mint_pool_creation_cap                                                       |
| cetus_clmm::factory      | 12         | Coin type not allowed                       | create_pool_v2_                                                                                               |
| cetus_clmm::factory      | 13         | Cap not match with coin type                | unregister_permission_pair_internal，register_permission_pair_internal                                        |
| cetus_clmm::factory      | 14         | Coin already exists in list                 | add_denied_coin， add_allowed_list                                                                            |
| cetus_clmm::factory      | 15         | Coin not exists in list                     | remove_denied_list，remove_allowed_list                                                                       |
| cetus_clmm::factory      | 16         | Liquidity check failed                      | create_pool_v2_                                                                                               |
| cetus_clmm::factory      | 17         | Tick spacing not exists in fee tier         | add_allowed_pair_config                                                                                       |

