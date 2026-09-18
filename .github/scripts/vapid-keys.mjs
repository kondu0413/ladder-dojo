// VAPID の鍵を 1 組作る(S-045)。CI が初回だけ実行し、Worker のシークレットに登録する。
// 公開鍵は 65 バイトの生の点(0x04 + x + y)、秘密鍵は 32 バイトのスカラー。どちらも base64url
const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const jwk = await subtle.exportKey("jwk", pair.privateKey);
const b64 = (s) => Buffer.from(s, "base64url");
const publicKey = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString("base64url");
process.stdout.write(JSON.stringify({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d }));
