const encode = new TextEncoder();

async function keyFor(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encode.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signature(secret: string, scope: string, timestamp: string, body: string) {
  const bytes = await crypto.subtle.sign(
    "HMAC",
    await keyFor(secret),
    encode.encode(scope + "\n" + timestamp + "\n" + body),
  );
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validSignature(
  secret: string,
  scope: string,
  timestamp: string | null,
  body: string,
  mac: string | null,
) {
  if (
    !timestamp ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 300_000
  )
    return false;
  if (!mac || !/^[a-f0-9]{64}$/.test(mac)) return false;
  const bytes = Uint8Array.from(mac.match(/../g)!, (byte) => parseInt(byte, 16));
  return crypto.subtle.verify(
    "HMAC",
    await keyFor(secret),
    bytes,
    encode.encode(scope + "\n" + timestamp + "\n" + body),
  );
}
