// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');
const { decrypt } = require('../utils/encryptDecrypt');

const TokenBlacklist = require('../models/TokenBlacklist');


/**
 * Developed by Sweemee Company
 * © 2025 Sweemee Company. All rights reserved.
 */

const CONFIG = {
  JWT_ACCESS_TOKEN_EXPIRY: '15m',
  OTP_EXPIRY_MS: 3600000, // 1 hour
  RESET_TOKEN_EXPIRY_MS: 15 * 60 * 1000, // 15 minutes
  USER_CACHE_TTL_MS: 3600000, // 1 hour
  BLACKLIST_CACHE_TTL_MS: 900000, // 15 minutes
  BLACKLIST_CLEANUP_INTERVAL: 15 * 60 * 1000, // 15 minutes
  MAX_CACHE_SIZE: 5000, // Reduced for memory efficiency
  CACHE_CLEANUP_BATCH: 500,
};

const validateEnv = () => {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not set');
    throw new Error('JWT_SECRET is required');
  }
  if (!process.env.ENCRYPTION_KEY) {
    logger.error('ENCRYPTION_KEY is not set');
    throw new Error('ENCRYPTION_KEY is required');
  }
};

const ALL_ROLES = [
  'admin',
  'administrator',
  'moderator',
  'support-agent',
  'content-editor',
  'finance-manager',
  'client',
  'organizer',
];

const ADMIN_LEVEL_ROLES = [
  'admin',
];

const modelMap = {
  'admin': User,
  'teacher': User,
  'student': User,
};

class CacheManager {
  constructor(maxSize, ttl, name = 'Cache') {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.name = name;
    this.hits = 0;
    this.misses = 0;
    this.lastCleanup = Date.now();
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) {
      this.misses++;
      return null;
    }
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    this.hits++;
    return cached.data;
  }

  set(key, data) {
    // Auto-cleanup if cache is getting too large
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttl,
      createdAt: Date.now()
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  has(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  cleanup(force = false) {
    const now = Date.now();
    
    // Don't cleanup too frequently unless forced
    if (!force && (now - this.lastCleanup) < 60000) {
      return;
    }
    
    let deleted = 0;
    const startSize = this.cache.size;
    
    // Remove expired entries
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expiry) {
        this.cache.delete(key);
        deleted++;
      }
      if (deleted >= CONFIG.CACHE_CLEANUP_BATCH) break;
    }
    
    // If still too large, remove oldest entries (LRU-like)
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
      
      const toRemove = Math.min(CONFIG.CACHE_CLEANUP_BATCH, entries.length);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
        deleted++;
      }
    }
    
    this.lastCleanup = now;
    
    if (deleted > 0) {
      logger.info(`${this.name} cleanup completed`, {
        deleted,
        startSize,
        currentSize: this.cache.size,
        hitRate: this.getHitRate()
      });
    }
    
    return deleted;
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    logger.info(`${this.name} cleared`, { entriesRemoved: size });
  }

  size() {
    return this.cache.size;
  }

  getHitRate() {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%';
  }

  getStats() {
    return {
      name: this.name,
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
}

// Initialize cache managers
const userCache = new CacheManager(
  CONFIG.MAX_CACHE_SIZE, 
  CONFIG.USER_CACHE_TTL_MS,
  'UserCache'
);

const blacklistCache = new CacheManager(
  CONFIG.MAX_CACHE_SIZE, 
  CONFIG.BLACKLIST_CACHE_TTL_MS,
  'BlacklistCache'
);

const getCachedUser = (userId) => {
  return userCache.get(`user:${userId}`);
};

const setCachedUser = (userId, userData) => {
  userCache.set(`user:${userId}`, userData);
};

const invalidateUserCache = (userId) => {
  userCache.delete(`user:${userId}`);
  logger.debug('User cache invalidated', { userId });
};

const isTokenBlacklisted = async (token) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  // 1. Check memory cache first (fast)
  if (blacklistCache.has(hashedToken)) {
    logger.debug('Token found in blacklist cache', { 
      tokenPreview: hashedToken.substring(0, 10) 
    });
    return true;
  }
  
  // 2. Check database (slower, but persistent)
  try {
    const blacklisted = await TokenBlacklist.findOne({
      token: hashedToken,
      expiresAt: { $gt: new Date() }
    }).lean().maxTimeMS(1000); // 1 second timeout
    
    if (blacklisted) {
      // Cache it for next time
      const ttl = blacklisted.expiresAt.getTime() - Date.now();
      if (ttl > 0) {
        blacklistCache.set(hashedToken, true);
      }
      
      logger.debug('Token found in blacklist DB', { 
        tokenPreview: hashedToken.substring(0, 10) 
      });
      return true;
    }
  } catch (error) {
    logger.error('Error checking token blacklist in DB', { 
      error: error.message,
      tokenPreview: hashedToken.substring(0, 10)
    });
    // On DB error, be conservative: allow the request
    // Better to allow one potentially revoked token than lock out valid users
  }
  
  return false;
};
  const blacklistToken = async (token, expiryMs) => {
  //Hash the token consistently (same as isTokenBlacklisted)
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + expiryMs);
  
  // 1. Add to memory cache immediately (fast, non-blocking)
  blacklistCache.set(hashedToken, true);
  
  // 2. Persist to database (slower, but durable)
  try {
    await TokenBlacklist.create({
      token: hashedToken,
      expiresAt,
      reason: 'logout',
      createdAt: new Date()
    });
    
    logger.info('Token blacklisted successfully', { 
      tokenPreview: hashedToken.substring(0, 10),
      expiresAt: expiresAt.toISOString()
    });
    
  } catch (error) {
    //
    if (error.code === 11000) {
      logger.info('Token already blacklisted (duplicate ignored)', { 
        tokenPreview: hashedToken.substring(0, 10)
      });
      // This is fine - token is already blacklisted, no action needed
      return;
    }
    
    // For any other database errors, log but don't throw
    // The in-memory cache will still prevent token reuse
    logger.error('Error saving token to blacklist DB', { 
      error: error.message,
      code: error.code,
      tokenPreview: hashedToken.substring(0, 10)
    });
    
    // Don't throw - the memory cache still works, so the token is effectively blacklisted
    // This ensures logout succeeds even if the database has issues
  }
};
// const blacklistToken = async (token, expiryMs) => {
//   const hashedToken = token ;
//   const expiresAt = new Date(Date.now() + expiryMs);
//   // 1. Add to memory cache immediately
//   blacklistCache.set(hashedToken, true);
  
//   // 2. Persist to database (non-blocking)
//   TokenBlacklist.create({
//     token: hashedToken,
//     expiresAt,
//     reason: 'logout',
//     createdAt: new Date()
//   }).catch(error => {
//     logger.error('Error saving token to blacklist DB', { 
//       error: error.message,
//       tokenPreview: hashedToken.substring(0, 10)
//     });
//   });
  
//   logger.info('Token blacklisted', { 
//     tokenPreview: hashedToken.substring(0, 10),
//     expiresAt: expiresAt.toISOString()
//   });
// };

const authMiddleware = (requiredRole = null) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    try {
      // 1. Extract token
      let encryptedToken;
      if (req.cookies?.accessToken) {
        encryptedToken = req.cookies.accessToken;
      } else if (req.headers.authorization?.startsWith('Bearer ')) {
        encryptedToken = req.headers.authorization.split(' ')[1];
      }
      
      if (!encryptedToken) {
        return res.status(401).json({ 
          status: 'error', 
          message: 'Unauthorized - No token provided.' 
        });
      }

      // 2. Decrypt token
      let token;
      try {
        token = decrypt(encryptedToken);
      } catch (decryptError) {
        logger.warn('Token decryption failed', { 
          error: decryptError.message,
          ip: req.ip 
        });
        return res.status(401).json({ 
          status: 'error', 
          message: 'Unauthorized - Invalid token format.' 
        });
      }
      
      // 3. Check blacklist (hybrid: memory + DB)
      const isBlacklisted = await isTokenBlacklisted(token);
      if (isBlacklisted) {
        logger.warn('Blacklisted token used', { ip: req.ip });
        return res.status(401).json({ 
          status: 'error', 
          message: 'Unauthorized - Token has been revoked.' 
        });
      }
      
      // 4. Verify JWT
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        const message = jwtError.name === 'TokenExpiredError' 
          ? 'Session expired - Please log in again' 
          : 'Unauthorized - Invalid token';
        
        logger.warn('JWT verification failed', { 
          error: jwtError.message,
          errorType: jwtError.name,
          ip: req.ip 
        });
        
        return res.status(401).json({ 
          status: 'error', 
          message,
          code: jwtError.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
        });
      }

      // 5. Validate role exists in model map
      const Model = modelMap[decoded.role];
      if (!Model) {
        logger.error('Invalid role in token', { 
          role: decoded.role,
          userId: decoded.id 
        });
        return res.status(401).json({ 
          status: 'error', 
          message: 'Unauthorized - Invalid role.' 
        });
      }

      // 6. Try cache first, then DB
      const cacheKey = `${decoded.id}:${decoded.role}`;
      let user = getCachedUser(cacheKey);
      
      if (!user) {
        // Fetch from database with selected fields only
        user = await Model.findById(decoded.id)
          .select('_id email role name ')
          .lean()
          .maxTimeMS(2000); // 2 second timeout
        
        if (user) {
          setCachedUser(cacheKey, user);
          logger.debug('User loaded from DB and cached', { 
            userId: decoded.id,
            role: decoded.role 
          });
        }
      } else {
        logger.debug('User loaded from cache', { userId: decoded.id });
      }

      // 7. Validate user exists and role matches
      if (!user) {
        logger.warn('User not found', { 
          userId: decoded.id, 
          role: decoded.role 
        });
        return res.status(401).json({ 
          status: 'error', 
          message: 'Unauthorized - User not found.' 
        });
      }

      if (user.role !== decoded.role) {
        logger.warn('Token role mismatch', { 
          userId: user._id, 
          tokenRole: decoded.role, 
          userRole: user.role 
        });
        return res.status(401).json({ 
          status: 'error', 
          message: 'Unauthorized - Token role mismatch.' 
        });
      }

      // 8. Check if account is active (if field exists)

      // 9. Attach user to request
      req.user = { 
        _id: user._id, 
        email: user.email, 
        role: user.role, 
        isAdminSession: decoded.isAdminSession || false,
        modelName: user.role 
      };

      // 10. Role-based authorization
      if (requiredRole) {
        // Admin always has access
        if (req.user.role === 'admin') {
          return next();
        }
        
        const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        
        // Check for 'anyAdmin' special role
        if (requiredRoles.includes('anyAdmin')) {
          if (ADMIN_LEVEL_ROLES.includes(req.user.role)) {
            return next();
          } else {
            logger.warn('Non-admin trying to access admin resource', { 
              userId: user._id, 
              role: user.role 
            });
            return res.status(403).json({ 
              status: 'error', 
              message: 'Forbidden - Administrative access required.' 
            });
          }
        }
        
        // Check if user has required role
        if (!requiredRoles.includes(req.user.role)) {
          logger.warn('Insufficient permissions', { 
            userId: user._id, 
            requiredRoles, 
            userRole: req.user.role 
          });
          return res.status(403).json({ 
            status: 'error', 
            message: `Forbidden - Requires one of: ${requiredRoles.join(', ')}` 
          });
        }
      }
      
      // 11. Performance monitoring
      const duration = Date.now() - startTime;
      if (duration > 200) {
        logger.warn('Slow auth middleware execution', { 
          duration: `${duration}ms`,
          userId: user._id,
          cacheHit: !!getCachedUser(cacheKey)
        });
      }
      
      next();
    } catch (error) {
      logger.error('Authentication middleware error', { 
        error: error.message,
        stack: error.stack,
        ip: req.ip
      });
      
      return res.status(500).json({ 
        status: 'error', 
        message: 'An unexpected error occurred during authentication.' 
      });
    }
  };
};

const cleanupCaches = () => {
  const now = Date.now();
  
  try {
    // Clean user cache
    const userCleaned = userCache.cleanup();
    
    // Clean blacklist cache
    const blacklistCleaned = blacklistCache.cleanup();
    
    // Clean expired tokens from database (non-blocking)
    TokenBlacklist.deleteMany({
      expiresAt: { $lt: new Date() }
    }).then(result => {
      if (result.deletedCount > 0) {
        logger.info('Expired tokens removed from DB', { 
          count: result.deletedCount 
        });
      }
    }).catch(error => {
      logger.error('Error cleaning up blacklist DB', { 
        error: error.message 
      });
    });
    
    // Log cache statistics periodically
    if (userCleaned > 0 || blacklistCleaned > 0) {
      logger.info('Cache cleanup summary', {
        userCache: userCache.getStats(),
        blacklistCache: blacklistCache.getStats(),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Cache cleanup error', { error: error.message });
  }
};


const gracefulShutdown = async (signal) => {
  logger.info('Shutdown signal received', { signal });
  
  try {
    // Log final cache statistics
    logger.info('Final cache statistics', {
      userCache: userCache.getStats(),
      blacklistCache: blacklistCache.getStats()
    });
    
    // Clear caches
    userCache.clear();
    blacklistCache.clear();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
};
validateEnv();

// Start periodic cleanup (every 15 minutes)
const cleanupInterval = setInterval(cleanupCaches, CONFIG.BLACKLIST_CLEANUP_INTERVAL);

// Log cache stats every 5 minutes
const statsInterval = setInterval(() => {
  logger.info('Cache statistics', {
    userCache: userCache.getStats(),
    blacklistCache: blacklistCache.getStats()
  });
}, 5 * 60 * 1000);

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Clear intervals on shutdown
process.on('exit', () => {
  clearInterval(cleanupInterval);
  clearInterval(statsInterval);
});

module.exports = { 
  authMiddleware, 
  blacklistToken,
  invalidateUserCache,
  cleanupCaches
};
// const protect = async (req, res, next) => {
//   let token = req.headers.authorization;

//   if (!token || !token.startsWith('Bearer ')) {
//     return res.status(401).json({ message: 'Access denied. No token provided.' });
//   }

//   token = token.replace('Bearer ', '');

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id).select('-password -refreshToken');

//     if (!user) {
//       return res.status(401).json({ message: 'Invalid token: user not found.' });
//     }

//     req.user = user;
//     next();
//   } catch (err) {
//     if (err.name === 'TokenExpiredError') {
//       return res.status(401).json({ message: 'Token expired.' });
//     }
//     logger.warn(`Authentication error: ${err.message}`);
//     return res.status(401).json({ message: 'Invalid token.' });
//   }
// };

// /**
//  * Middleware to restrict access by role
//  * Usage: requireRole('admin', 'teacher')
//  */
// const requireRole = (...allowedRoles) => {
//   return (req, res, next) => {
//     if (!req.user) {
//       return res.status(401).json({ message: 'Authentication required.' });
//     }

//     if (!allowedRoles.includes(req.user.role)) {
//       return res.status(403).json({ message: 'Access denied: insufficient permissions.' });
//     }

//     next();
//   };
// };

// module.exports = { protect, requireRole };