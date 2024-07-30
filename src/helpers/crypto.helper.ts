import { crypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";

export async function sha256(data: string): Promise<string> {
    return encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
}

