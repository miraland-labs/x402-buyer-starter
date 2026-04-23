const { Keypair, VersionedTransaction } = require('@solana/web3.js');
const fs = require('fs');

/**
 * Tiny helper to sign a Base64-encoded VersionedTransaction.
 * Usage: node sign.js <keypair_path> <base64_tx>
 *
 * Note: On Node 22+, you may see DEP0040 (punycode) from transitive dependencies
 * of @solana/web3.js. It is harmless. The bash demos call:
 *   node --no-deprecation sign.js ...
 * to keep logs clean for new agents.
 */

const keypairPath = process.argv[2];
const base64Tx = process.argv[3];

if (!keypairPath || !base64Tx) {
    console.error("Usage: node sign.js <keypair_path> <base64_tx>");
    process.exit(1);
}

const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
const keypair = Keypair.fromSecretKey(secretKey);

const txBytes = Buffer.from(base64Tx, 'base64');
const tx = VersionedTransaction.deserialize(txBytes);

tx.sign([keypair]);

console.log(Buffer.from(tx.serialize()).toString('base64'));
