import {
    Connection,
    Keypair,
    PublicKey,
    VersionedTransaction,
} from '@solana/web3.js';
import axios from 'axios';
import * as fs from 'fs';

/**
 * X402Client: A high-level, agent-friendly client for the X402 ecosystem.
 * 
 * Simple is Best: 
 * const result = await client.buy("https://api.aethervane.me/api/fortune", { query_type: "daily" });
 */
export class X402Client {
    private connection: Connection;
    private payer: Keypair;
    private defaultFacilitator: string;

    /**
     * @param rpcUrl Solana RPC URL (Devnet)
     * @param keypairPath Path to your buyer-keypair.json
     * @param defaultFacilitator Hardcoded fallback for pr402 Facilitator
     */
    constructor(rpcUrl: string, keypairPath: string, defaultFacilitator: string) {
        this.connection = new Connection(rpcUrl, 'confirmed');
        const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
        this.payer = Keypair.fromSecretKey(secretKey);
        this.defaultFacilitator = defaultFacilitator;
    }

    /**
     * The primary entry point. Hits a URL, handles 402, settles payment, and retries.
     */
    async buy<T>(url: string, body: any, method: 'GET' | 'POST' = 'POST'): Promise<T> {
        console.log(`\x1b[36m[X402] Attempting to access: ${url}\x1b[0m`);

        try {
            const reqMethod = method.toUpperCase() as 'GET' | 'POST';

            // 1. Initial Attempt
            const res =
                reqMethod === 'GET'
                    ? await axios.get(url, {
                          ...(body && Object.keys(body).length > 0 ? { params: body } : {}),
                          validateStatus: (status) => status === 200 || status === 402,
                          headers: { 'Content-Type': 'application/json' },
                      })
                    : await axios.post(url, body, {
                          validateStatus: (status) => status === 200 || status === 402,
                          headers: { 'Content-Type': 'application/json' },
                      });

            if (res.status === 200) {
                return res.data;
            }

            // 2. Handle 402 Payment Required
            console.log("\x1b[33m[X402] Received 402 Challenge. Settling payment...\x1b[0m");
            const rawHdr = res.headers['payment-required'] as string;
            if (!rawHdr) {
                throw new Error("402 Error: Missing 'Payment-Required' header.");
            }

            // Flaw Discovery Path: As a buyer, I noticed it's not documented that I must decode this!
            const requirements = JSON.parse(Buffer.from(rawHdr, 'base64').toString());
            
            // Choose the first available "exact" scheme
            const accepted = requirements.accepts.find((a: any) => 
                a.scheme === 'exact' || a.scheme === 'v2:solana:exact'
            );

            if (!accepted) {
                throw new Error("No supported 'exact' payment schemes found in challenge.");
            }

            // 3. Negotiate with Facilitator
            const facilitatorUrl = (accepted.extra?.capabilitiesUrl || this.defaultFacilitator)
                .replace(/\/api\/v1\/facilitator\/capabilities$/, '');

            const buildTxRes = await axios.post(`${facilitatorUrl}/api/v1/facilitator/build-exact-payment-tx`, {
                payer: this.payer.publicKey.toBase58(),
                accepted: accepted,
                resource: requirements.resource,
                buyerPaysTransactionFees: true
            });

            const buildData = buildTxRes.data;

            // 4. Cryptographic Local Signing
            console.log("\x1b[33m[X402] signing transaction locally...\x1b[0m");
            const txBytes = Buffer.from(buildData.transaction, 'base64');
            const vtx = VersionedTransaction.deserialize(txBytes);
            vtx.sign([this.payer]);

            // 5. Repackage and Finalize
            const signedTxBase64 = Buffer.from(vtx.serialize()).toString('base64');
            const verifyBody = buildData.verifyBodyTemplate;
            verifyBody.paymentPayload.payload.transaction = signedTxBase64;

            // RESOLVED: "Double Base64 Paradox"
            // We use raw JSON string here. X402 servers (pr402-client) support both raw JSON 
            // and Base64-encoded JSON. Raw JSON is ~33% smaller and easier for agents to debug.
            const finalProof = JSON.stringify(verifyBody);

            // 6. Authorized Retry
            console.log("\x1b[33m[X402] Final submission with payment proof (Raw JSON)...\x1b[0m");
            const finalRes =
                reqMethod === 'GET'
                    ? await axios.get(url, {
                          ...(body && Object.keys(body).length > 0 ? { params: body } : {}),
                          headers: {
                              'Content-Type': 'application/json',
                              'X-PAYMENT': finalProof,
                          },
                      })
                    : await axios.post(url, body, {
                          headers: {
                              'Content-Type': 'application/json',
                              'X-PAYMENT': finalProof,
                          },
                      });

            return finalRes.data;

        } catch (error: any) {
            console.error(`\x1b[31m[X402] Error: ${error.message}\x1b[0m`);
            if (error.response) {
                console.error(`\x1b[31mDetail: ${JSON.stringify(error.response.data)}\x1b[0m`);
            }
            throw error;
        }
    }
}
