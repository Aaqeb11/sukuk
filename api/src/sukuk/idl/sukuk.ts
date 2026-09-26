/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sukuk.json`.
 */
export type Sukuk = {
  "address": "E3qnd2CcmPqfk3BbTD5czpbGr3Bv7BMedriBcCT94pYu",
  "metadata": {
    "name": "sukuk",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "buybackAndBurn",
      "docs": [
        "Lessee buys back a slice of ownership from a holder; those units are burned.",
        "This is the Diminishing Musharaka mechanic — units_outstanding shrinks each period.",
        "",
        "PoC note: the holder signs to authorize the burn. In production the buyback is",
        "pre-agreed in the lease contract, so the holder would delegate burn authority to",
        "the PDA at mint time and the burn would run pro-rata across all holders."
      ],
      "discriminator": [
        121,
        156,
        154,
        165,
        194,
        86,
        180,
        130
      ],
      "accounts": [
        {
          "name": "sukukAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  107,
                  117,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "sukukAsset"
          ]
        },
        {
          "name": "holderTokenAccount",
          "writable": true
        },
        {
          "name": "holder",
          "docs": [
            "The investor selling units back. Must sign to authorize the burn."
          ],
          "signer": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "sukukAsset"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": "u64"
        },
        {
          "name": "units",
          "type": "u64"
        }
      ]
    },
    {
      "name": "distributeProfit",
      "docs": [
        "Distributes a period's rent pro-rata across current holders.",
        "",
        "`rent_collected` is supplied by the off-chain attestation source (mocked in the PoC).",
        "MUST be a pro-rata share of actual rent, never a fixed guaranteed return — a fixed",
        "return would make this interest-bearing debt and break Shariah compliance.",
        "",
        "Holders are passed via `remaining_accounts` as PAIRS, in order:",
        "[token_account_1, wallet_1, token_account_2, wallet_2, ...]",
        "Every wallet must be writable. PoC only: a small, known set of holders."
      ],
      "discriminator": [
        246,
        105,
        181,
        242,
        225,
        63,
        222,
        121
      ],
      "accounts": [
        {
          "name": "sukukAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  107,
                  117,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "distributor",
          "docs": [
            "Source of the rent being paid out — the lessee's collection wallet.",
            "Debited by the transfers below, so it must be writable."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "docs": [
            "Authorises the distribution. Checked against the recorded issuer by",
            "`has_one`. Deliberately NOT `mut`: this key lives in custody and has no",
            "way to be funded, so the runtime refusing to debit it is the guarantee",
            "rather than a convention we're trusting ourselves to keep."
          ],
          "signer": true,
          "relations": [
            "sukukAsset"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": "u64"
        },
        {
          "name": "rentCollected",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeSukuk",
      "docs": [
        "Creates the SukukAsset PDA and the SPL mint for ownership units.",
        "Runs once per asset. The off-chain eligibility engine must pass before this is called."
      ],
      "discriminator": [
        185,
        51,
        48,
        202,
        225,
        150,
        108,
        225
      ],
      "accounts": [
        {
          "name": "sukukAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  107,
                  117,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": "u64"
        },
        {
          "name": "totalUnits",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mintUnits",
      "docs": [
        "Mints fractional ownership units to an investor.",
        "The PDA is the mint authority, so minting can only happen through this instruction.",
        "TODO: enforce allowlist before minting."
      ],
      "discriminator": [
        112,
        201,
        206,
        52,
        134,
        199,
        1,
        246
      ],
      "accounts": [
        {
          "name": "sukukAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  107,
                  117,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "relations": [
            "sukukAsset"
          ]
        },
        {
          "name": "investorTokenAccount",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "sukukAsset"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeem",
      "docs": [
        "Closes the instrument once units_outstanding reaches zero.",
        "Triggered by state, not by choice — the issuer cannot close early."
      ],
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "sukukAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  107,
                  117,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "sukukAsset"
          ]
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "sukukAsset",
      "discriminator": [
        58,
        32,
        5,
        240,
        232,
        23,
        65,
        182
      ]
    }
  ],
  "events": [
    {
      "name": "profitDistributed",
      "discriminator": [
        157,
        165,
        3,
        217,
        231,
        113,
        50,
        80
      ]
    },
    {
      "name": "sukukRedeemed",
      "discriminator": [
        92,
        240,
        190,
        242,
        197,
        254,
        213,
        170
      ]
    },
    {
      "name": "unitsBoughtBack",
      "discriminator": [
        53,
        126,
        156,
        190,
        184,
        228,
        18,
        152
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidUnitCount",
      "msg": "Total units must be greater than zero"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "insufficientUnits",
      "msg": "Not enough unissued units remaining"
    },
    {
      "code": 6003,
      "name": "alreadyClosed",
      "msg": "This Sukuk is already closed"
    },
    {
      "code": 6004,
      "name": "unitsStillOutstanding",
      "msg": "Units still outstanding; cannot redeem yet"
    },
    {
      "code": 6005,
      "name": "noUnitsOutstanding",
      "msg": "No units outstanding to distribute to"
    },
    {
      "code": 6006,
      "name": "notAllowlisted",
      "msg": "Investor is not on the allowlist"
    },
    {
      "code": 6007,
      "name": "wrongMint",
      "msg": "Token account does not belong to this Sukuk's mint"
    },
    {
      "code": 6008,
      "name": "holderMismatch",
      "msg": "Token account owner does not match the wallet provided"
    },
    {
      "code": 6009,
      "name": "invalidHolderAccounts",
      "msg": "Holder accounts must be provided as [token_account, wallet] pairs"
    },
    {
      "code": 6010,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "profitDistributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": "u64"
          },
          {
            "name": "period",
            "type": "u32"
          },
          {
            "name": "rentCollected",
            "type": "u64"
          },
          {
            "name": "distributed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "sukukAsset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Issuer / mint authority. In production this key lives in an HSM."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "SPL mint for the ownership units."
            ],
            "type": "pubkey"
          },
          {
            "name": "assetId",
            "docs": [
              "Reference to the off-chain asset record."
            ],
            "type": "u64"
          },
          {
            "name": "totalUnits",
            "docs": [
              "Total units defined at issuance."
            ],
            "type": "u64"
          },
          {
            "name": "unitsIssued",
            "docs": [
              "Units minted to investors so far."
            ],
            "type": "u64"
          },
          {
            "name": "unitsOutstanding",
            "docs": [
              "Units still held by investors. Shrinks on buyback."
            ],
            "type": "u64"
          },
          {
            "name": "periodsElapsed",
            "docs": [
              "Number of distribution periods completed."
            ],
            "type": "u32"
          },
          {
            "name": "totalDistributed",
            "docs": [
              "Cumulative rent distributed, for reporting."
            ],
            "type": "u64"
          },
          {
            "name": "isClosed",
            "docs": [
              "Set true by `redeem`."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "sukukRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": "u64"
          },
          {
            "name": "periodsElapsed",
            "type": "u32"
          },
          {
            "name": "totalDistributed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "unitsBoughtBack",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": "u64"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "unitsOutstanding",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
