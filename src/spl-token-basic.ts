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

async function main() {

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    const senderSecretKey = process.env.SENDER_SECRET_KEY;
    const receiverPublicKeyStr  = process.env.RECEIVER_PUBLIC_KEY;

    if (!senderSecretKey || !receiverPublicKeyStr) {
        throw new Error(
            'Missing env vars: SENDER_SECRET_KEY and/or RECEIVER_PUBLIC_KEY'
        );
    }

    const payer = Keypair.fromSecretKey(bs58.decode(senderSecretKey));
    const receiverPubkey  = new PublicKey(receiverPublicKeyStr);

    console.log('Wallet A (payer) public key:', payer.publicKey.toBase58());
    console.log('Wallet B (receiver) public key:', receiverPubkey.toBase58());

    const balance = await connection.getBalance(payer.publicKey);
    console.log('Payer balance (lamports):', balance);

    const decimals = 9;
    const mint = await createMint(
        connection, 
        payer,
        payer.publicKey,
        null,
        decimals
    );

    console.log('Created new token mint:', mint.toBase58());

    const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        payer.publicKey
    );

    console.log('Sender Token Account:', senderTokenAccount.address.toBase58());

    const receiverTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        receiverPubkey
    );

    console.log('Receiver Token Account:', receiverTokenAccount.address.toBase58());

    const amountToMint = 10n * 10n ** BigInt(decimals); // 10 tokens

    const mintTxSignature = await mintTo(
        connection,
        payer,
        mint,
        senderTokenAccount.address,
        payer,
        amountToMint,
    );

    console.log('Minted Tokens Transaction Signature:', mintTxSignature);

    let senderAccountInfo = await getAccount(connection, senderTokenAccount.address);

    console.log('Sender Token Balance after minting:', senderAccountInfo.amount.toString());

    const amountToTransfer = 3n * 10n ** BigInt(decimals); // 3 tokens

    const transferTxSignature = await transfer(
        connection,
        payer,
        senderTokenAccount.address,
        receiverTokenAccount.address,
        payer,
        amountToTransfer
    );

    console.log('Transfer Tokens Transaction Signature:', transferTxSignature);

    senderAccountInfo = await getAccount(connection, senderTokenAccount.address);
    const receiverAccountInfo = await getAccount(connection, receiverTokenAccount.address);

    console.log('Sender final token balance:', senderAccountInfo.amount.toString());
    console.log('Receiver final token balance:', receiverAccountInfo.amount.toString());

}

main().catch((err) => {
    console.error(err);
});
    