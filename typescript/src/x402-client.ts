import { Keypair } from '@solana/web3.js';
import axios from 'axios';
import * as fs from 'fs';
import { buildExactPaymentProofJsonString } from './pr402-exact-flow';

/**
 * X402Client: high-level buyer for x402 v2 resources that settle via pr402 `exact` rail.
 *
 * Prefer {@link createPay402Fetch} when you already use `fetch` and want a single wrapper.
 */
export class X402Client {
    private payer: Keypair;
    private defaultFacilitator: string;

    /**
     * @param _rpcUrl Reserved for future RPC / balance helpers (optional).
     * @param keypairPath Path to `buyer-keypair.json`
     * @param defaultFacilitatorBaseUrl pr402 origin, e.g. `https://preview.agent.pay402.me`
     */
    constructor(_rpcUrl: string, keypairPath: string, defaultFacilitatorBaseUrl: string) {
        const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
        this.payer = Keypair.fromSecretKey(secretKey);
        this.defaultFacilitator = defaultFacilitatorBaseUrl.replace(/\/$/, '');
    }

    /** Keypair used for signing payment transactions (same as `createPay402Fetch` `payer`). */
    getPayer(): Keypair {
        return this.payer;
    }

    /**
     * Hit a URL, handle 402 via pr402 `build-exact-payment-tx`, sign, retry with `PAYMENT-SIGNATURE`.
     */
    async buy<T>(url: string, body: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
        console.log(`\x1b[36m[X402] Attempting to access: ${url}\x1b[0m`);

        try {
            const reqMethod = method.toUpperCase() as 'GET' | 'POST';

            const res =
                reqMethod === 'GET'
                    ? await axios.get(url, {
                          ...(body &&
                          typeof body === 'object' &&
                          body !== null &&
                          Object.keys(body as object).length > 0
                              ? { params: body }
                              : {}),
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

            console.log('\x1b[33m[X402] Received 402 Challenge. Settling payment...\x1b[0m');
            const rawHdr = res.headers['payment-required'] as string;
            if (!rawHdr) {
                throw new Error("402 Error: Missing 'Payment-Required' header.");
            }

            const requirements = JSON.parse(Buffer.from(rawHdr, 'base64').toString());

            console.log('\x1b[33m[X402] signing transaction locally...\x1b[0m');
            const finalProof = await buildExactPaymentProofJsonString({
                payer: this.payer,
                requirements,
                defaultFacilitatorBaseUrl: this.defaultFacilitator,
            });

            console.log(
                '\x1b[33m[X402] Final submission with payment proof (Raw JSON)...\x1b[0m',
            );
            const finalRes =
                reqMethod === 'GET'
                    ? await axios.get(url, {
                          ...(body &&
                          typeof body === 'object' &&
                          body !== null &&
                          Object.keys(body as object).length > 0
                              ? { params: body }
                              : {}),
                          headers: {
                              'Content-Type': 'application/json',
                              'PAYMENT-SIGNATURE': finalProof,
                          },
                      })
                    : await axios.post(url, body, {
                          headers: {
                              'Content-Type': 'application/json',
                              'PAYMENT-SIGNATURE': finalProof,
                          },
                      });

            return finalRes.data;
        } catch (error: unknown) {
            const err = error as { message?: string; response?: { data?: unknown } };
            console.error(`\x1b[31m[X402] Error: ${err.message}\x1b[0m`);
            if (err.response) {
                console.error(`\x1b[31mDetail: ${JSON.stringify(err.response.data)}\x1b[0m`);
            }
            throw error;
        }
    }
}
