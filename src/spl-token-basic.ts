import {
    Connection,
    Keypair,
    PublicKey,
    clusterApiUrl,
} from '@solana/web3.js';
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    transfer,
    getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';
dotenv.config();