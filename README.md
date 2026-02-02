# Create SPL Token Transactions

A comprehensive project demonstrating how to create and manage SPL tokens on the Solana blockchain. This repository includes both high-level helper-based implementations and low-level manual instruction encoding, helps to understand the complete workflow of token creation, minting, and transfers.

## Project Overview

This project teaches how to work with Solana SPL tokens from the ground up. It provides two different implementations:

1. **Helper-based approach** - Using the `@solana/spl-token` library for simplified token operations
2. **Manual low-level approach** - Direct binary instruction encoding for deep understanding of the Solana runtime

### What You'll Learn

- Creating an SPL mint account
- Initializing token accounts for multiple wallets
- Minting tokens to an account
- Transferring tokens between wallets
- Understanding opcodes, instruction encoding, and system variables
- Building and signing multi-instruction transactions

### Wallet Configuration

**Wallet A (Sender / Mint Authority)**
- Public Key: `8oqK9tb7QREwG9w3JRZuvWvaS9K7YBtyY2eeCBVEQXmV`
- Secret Key: Store in `.env` as `SENDER_SECRET_KEY`

**Wallet B (Receiver)**
- Public Key: `4hzk4sSocyaN9wN8vmZsceby5CGhH363szdq1LNEfmVH`
- Public Key: Store in `.env` as `RECEIVER_PUBLIC_KEY`

### Network Configuration

Configure your RPC endpoint in `.env`:
- Recommended: `RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- Fallback: `RPC_URL=https://api.devnet.solana.com`

## Helper-Based Approach: `src/spl-token-basic.ts`

This file uses the `@solana/spl-token` library to simplify SPL token operations. It provides a high-level interface for common tasks.

### Supported Operations

- `createMint` - Create a new token mint
- `getOrCreateAssociatedTokenAccount` - Get or create an ATA for a wallet
- `mintTo` - Mint tokens to an account
- `transfer` - Transfer tokens between accounts
- `getAccount` - Query token account details

### Workflow

**1. Setup Connection and Wallets**

```typescript
const connection = new Connection(process.env.RPC_URL, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(process.env.SENDER_SECRET_KEY!));
const receiverPubkey = new PublicKey(process.env.RECEIVER_PUBLIC_KEY!);
```

**2. Create a Mint**

```typescript
const mint = await createMint(
  connection,
  payer,            // Fee payer and mint authority
  payer.publicKey,  // Mint authority
  null,             // Freeze authority (optional)
  decimals
);
```

The library internally calls `SystemProgram.createAccount` to allocate space for the mint account, then sends the `InitializeMint` instruction to the SPL Token program.

**3. Create Associated Token Accounts**

```typescript
const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  mint,
  payer.publicKey
);

const receiverTokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  mint,
  receiverPubkey
);
```

The ATA (Associated Token Account) address is deterministically derived from the wallet address and mint. If the account doesn't exist, it will be created with an `InitializeAccount` instruction.

**4. Mint Tokens**

```typescript
await mintTo(
  connection,
  payer,
  mint,
  senderTokenAccount.address,
  payer,
  amountToMint
);
```

**5. Transfer Tokens**

```typescript
await transfer(
  connection,
  payer,
  senderTokenAccount.address,
  receiverTokenAccount.address,
  payer,
  amountToTransfer
);
```

## Manual Low-Level Approach: `src/spl-token-manual.ts`

This file implements token operations by manually encoding instructions at the binary level. This approach shows exactly how transactions work under the hood without using helper libraries.

### Program Constants and Opcodes

```typescript
const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

const SYSVAR_RENT_PUBKEY = new PublicKey(
  'SysvarRent111111111111111111111111111111111'
);

// SPL Token instruction opcodes
const TOKEN_INSTRUCTION_INITIALIZE_MINT = 0;
const TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT = 1;
const TOKEN_INSTRUCTION_TRANSFER = 3;
const TOKEN_INSTRUCTION_MINT_TO = 7;
```

### Key Concepts

**Offset**

The offset variable tracks the current write position in a buffer. After writing each field, you increment offset by the field size to ensure data is written at the correct position.

```typescript
let offset = 0;
data.writeUInt8(opcode, offset);     // Write at position 0
offset += 1;                          // Move to position 1
data.writeBigUInt64LE(amount, offset);// Write at position 1
offset += 8;                          // Move to position 9
```

**Opcodes**

Each instruction is identified by an opcode (a single byte). The on-chain program reads this first byte to determine which handler to execute.

**System Rent Variable**

The `SYSVAR_RENT_PUBKEY` is a special on-chain account containing rent configuration. Programs use this to verify that accounts are properly funded and rent-exempt.

### Instruction Implementation

**InitializeMint**

```typescript
function createInitializeMintInstruction(
  mintPubkey: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null
): TransactionInstruction {
  const freezeAuthOption = freezeAuthority ? 1 : 0;
  const dataLength = freezeAuthority ? 1 + 1 + 32 + 1 + 32 : 1 + 1 + 32 + 1;
  const data = Buffer.alloc(dataLength);

  let offset = 0;
  data.writeUInt8(TOKEN_INSTRUCTION_INITIALIZE_MINT, offset); offset += 1;
  data.writeUInt8(decimals, offset); offset += 1;
  mintAuthority.toBuffer().copy(data, offset); offset += 32;
  data.writeUInt8(freezeAuthOption, offset); offset += 1;
  if (freezeAuthority) {
    freezeAuthority.toBuffer().copy(data, offset); offset += 32;
  }

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mintPubkey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}
```

Data layout: `[opcode][decimals][mintAuthority(32 bytes)][freezeAuthOption][freezeAuthority(32 bytes, optional)]`

**InitializeAccount**

```typescript
function createInitializeAccountInstruction(
  tokenAccountPubkey: PublicKey,
  mintPubkey: PublicKey,
  ownerPubkey: PublicKey
): TransactionInstruction {
  const data = Buffer.alloc(1);
  data.writeUInt8(TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT, 0);

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: tokenAccountPubkey, isSigner: false, isWritable: true },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: ownerPubkey, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}
```

**MintTo**

```typescript
function createMintToInstruction(
  mintPubkey: PublicKey,
  destTokenAccountPubkey: PublicKey,
  mintAuthorityPubkey: PublicKey,
  amount: bigint
): TransactionInstruction {
  const data = Buffer.alloc(1 + 8);
  let offset = 0;
  data.writeUInt8(TOKEN_INSTRUCTION_MINT_TO, offset); offset += 1;
  (data as any).writeBigUInt64LE(amount, offset); offset += 8;

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mintPubkey, isSigner: false, isWritable: true },
      { pubkey: destTokenAccountPubkey, isSigner: false, isWritable: true },
      { pubkey: mintAuthorityPubkey, isSigner: true, isWritable: false },
    ],
    data,
  });
}
```

Data layout: `[opcode][amount(8 bytes)]`

**Transfer**

```typescript
function createTransferInstruction(
  sourceTokenAccountPubkey: PublicKey,
  destTokenAccountPubkey: PublicKey,
  ownerPubkey: PublicKey,
  amount: bigint
): TransactionInstruction {
  const data = Buffer.alloc(1 + 8);
  let offset = 0;
  data.writeUInt8(TOKEN_INSTRUCTION_TRANSFER, offset); offset += 1;
  (data as any).writeBigUInt64LE(amount, offset); offset += 8;

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceTokenAccountPubkey, isSigner: false, isWritable: true },
      { pubkey: destTokenAccountPubkey, isSigner: false, isWritable: true },
      { pubkey: ownerPubkey, isSigner: true, isWritable: false },
    ],
    data,
  });
}
```

Data layout: `[opcode][amount(8 bytes)]`

### Building a Multi-Instruction Transaction

```typescript
const transaction = new Transaction();

// Get rent for mint and token accounts
const mintRent = await connection.getMinimumBalanceForRentExemption(82);
const tokenRent = await connection.getMinimumBalanceForRentExemption(165);

// Create account instructions
const createMintAccountIx = createAccountInstruction(
  payer.publicKey, mint.publicKey, mintRent, 82, TOKEN_PROGRAM_ID
);

const createTokenAccountAIx = createAccountInstruction(
  payer.publicKey, tokenAccountA.publicKey, tokenRent, 165, TOKEN_PROGRAM_ID
);

const createTokenAccountBIx = createAccountInstruction(
  payer.publicKey, tokenAccountB.publicKey, tokenRent, 165, TOKEN_PROGRAM_ID
);

// Initialize accounts
const initMintIx = createInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey, null);
const initAccountAIx = createInitializeAccountInstruction(tokenAccountA.publicKey, mint.publicKey, payer.publicKey);
const initAccountBIx = createInitializeAccountInstruction(tokenAccountB.publicKey, mint.publicKey, receiverPubkey);

// Mint and transfer
const amountToMint = 10n * 10n ** BigInt(decimals);
const amountToTransfer = 3n * 10n ** BigInt(decimals);

const mintToIx = createMintToInstruction(mint.publicKey, tokenAccountA.publicKey, payer.publicKey, amountToMint);
const transferIx = createTransferInstruction(tokenAccountA.publicKey, tokenAccountB.publicKey, payer.publicKey, amountToTransfer);

// Add all instructions to transaction
transaction.add(
  createMintAccountIx,
  createTokenAccountAIx,
  createTokenAccountBIx,
  initMintIx,
  initAccountAIx,
  initAccountBIx,
  mintToIx,
  transferIx
);

// Sign and send
const latestBlockhash = await connection.getLatestBlockhash('confirmed');
transaction.recentBlockhash = latestBlockhash.blockhash;
transaction.feePayer = payer.publicKey;

transaction.sign(payer, mint, tokenAccountA, tokenAccountB);

const rawTx = transaction.serialize();
await connection.sendRawTransaction(rawTx, { skipPreflight: false });
```

### Why This Matters

All instructions in a single transaction are atomic - either all succeed together or all fail. If `MintTo` fails, the `Transfer` won't execute, and all state changes are rolled back as if nothing happened.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- A Solana devnet wallet with some SOL for testing

### Installation

```bash
npm install
```

### Setup Environment

Create a `.env` file in the project root:

```env
SENDER_SECRET_KEY=your_base58_encoded_secret_key
RECEIVER_PUBLIC_KEY=4hzk4sSocyaN9wN8vmZsceby5CGhH363szdq1LNEfmVH
RPC_URL=https://devnet.helius-rpc.com/?api-key=your_api_key
```

### Running the Examples

To run the helper-based implementation:

```bash
npx ts-node src/spl-token-basic.ts
```

To run the manual low-level implementation:

```bash
npx ts-node src/spl-token-manual.ts
```

## Project Structure

```
create-spl-token-transactions/
├── src/
│   ├── spl-token-basic.ts     # Helper-based implementation
│   ├── spl-token-manual.ts    # Manual low-level implementation
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Understanding the Flow

1. **Account Creation** - Allocate space for mint and token accounts
2. **Initialization** - Setup mint parameters and token account state
3. **Minting** - Create new tokens and assign them to the sender
4. **Transfer** - Move tokens from sender to receiver
5. **Verification** - Check balances and transaction details

## Key Takeaways

- Both implementations achieve the same result through different methods
- The helper-based approach is simpler and less error-prone for production use
- The manual approach reveals how Solana transactions work at the binary level
- Understanding opcodes and instruction encoding is crucial for advanced Solana development
- Multi-instruction transactions are atomic - all succeed or all fail together