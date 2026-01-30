import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

const TOKEN_INSTRUCTION_INITIALIZE_MINT = 0;
const TOKEN_INSTRUCTION_INITIALIZE_ACCOUNT = 1;
const TOKEN_INSTRUCTION_TRANSFER = 3;
const TOKEN_INSTRUCTION_MINT_TO = 7;

const SYSVAR_RENT_PUBKEY = new PublicKey(
  'SysvarRent111111111111111111111111111111111'
);

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const senderSecretKey = process.env.SENDER_SECRET_KEY;
  const receiverPublicKeyStr = process.env.RECEIVER_PUBLIC_KEY;

  if (!senderSecretKey || !receiverPublicKeyStr) {
    throw new Error(
      'Missing env vars: SENDER_SECRET_KEY and/or RECEIVER_PUBLIC_KEY'
    );
  }

  const payer = Keypair.fromSecretKey(bs58.decode(senderSecretKey));
  const receiverPubkey = new PublicKey(receiverPublicKeyStr);

  console.log('Wallet A (payer/mint authority):', payer.publicKey.toBase58());
  console.log('Wallet B (receiver owner):', receiverPubkey.toBase58());

  const payerBalance = await connection.getBalance(payer.publicKey);
  console.log('Payer balance (lamports):', payerBalance);

  const mint = Keypair.generate();
  const tokenAccountA = Keypair.generate();
  const tokenAccountB = Keypair.generate();

  console.log('Mint account pubkey:', mint.publicKey.toBase58());
  console.log('Token account A pubkey:', tokenAccountA.publicKey.toBase58());
  console.log('Token account B pubkey:', tokenAccountB.publicKey.toBase58());

  function createAccountInstruction(
    fromPubkey: PublicKey,
    newAccountPubkey: PublicKey,
    lamports: number | bigint,
    space: number | bigint,
    owner: PublicKey
  ): TransactionInstruction {
    const CREATE_ACCOUNT_INDEX = 0;
    const data = Buffer.alloc(4 + 8 + 8 + 32);

    let offset = 0;
    data.writeUInt32LE(CREATE_ACCOUNT_INDEX, offset); offset += 4;
    (data as any).writeBigUInt64LE(BigInt(lamports), offset); offset += 8;
    (data as any).writeBigUInt64LE(BigInt(space), offset); offset += 8;
    owner.toBuffer().copy(data, offset); offset += 32;

    return new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        {
          pubkey: fromPubkey,
          isSigner: true,
          isWritable: true,
        },
        {
          pubkey: newAccountPubkey,
          isSigner: true,
          isWritable: true,
        },
      ],
      data,
    });
  }

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
        {
          pubkey: mintPubkey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: SYSVAR_RENT_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
      ],
      data,
    });
  }

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
        {
          pubkey: tokenAccountPubkey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: mintPubkey,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: ownerPubkey,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: SYSVAR_RENT_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
      ],
      data,
    });
  }

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
        {
          pubkey: mintPubkey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: destTokenAccountPubkey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: mintAuthorityPubkey,
          isSigner: true,
          isWritable: false,
        },
      ],
      data,
    });
  }

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
        {
          pubkey: sourceTokenAccountPubkey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: destTokenAccountPubkey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: ownerPubkey,
          isSigner: true,
          isWritable: false,
        },
      ],
      data,
    });
  }

  const transaction = new Transaction();

  const decimals = 9;

  const mintRent = await connection.getMinimumBalanceForRentExemption(82);
  const createMintAccountIx = createAccountInstruction(
    payer.publicKey,
    mint.publicKey,
    mintRent,
    82,
    TOKEN_PROGRAM_ID
  );

  const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);
  const createTokenAccountAIx = createAccountInstruction(
    payer.publicKey,
    tokenAccountA.publicKey,
    tokenAccountRent,
    165,
    TOKEN_PROGRAM_ID
  );

  const createTokenAccountBIx = createAccountInstruction(
    payer.publicKey,
    tokenAccountB.publicKey,
    tokenAccountRent,
    165,
    TOKEN_PROGRAM_ID
  );

  const initMintIx = createInitializeMintInstruction(
    mint.publicKey,
    decimals,
    payer.publicKey,
    null
  );

  const initAccountAIx = createInitializeAccountInstruction(
    tokenAccountA.publicKey,
    mint.publicKey,
    payer.publicKey
  );

  const initAccountBIx = createInitializeAccountInstruction(
    tokenAccountB.publicKey,
    mint.publicKey,
    receiverPubkey
  );

  const amountToMint = 10n * 10n ** BigInt(decimals);
  const mintToIx = createMintToInstruction(
    mint.publicKey,
    tokenAccountA.publicKey,
    payer.publicKey,
    amountToMint
  );

  const amountToTransfer = 3n * 10n ** BigInt(decimals);
  const transferIx = createTransferInstruction(
    tokenAccountA.publicKey,
    tokenAccountB.publicKey,
    payer.publicKey,
    amountToTransfer
  );

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

  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  console.log('Recent blockhash:', latestBlockhash.blockhash);

  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.feePayer = payer.publicKey;

  transaction.sign(payer, mint, tokenAccountA, tokenAccountB);

  const rawTx = transaction.serialize();

  try {
    const txSignature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
    });
    console.log('Submitted transaction signature:', txSignature);

    const confirmation = await connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed'
    );

    console.log('Confirmation:', confirmation);
    console.log(
      `Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
    );
    console.log('Mint:', mint.publicKey.toBase58());
    console.log('Token account A:', tokenAccountA.publicKey.toBase58());
    console.log('Token account B:', tokenAccountB.publicKey.toBase58());
  } catch (e: any) {
    console.error('SendTransactionError:', e);
    if (e.getLogs) {
      console.log('Logs:', await e.getLogs(connection));
    } else if (e.transactionLogs) {
      console.log('Logs:', e.transactionLogs);
    }
  }
}

main().catch(console.error);