require('dotenv').config();
const crypto = require('crypto');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

const algorithm = 'aes-256-cbc';
const keys = [
  Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
  Buffer.from(process.env.ENCRYPTION_KEY_PREVIOUS || '0'.repeat(64), 'hex'),
];

if (keys[0].length !== 32) {
  logger.error('Invalid ENCRYPTION_KEY: must be a 32-byte key (64 hex characters)');
  throw new Error('Invalid ENCRYPTION_KEY: must be a 32-byte key (64 hex characters)');
}

function encrypt(text) {
  if (typeof text !== 'string' || !text) {
    logger.error('Invalid input for encryption', { type: typeof text });
    throw new Error('Input must be a non-empty string');
  }
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, keys[0], iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const result = `${iv.toString('hex')}:${encrypted}`;
    
    logger.debug('Encryption successful', {
      inputLength: text.length,
      outputLength: result.length,
      ivLength: iv.toString('hex').length,
      encryptedLength: encrypted.length
    });
    
    return result;
  } catch (error) {
    logger.error('Encryption error', { error: error.message, textLength: text.length, stack: error.stack });
    throw new Error('Failed to encrypt data');
  }
}

function decrypt(encrypted) {
  try {
    // Validate input
    if (typeof encrypted !== 'string' || !encrypted) {
      logger.error('Decrypt: Invalid input type', { 
        type: typeof encrypted,
        value: encrypted 
      });
      throw new Error('Encrypted data must be a non-empty string');
    }

    logger.debug('Decrypt: Starting decryption', {
      inputLength: encrypted.length,
      inputPreview: encrypted.substring(0, 100) + '...',
      hasColon: encrypted.includes(':'),
      colonCount: (encrypted.match(/:/g) || []).length
    });

    // Split the encrypted data
    const parts = encrypted.split(':');
    if (parts.length !== 2) {
      logger.error('Decrypt: Invalid format - expected format is iv:encryptedData', { 
        parts: parts.length,
        encrypted: encrypted.substring(0, 100) + '...'
      });
      throw new Error('Invalid encrypted data format: expected iv:encryptedData');
    }

    const [ivHex, encryptedText] = parts;
    
    if (!ivHex || !encryptedText) {
      logger.error('Decrypt: Missing IV or encrypted text', { 
        hasIV: !!ivHex, 
        hasEncrypted: !!encryptedText,
        ivLength: ivHex?.length,
        encryptedLength: encryptedText?.length
      });
      throw new Error('Invalid encrypted data format: missing IV or encrypted text');
    }

    // Validate hex format
    if (!/^[0-9a-f]+$/i.test(ivHex)) {
      logger.error('Decrypt: IV is not valid hex', { 
        ivHex: ivHex.substring(0, 32),
        ivLength: ivHex.length 
      });
      throw new Error('Invalid IV: not a valid hex string');
    }

    if (!/^[0-9a-f]+$/i.test(encryptedText)) {
      logger.error('Decrypt: Encrypted text is not valid hex', { 
        preview: encryptedText.substring(0, 100),
        length: encryptedText.length 
      });
      throw new Error('Invalid encrypted text: not a valid hex string');
    }

    // Convert to buffers
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16) {
      logger.error('Decrypt: Invalid IV length after conversion', { 
        expected: 16,
        actual: iv.length,
        ivHex: ivHex.substring(0, 32)
      });
      throw new Error(`Invalid IV length: expected 16 bytes, got ${iv.length}`);
    }

    logger.debug('Decrypt: Buffers created', {
      ivBufferLength: iv.length,
      encryptedTextLength: encryptedText.length,
      encryptedBufferLength: Buffer.from(encryptedText, 'hex').length
    });

    // Try decryption with each key
    let lastError = null;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        logger.debug(`Decrypt: Attempting with key ${i}`, {
          keyLength: key.length,
          ivLength: iv.length
        });

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        logger.info('Decrypt: Success', {
          keyUsed: i,
          decryptedLength: decrypted.length,
          isJWT: decrypted.startsWith('eyJ'),
          preview: decrypted.substring(0, 50) + '...'
        });
        
        return decrypted;
      } catch (error) {
        lastError = error;
        logger.warn(`Decrypt: Key ${i} failed`, { 
          error: error.message,
          errorCode: error.code,
          errorName: error.name
        });
      }
    }

    // All keys failed
    logger.error('Decrypt: All keys failed', { 
      error: lastError.message,
      errorCode: lastError.code,
      errorName: lastError.name,
      stack: lastError.stack,
      keysAttempted: keys.length,
      ivHex: ivHex.substring(0, 32),
      encryptedPreview: encryptedText.substring(0, 100)
    });
    
    throw new Error(`Failed to decrypt token: ${lastError.message}`);
    
  } catch (error) {
    // Log the full error
    logger.error('Decrypt: Fatal error', { 
      error: error.message,
      errorCode: error.code,
      errorName: error.name,
      stack: error.stack,
      inputPreview: typeof encrypted === 'string' ? encrypted.substring(0, 100) + '...' : 'not a string'
    });
    
    // Re-throw with original error message for better debugging
    throw error;
  }
}

module.exports = { encrypt, decrypt };