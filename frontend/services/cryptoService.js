// --- Configuration ---
const IDENTITY_KEY_ALGO = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const SECTOR_KEY_ALGO = { name: 'AES-GCM', length: 256 };
const STORAGE_KEY = 'sectornet_keystore';

// --- Key Storage ---
// This is our in-memory keystore.
// We use Maps for easy lookups.
let identityKeys = null; // { publicKey: CryptoKey, privateKey: CryptoKey }
let sectorKeys = new Map(); // Map<sectorId: string, Map<epochId: number, sectorKey: CryptoKey>>

// --- Helper Functions ---
// These are utility functions for converting between formats.
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return window.btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// --- Core Service Object ---
const cryptoService = {

  // --- Identity Key Management ---

  /**
   * Generates a new RSA key pair for the user's identity.
   */
  generateIdentityKeys: async () => {
    return await window.crypto.subtle.generateKey(
      IDENTITY_KEY_ALGO,
      true, // is extractable
      ['wrapKey', 'unwrapKey']
    );
  },

  /**
   * Exports a CryptoKey to its raw format for storage or transmission.
   * @param {CryptoKey} key The key to export.
   * @returns {Promise<JsonWebKey>} The key as a JWK object.
   */
  exportKeyJwk: async (key) => {
    return await window.crypto.subtle.exportKey('jwk', key);
  },

  /**
   * Imports a raw JWK back into a CryptoKey object.
   * @param {JsonWebKey} jwk The key data.
   * @param {'public'|'private'} type The type of key being imported.
   * @returns {Promise<CryptoKey>} The imported key.
   */
  importKeyJwk: async (jwk, type) => {
    const usage = type === 'public' ? ['wrapKey'] : ['unwrapKey'];
    return await window.crypto.subtle.importKey('jwk', jwk, IDENTITY_KEY_ALGO, true, usage);
  },

  // --- Sector Key Management ---
  
  generateSectorKey: async () => {
    return await window.crypto.subtle.generateKey(SECTOR_KEY_ALGO, true, ['encrypt', 'decrypt']);
  },

  /**
   * Securely wraps a sector key using a user's public identity key.
   * @param {CryptoKey} sectorKey The symmetric sector key to wrap.
   * @param {CryptoKey} userPublicKey The user's public RSA key.
   * @returns {Promise<ArrayBuffer>} The encrypted sector key.
   */
  wrapSectorKey: async (sectorKey, userPublicKey) => {
    return await window.crypto.subtle.wrapKey(
      'raw',
      sectorKey,
      userPublicKey,
      IDENTITY_KEY_ALGO
    );
  },
  
  /**
   * Unwraps a sector key using the user's private identity key.
   * @param {ArrayBuffer} wrappedKey The encrypted sector key.
   * @param {CryptoKey} userPrivateKey The user's private RSA key.
   * @returns {Promise<CryptoKey>} The decrypted sector key.
   */
  unwrapSectorKey: async (wrappedKey, userPrivateKey) => {
      return await window.crypto.subtle.unwrapKey(
          'raw',
          wrappedKey,
          userPrivateKey,
          IDENTITY_KEY_ALGO,
          SECTOR_KEY_ALGO,
          true,
          ['encrypt', 'decrypt']
      );
  },


  // --- Encryption / Decryption ---

  /**
   * Encrypts a message using a symmetric sector key.
   * @param {string} plaintext The message to encrypt.
   * @param {CryptoKey} key The sector key to use.
   * @returns {Promise<ArrayBuffer>} The encrypted data (ciphertext + IV).
   */
  encryptMessage: async (plaintext, key) => {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    // Prepend the IV to the ciphertext. It's needed for decryption.
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv);
    result.set(new Uint8Array(ciphertext), iv.length);
    return result.buffer;
  },

  /**
   * Decrypts a message using a symmetric sector key.
   * @param {ArrayBuffer} encryptedBuffer The ciphertext + IV.
   * @param {CryptoKey} key The sector key to use.
   * @returns {Promise<string|null>} The decrypted plaintext, or null on failure.
   */
  decryptMessage: async (encryptedBuffer, key) => {
    try {
      const iv = encryptedBuffer.slice(0, 12);
      const ciphertext = encryptedBuffer.slice(12);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error("Decryption failed:", e);
      return null;
    }
  },


  // --- Persistence ---

  /**
   * Saves the entire keystore (identity and sector keys) to localStorage.
   */
  saveKeystoreToStorage: async () => {
    if (!identityKeys) return;
    
    // Convert all CryptoKey objects into storable JWK format.
    const storable = {
      identity: {
        publicKey: await cryptoService.exportKeyJwk(identityKeys.publicKey),
        privateKey: await cryptoService.exportKeyJwk(identityKeys.privateKey),
      },
      sectors: {},
    };

    for (const [sectorId, epochMap] of sectorKeys.entries()) {
      storable.sectors[sectorId] = {};
      for (const [epochId, key] of epochMap.entries()) {
          storable.sectors[sectorId][epochId] = await cryptoService.exportKeyJwk(key);
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storable));
  },

  /**
   * Loads the keystore from localStorage and imports keys back into CryptoKey objects.
   * @returns {Promise<boolean>} True if keys were loaded, false otherwise.
   */
  loadKeystoreFromStorage: async () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;

    const parsed = JSON.parse(stored);

    // Import identity keys
    const pub = await cryptoService.importKeyJwk(parsed.identity.publicKey, 'public');
    const priv = await cryptoService.importKeyJwk(parsed.identity.privateKey, 'private');
    identityKeys = { publicKey: pub, privateKey: priv };

    // Import sector keys
    sectorKeys.clear();
    for (const sectorId in parsed.sectors) {
      const epochMap = new Map();
      for (const epochId in parsed.sectors[sectorId]) {
        const key = await window.crypto.subtle.importKey(
          'jwk', 
          parsed.sectors[sectorId][epochId], 
          SECTOR_KEY_ALGO, 
          true, 
          ['encrypt', 'decrypt']
        );
        epochMap.set(Number(epochId), key);
      }
      sectorKeys.set(sectorId, epochMap);
    }
    
    return true;
  },
  
  // Public getters
  getIdentity: () => identityKeys,
  getSectorKey: (sectorId, epochId) => sectorKeys.get(sectorId)?.get(epochId),
  // Public setters
  addSectorKey: (sectorId, epochId, key) => {
      if (!sectorKeys.has(sectorId)) {
          sectorKeys.set(sectorId, new Map());
      }
      sectorKeys.get(sectorId).set(epochId, key);
  }
};

export default cryptoService;
