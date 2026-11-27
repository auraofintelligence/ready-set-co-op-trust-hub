import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64 = value => Buffer.from(value).toString('base64url');
const hash = value => createHash('sha256').update(value).digest();
function counterBytes(value) { const result = Buffer.alloc(4); result.writeUInt32BE(value); return result; }

// A software authenticator for tests. Production always uses the browser and real
// SimpleWebAuthn verification; no verification or identity injection is exposed.
export function createTestPasskey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialBytes = randomBytes(32);
  const credentialId = b64(credentialBytes);
  const cose = isoCBOR.encode(new Map([
    [1, 2], [3, -7], [-1, 1],
    [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
  ]));
  let sequence = 0;
  return {
    credentialId,
    registration(options, { origin, flags = 0x45, challenge = options.challenge, rpID = options.rp.id } = {}) {
      const length = Buffer.alloc(2); length.writeUInt16BE(credentialBytes.length);
      const authData = Buffer.concat([hash(rpID), Buffer.from([flags]), counterBytes(0), Buffer.alloc(16), length, credentialBytes, Buffer.from(cose)]);
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
      const attestation = isoCBOR.encode(new Map([['fmt', 'none'], ['authData', new Uint8Array(authData)], ['attStmt', new Map()]]));
      return { id: credentialId, rawId: credentialId, type: 'public-key',
        response: { clientDataJSON: b64(clientData), attestationObject: b64(attestation), transports: ['internal'] },
        clientExtensionResults: {}, authenticatorAttachment: 'platform' };
    },
    authentication(options, { origin, accountId, flags = 0x05, counter = ++sequence, challenge = options.challenge, rpID = options.rpId } = {}) {
      const authData = Buffer.concat([hash(rpID), Buffer.from([flags]), counterBytes(counter)]);
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const signature = sign('sha256', Buffer.concat([authData, hash(clientData)]), privateKey);
      return { id: credentialId, rawId: credentialId, type: 'public-key',
        response: { clientDataJSON: b64(clientData), authenticatorData: b64(authData), signature: b64(signature),
          ...(accountId ? { userHandle: b64(accountId) } : {}) },
        clientExtensionResults: {}, authenticatorAttachment: 'platform' };
    },
  };
}
