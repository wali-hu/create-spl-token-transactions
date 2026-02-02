import { createInitializeMintInstruction, MintCloseAuthorityLayout } from '@solana/spl-token';
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN_PROGRAM_ID = new PublicKey(
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
);

const TOKEN_INSTRUCTION_INITIALIZE_MINT = 0;

const SYSVAR_RENT_PUBKEY = new PublicKey(
    'SysvarRent111111111111111111111111111111111'
);

async function main() {

    const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl,'confirmed');

    const senderSecretKey = process.env.SENDER_SECRET_KEY;
    if(!senderSecretKey){
        throw new Error('Missing env var: SENDER_SECRET_KEY');
    }

    const payer = Keypair.fromSecretKey(bs58.decode(senderSecretKey));
    console.log('Payer (mint authority):', payer.publicKey.toBase58());

    const mint = Keypair.generate();
    console.log('New Mint Public Key', mint.publicKey.toBase58());

    function createAccountInstruction(
        fromPubkey: PublicKey,
        newAccountPubkey: PublicKey,
        lamports: number | bigint,
        space: number | bigint,
        owner: PublicKey,
    ): TransactionInstruction {
        const CREATE_ACCOUNT_INDEX = 0;
        const data = Buffer.alloc(4 + 8 + 8 + 32);

        let offset = 0;

        data.writeUInt32LE(CREATE_ACCOUNT_INDEX, offset);
        offset += 4;

        (data as any).writeBigUInt64LE(BigInt(lamports), offset);
        offset += 8;

        (data as any).writeBigUInt64LE(BigInt(space), offset);
        offset += 8;

        owner.toBuffer().copy(data, offset);
        offset += 32

        return new TransactionInstruction({
            programId: SystemProgram.programId,
            keys: [
                {pubkey: fromPubkey, isSigner: true, isWritable: true},
                {pubkey: newAccountPubkey, isSigner: true, isWritable: true},
            ],
            data,
        });

    }

    function createInitializeMintInstruction(
        mintPubkey: PublicKey,
        decimals: number,
        mintAuthority: PublicKey,
        freezeAuthority: PublicKey | null,
    ): TransactionInstruction {
        const freezeAuthOption = freezeAuthority ? 1 : 0;
        const datalength = freezeAuthority ? 1 + 1 + 32 + 1 + 32 : 1 + 1 + 32 + 1;
        const data = Buffer.alloc(datalength);

        let offset = 0; 

        data.writeUInt8(TOKEN_INSTRUCTION_INITIALIZE_MINT, offset); 
        offset += 1;

        data.writeUInt8(decimals, offset); 
        offset += 1;

        mintAuthority.toBuffer().copy(data, offset); 
        offset += 32;

        data.writeUInt8(freezeAuthOption, offset); 
        offset += 1;

        if (freezeAuthority) {
            freezeAuthority.toBuffer().copy(data, offset); offset += 32;
        }

        return new TransactionInstruction({
            programId: TOKEN_PROGRAM_ID,
            keys: [
                { pubkey: mintPubkey,         isSigner: false, isWritable: true },
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
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

    const initMintIx = createInitializeMintInstruction(
        mint.publicKey,
        decimals,
        payer.publicKey,
        null
    );

    transaction.add(
        createMintAccountIx,
        initMintIx,
    );

    const lastestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = lastestBlockhash.blockhash;
    transaction.feePayer = payer.publicKey;

    transaction.sign(payer, mint);

    const rawTx = transaction.serialize();

    try {
        const txSignature = await connection.sendRawTransaction(rawTx, {
            skipPreflight: false,
        });
        console.log('Submitted mint-creation tx signature:', txSignature);

        const confirmation = await connection.confirmTransaction({
            signature: txSignature,
            blockhash: lastestBlockhash.blockhash,
            lastValidBlockHeight: lastestBlockhash.lastValidBlockHeight
        });

        console.log('Confirmation:', confirmation);
        console.log(`Explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
        console.log('Mint created and saved to this address: ', '    ', mint.publicKey.toBase58());    
    
    } catch (e: any) {
        console.error('Send Transaction Error:', e);
        if(e.getLogs) {
            console.log('Transaction logs:', await e.getLogs(connection));
        } else if (e.transactionLogs) {
            console.log('Transaction logs:', e.transactionLogs);
        }
    }
}

main().catch(console.error);