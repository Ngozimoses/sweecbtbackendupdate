const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const { decrypt,encrypt } = require('../utils/encryptDecrypt');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const SecurityLog = require('../models/SecurityLog');
const  logger = require('../config/logger');
// const { 
//   encrypt, 
//   decrypt, 
//   blacklistToken, 
//   invalidateUserCache 
// } = require('../utils/security');
const {blacklistToken, invalidateUserCache } = require('../middleware/auth');
const CONFIG = {
  JWT_ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  REFRESH_TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  NEW_ACCESS_TOKEN_EXPIRY_MS: 1 * 24 * 60 * 60 * 1000,
  OTP_EXPIRY_MS: 3600000, // 1 hour
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCK_DURATION_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_ATTEMPTS: 10,
  },
};

// Rate limiting helper
const rateLimitCache = new Map();

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  register: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 min
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  loginPrecheck: { maxAttempts: 10, windowMs: 15 * 60 * 1000 }
};

// Rate limiting helper
const checkRateLimit = (key, config = RATE_LIMIT_CONFIG.login) => {
  const now = Date.now();
  const record = rateLimitCache.get(key);

  if (!record) {
    rateLimitCache.set(key, {
      count: 1,
      resetTime: now + config.windowMs
    });
    return { allowed: true };
  }

  if (now > record.resetTime) {
    rateLimitCache.set(key, {
      count: 1,
      resetTime: now + config.windowMs
    });
    return { allowed: true };
  }

  if (record.count >= config.maxAttempts) {
    return { 
      allowed: false, 
      resetTime: new Date(record.resetTime).toISOString() 
    };
  }

  record.count++;
  return { allowed: true };
};

// Generate refresh token with selector/verifier pattern
function generateRefreshToken() {
  const selector = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const fullToken = `${selector}:${verifier}`;
  const hashedVerifier = crypto.createHash('sha256').update(verifier).digest('hex');
  
  return { fullToken, selector, hashedVerifier };
}

// Set tokens as httpOnly cookies
const setTokensAsCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.cookie('accessToken', encrypt(accessToken), {
    httpOnly: true, 
    secure: true,
    sameSite: isProduction ? 'None' : 'None',
    path: '/',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.cookie('refreshToken', encrypt(refreshToken), {
    httpOnly: true, 
    secure: true,
    sameSite: isProduction ? 'None' : 'None',
    path: '/',
    maxAge: CONFIG.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  });
};

// REGISTER (NO TOKEN GENERATION)
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed during registration', { errors: errors.array() });
      return res.status(400).json({ 
        status: 'error', 
        message: 'Validation failed', 
        data: { errors: errors.array() } 
      });
    }

    const { name, email, password, role = 'student', class: classId } = req.body;
    
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedName = sanitizeHtml(name.trim());
    const sanitizedPassword = password.trim();
    const sanitizedRole = role.trim().toLowerCase();

    // Rate limiting
    const rateLimitKey = `register:user:${sanitizedEmail}`;
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.register);
    if (!rateCheck.allowed) {
      logger.warn('Registration rate limit exceeded', { email: sanitizedEmail });
      return res.status(429).json({ 
        status: 'error', 
        message: 'Too many registration attempts. Try again later.',
        data: { resetTime: rateCheck.resetTime }
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: sanitizedEmail }).lean();
    if (existingUser) {
      logger.warn('User already exists', { email: sanitizedEmail });
      return res.status(400).json({ 
        status: 'error', 
        message: 'User already exists with this email.' 
      });
    }

    // Validate student has class
    if (sanitizedRole === 'student' && !classId) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Students must be assigned to a class' 
      });
    }

    // Create user
    const user = await User.create({ 
      name: sanitizedName, 
      email: sanitizedEmail, 
      password: sanitizedPassword, 
      role: sanitizedRole, 
      class: classId 
    });

    // Log security event (fire-and-forget)
    SecurityLog.create({
      userId: user._id,
      email: user.email,
      action: 'REGISTER_SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: `User registered successfully with role: ${user.role}.`,
    }).catch(err => logger.error('Failed to log security event', { error: err.message }));

    logger.info('User registered successfully', { 
      userId: user._id, 
      email: sanitizedEmail,
      role: user.role
    });

    return res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please login to continue.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          class: user.class
        }
      }
    });
  } catch (error) {
    logger.error('Registration error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred' 
    });
  }
};

// LOGIN
const login = async (req, res, next) => {
  try {
    let { email, password } = req.body;
    if (typeof email === 'string') {
      email = email.replace(/^["']|["']$/g, '').trim().toLowerCase();
    }
    if (!email || !password) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Email and password are required.' 
      });
    }

    const sanitizedEmail = email.trim().toLowerCase();

    // Rate limiting
    const rateLimitKey = `login:user:${sanitizedEmail}`;
    const rateCheck = checkRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      logger.warn('Login rate limit exceeded', { email: sanitizedEmail });
      return res.status(429).json({ 
        status: 'error', 
        message: 'Too many login attempts. Try again later.',
        data: { resetTime: rateCheck.resetTime }
      });
    }

    // Fetch user with password
    const user = await User.findOne({ email: sanitizedEmail })
      .select('+password')
      .populate('class', 'name grade');

    // Validate credentials
    if (!user || !(await bcrypt.compare(password, user.password))) {
      // Fire-and-forget security log
      SecurityLog.create({
        userId: user?._id,
        email: sanitizedEmail,
        action: 'LOGIN_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: 'Invalid credentials attempt.',
      }).catch(err => logger.error('Failed to log security event', { error: err.message }));
      
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid email or password.' 
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: CONFIG.JWT_ACCESS_TOKEN_EXPIRY }
    );

    const { fullToken: refreshToken, selector, hashedVerifier } = generateRefreshToken();
    
    const refreshTokenExpires = new Date(
      Date.now() + CONFIG.REFRESH_TOKEN_EXPIRY_MS
    );

    // Save refresh token and log security event in parallel
    await Promise.all([
      RefreshToken.create({
        userId: user._id,
        userModel: 'User',
        tokenSelector: selector,
        tokenVerifier: hashedVerifier,
        expiresAt: refreshTokenExpires,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      }),
      SecurityLog.create({
        userId: user._id,
        email: user.email,
        action: 'LOGIN_SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: 'User logged in successfully.',
      }).catch(err => logger.error('Failed to log security event', { error: err.message }))
    ]);

    setTokensAsCookies(res, accessToken, refreshToken);

    logger.info('User login successful', { 
      userId: user._id, 
      email: sanitizedEmail 
    });

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          class: user.class
        },
        accessToken: encrypt(accessToken)
      }
    });
  } catch (error) {
    logger.error('Login error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred' 
    });
  }
};

// REFRESH TOKEN
const refreshToken = async (req, res) => {
  try {
    const encryptedRefreshToken = req.cookies.refreshToken;
    
    if (!encryptedRefreshToken) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Refresh token not found.' 
      });
    }

    let refreshToken;
    try {
      refreshToken = decrypt(encryptedRefreshToken);
    } catch (error) {
      logger.warn('Invalid refresh token format', { error: error.message });
      return res.status(403).json({ 
        status: 'error', 
        message: 'Invalid refresh token' 
      });
    }

    const [selector, verifier] = refreshToken.split(':');
    if (!selector || !verifier) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Malformed refresh token' 
      });
    }

    const hashedVerifier = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('hex');

    // Find token
    const tokenDoc = await RefreshToken.findOne({
      tokenSelector: selector,
      userModel: 'User',
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!tokenDoc) {
      logger.warn('Invalid or expired refresh token');
      return res.status(403).json({ 
        status: 'error', 
        message: 'Invalid or expired refresh token' 
      });
    }

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(tokenDoc.tokenVerifier, 'hex'),
      Buffer.from(hashedVerifier, 'hex')
    );

    if (!isValid) {
      logger.warn('Token verification failed', { userId: tokenDoc.userId });
      return res.status(403).json({ 
        status: 'error', 
        message: 'Invalid refresh token' 
      });
    }

    // Verify user exists
    const user = await User.findById(tokenDoc.userId).lean();
    if (!user) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'User not found for this token.' 
      });
    }

    // Blacklist old access token
    const encryptedOldAccessToken = req.cookies.accessToken;
    if (encryptedOldAccessToken) {
      try {
        const oldAccessToken = decrypt(encryptedOldAccessToken);
        const decoded = jwt.decode(oldAccessToken);
        
        if (decoded && decoded.exp) {
          const expiryMs = (decoded.exp * 1000) - Date.now();
          if (expiryMs > 0) {
            await blacklistToken(oldAccessToken, expiryMs);
            logger.debug('Old access token blacklisted during refresh', { 
              userId: user._id 
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to blacklist old access token', { 
          error: err.message 
        });
      }
    }

    // Generate new tokens
    const newAccessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: CONFIG.JWT_ACCESS_TOKEN_EXPIRY }
    );

    const { fullToken: newRefreshToken, selector: newSelector, hashedVerifier: newHashedVerifier } = generateRefreshToken();
    
    const refreshTokenExpires = new Date(
      Date.now() + CONFIG.REFRESH_TOKEN_EXPIRY_MS
    );

    const newTokenDoc = new RefreshToken({
      userId: user._id,
      userModel: 'User',
      tokenSelector: newSelector,
      tokenVerifier: newHashedVerifier,
      expiresAt: refreshTokenExpires,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Use transaction for atomicity
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await RefreshToken.updateOne(
        { _id: tokenDoc._id },
        { 
          $set: { 
            revoked: true, 
            revokedAt: new Date(), 
            replacedByTokenId: newTokenDoc._id 
          } 
        },
        { session }
      );

      await newTokenDoc.save({ session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    setTokensAsCookies(res, newAccessToken, newRefreshToken);

    logger.info('Access token refreshed', { userId: user._id });

    return res.json({
      status: 'success',
      message: 'Access token refreshed',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        accessToken: encrypt(newAccessToken)
      }
    });
  } catch (error) {
    logger.error('Refresh token error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred' 
    });
  }
};

// LOGOUT
const logout = async (req, res) => {
  const encryptedRefreshToken = req.cookies.refreshToken;
  const encryptedAccessToken = req.cookies.accessToken;
  
  try {
    // Blacklist access token
    if (encryptedAccessToken) {
      try {
        const accessToken = decrypt(encryptedAccessToken);
        const decoded = jwt.decode(accessToken);
        
        if (decoded && decoded.exp) {
          const expiryMs = (decoded.exp * 1000) - Date.now();
          if (expiryMs > 0) {
            await blacklistToken(accessToken, expiryMs);
            logger.info('Access token blacklisted during logout', { 
              userId: decoded.id 
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to blacklist access token during logout', { 
          error: err.message 
        });
      }
    }

    // Invalidate user cache
    if (req.user?._id && req.user?.role) {
      const cacheKey = `${req.user._id}:${req.user.role}`;
      invalidateUserCache(cacheKey);
      logger.debug('User cache invalidated during logout', { 
        userId: req.user._id 
      });
    }

    // Revoke refresh token
    if (encryptedRefreshToken) {
      try {
        const refreshToken = decrypt(encryptedRefreshToken);
        const [selector, verifier] = refreshToken.split(':');
        
        if (selector && verifier) {
          const hashedVerifier = crypto
            .createHash('sha256')
            .update(verifier)
            .digest('hex');

          const tokenDoc = await RefreshToken.findOne({
            tokenSelector: selector,
            userModel: 'User',
            revoked: false,
            expiresAt: { $gt: new Date() },
          }).lean();

          if (tokenDoc) {
            const isValid = crypto.timingSafeEqual(
              Buffer.from(tokenDoc.tokenVerifier, 'hex'),
              Buffer.from(hashedVerifier, 'hex')
            );

            if (isValid) {
              await Promise.all([
                RefreshToken.updateOne(
                  { _id: tokenDoc._id },
                  { $set: { revoked: true, revokedAt: new Date() } }
                ),
                SecurityLog.create({
                  userId: tokenDoc.userId,
                  email: req.user?.email || 'unknown',
                  action: 'LOGOUT',
                  ipAddress: req.ip,
                  userAgent: req.headers['user-agent'],
                  details: 'User logged out.',
                }).catch(err => logger.error('Failed to log security event', { error: err.message }))
              ]);

              logger.info('User logged out successfully', { 
                userId: tokenDoc.userId 
              });
            }
          }
        }
      } catch (err) {
        logger.warn('Error processing refresh token during logout', { 
          error: err.message 
        });
      }
    }

    // Clear cookies
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' 
    });
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' 
    });

    return res.status(200).json({ 
      status: 'success', 
      message: 'Logout successful' 
    });
    
  } catch (error) {
    logger.error('Logout error', { 
      error: error.message, 
      stack: error.stack 
    });
    
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' 
    });
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' 
    });
    
    return res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred' 
    });
  }
};

// LOGOUT FROM ALL DEVICES
const logoutAll = async (req, res) => {
  try {
    const userId = req.user?._id;

    // Blacklist current access token
    const encryptedAccessToken = req.cookies.accessToken;
    if (encryptedAccessToken) {
      try {
        const accessToken = decrypt(encryptedAccessToken);
        const decoded = jwt.decode(accessToken);
        
        if (decoded && decoded.exp) {
          const expiryMs = (decoded.exp * 1000) - Date.now();
          if (expiryMs > 0) {
            await blacklistToken(accessToken, expiryMs);
            logger.info('Access token blacklisted during logout-all', { userId });
          }
        }
      } catch (err) {
        logger.warn('Failed to blacklist access token', { error: err.message });
      }
    }

    // Invalidate user cache
    if (userId && req.user?.role) {
      const cacheKey = `${userId}:${req.user.role}`;
      invalidateUserCache(cacheKey);
      logger.debug('User cache invalidated during logout-all', { userId });
    }

    // Revoke all refresh tokens for this user
    const result = await RefreshToken.updateMany(
      { 
        userId: userId, 
        userModel: 'User', 
        revoked: false 
      },
      { 
        $set: { 
          revoked: true, 
          revokedAt: new Date() 
        } 
      }
    );

    // Fire-and-forget security log
    SecurityLog.create({
      userId: userId,
      email: req.user?.email,
      action: 'LOGOUT_ALL',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: 'User logged out from all devices.',
    }).catch(err => logger.error('Failed to log security event', { error: err.message }));

    // Clear cookies
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' 
    });
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/' 
    });

    logger.info('User logged out from all devices', { 
      userId: userId, 
      tokensRevoked: result.modifiedCount 
    });

    return res.status(200).json({ 
      status: 'success', 
      message: 'Logged out from all devices',
      data: { tokensRevoked: result.modifiedCount }
    });
  } catch (error) {
    logger.error('Logout all error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred' 
    });
  }
};

// VERIFY SESSION
const verifySession = async (req, res) => {
  try {
    const encryptedAccess = req.cookies.accessToken;
    
    if (!encryptedAccess) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Not authenticated' 
      });
    }

    let accessToken;
    try {
      accessToken = decrypt(encryptedAccess);
    } catch (err) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Invalid access token' 
      });
    }

    let decoded;
    let newTokens = null;
    
    try {
      decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
      
      newTokens = {
        accessToken: encryptedAccess,
        refreshToken: req.cookies.refreshToken || null
      };
      
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        // Auto-refresh if token expired
        const refreshResult = await autoRefreshToken(req, res, false);
        
        if (!refreshResult || refreshResult.status === 'error') {
          return res.status(401).json({
            status: 'error',
            message: refreshResult?.message || 'Token refresh failed'
          });
        }
        
        newTokens = {
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken
        };
        
        decoded = { id: refreshResult.userId };
      } else {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Invalid or malformed access token' 
        });
      }
    }
    
    // Verify user still exists
    const user = await User.findById(decoded.id).lean();
    if (!user) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'User not found or unauthorized' 
      });
    }
    
    const response = {
      status: 'success',
      message: 'Session verified',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          class: user.class
        },
        tokens: {
          accessToken: newTokens?.accessToken || null,
          refreshToken: newTokens?.refreshToken || null
        }
      }
    };

    return res.json(response);
    
  } catch (error) {
    logger.error('VerifySession error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      status: 'error', 
      message: 'An unexpected error occurred' 
    });
  }
};

// AUTO REFRESH TOKEN (helper for verifySession)
const autoRefreshToken = async (req, res, sendResponse = true) => {
  try {
    const encryptedRefresh = req.cookies.refreshToken;
    if (!encryptedRefresh) {
      const errorResponse = { 
        status: 'error', 
        message: 'Session expired. Please log in again.' 
      };
      return sendResponse ? res.status(401).json(errorResponse) : errorResponse;
    }

    let refreshToken;
    try {
      refreshToken = decrypt(encryptedRefresh);
    } catch {
      const errorResponse = { 
        status: 'error', 
        message: 'Invalid refresh token' 
      };
      return sendResponse ? res.status(403).json(errorResponse) : errorResponse;
    }

    const [selector, verifier] = refreshToken.split(':');
    if (!selector || !verifier) {
      const errorResponse = { 
        status: 'error', 
        message: 'Malformed refresh token' 
      };
      return sendResponse ? res.status(403).json(errorResponse) : errorResponse;
    }

    const hashedVerifier = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('hex');

    const tokenDoc = await RefreshToken.findOne({
      tokenSelector: selector,
      userModel: 'user',
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!tokenDoc) {
      const errorResponse = { 
        status: 'error', 
        message: 'Invalid or expired refresh token' 
      };
      return sendResponse ? res.status(403).json(errorResponse) : errorResponse;
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(tokenDoc.tokenVerifier, 'hex'),
      Buffer.from(hashedVerifier, 'hex')
    );

    if (!isValid) {
      const errorResponse = { 
        status: 'error', 
        message: 'Invalid refresh token' 
      };
      return sendResponse ? res.status(403).json(errorResponse) : errorResponse;
    }

    const user = await User.findById(tokenDoc.userId).lean();
    if (!user) {
      const errorResponse = { 
        status: 'error', 
        message: 'User not found' 
      };
      return sendResponse ? res.status(404).json(errorResponse) : errorResponse;
    }

    // Blacklist old access token during auto-refresh
    const encryptedOldAccessToken = req.cookies.accessToken;
    if (encryptedOldAccessToken) {
      try {
        const oldAccessToken = decrypt(encryptedOldAccessToken);
        const decoded = jwt.decode(oldAccessToken);
        
        if (decoded && decoded.exp) {
          const expiryMs = (decoded.exp * 1000) - Date.now();
          if (expiryMs > 0) {
            await blacklistToken(oldAccessToken, expiryMs);
            logger.debug('Old access token blacklisted during auto-refresh', { 
              userId: user._id 
            });
          }
        }
      } catch (err) {
        logger.warn('Failed to blacklist old access token during auto-refresh', { 
          error: err.message 
        });
      }
    }

    // Generate new tokens
    const newAccessToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: CONFIG.JWT_ACCESS_TOKEN_EXPIRY }
    );

    const { fullToken: newRefreshToken, selector: newSelector, hashedVerifier: newHashedVerifier } = generateRefreshToken();
    
    const newExpiry = new Date(
      Date.now() + CONFIG.REFRESH_TOKEN_EXPIRY_MS
    );

    const newTokenDoc = new RefreshToken({
      userId: user._id,
      userModel: 'User',
      tokenSelector: newSelector,
      tokenVerifier: newHashedVerifier,
      expiresAt: newExpiry,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Use transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await RefreshToken.updateOne(
        { _id: tokenDoc._id },
        { 
          $set: { 
            revoked: true, 
            revokedAt: new Date(), 
            replacedByTokenId: newTokenDoc._id 
          } 
        },
        { session }
      );

      await newTokenDoc.save({ session });
      await session.commitTransaction();

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    setTokensAsCookies(res, newAccessToken, newRefreshToken);

    const encryptedAccessToken = encrypt(newAccessToken);
    const encryptedRefreshToken = encrypt(newRefreshToken);

    if (sendResponse) {
      return res.json({
        status: 'success',
        message: 'Session refreshed automatically',
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
          },
          accessToken: encryptedAccessToken
        }
      });
    }

    return {
      status: 'success',
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      userId: user._id,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };

  } catch (error) {
    logger.error('AutoRefreshToken error', { 
      error: error.message, 
      stack: error.stack 
    });
    
    const errorResponse = { 
      status: 'error', 
      message: 'Failed to refresh session' 
    };
    return sendResponse ? res.status(500).json(errorResponse) : errorResponse;
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?._id).select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(user);
  } catch (error) {
    logger.error('Get profile error:', error);
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const updates = { name };
    if (email && email !== req.user.email) {
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ message: 'Email already in use.' });
      updates.email = email;
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true })
      .select('-password -refreshToken');
    res.json(user);
  } catch (error) {
    logger.error('Update profile error:', error);
    next(error);
  }
};
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email not found.' });

    const resetToken = generateResetToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = getPasswordResetUrl(resetToken);
    await sendEmail(
      email,
      'Password Reset Request',
      `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}" target="_blank">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`
    );

    res.json({ message: 'Password reset email sent.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Token invalid or expired.' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    next(error);
  }
};

// Periodic cleanup function (run via cron or scheduler)
const cleanupRateLimitCache = () => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, value] of rateLimitCache.entries()) {
    if (now > value.resetTime) {
      rateLimitCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info('Rate limit cache cleaned', { entriesRemoved: cleaned });
  }
};

// Run cleanup every 15 minutes
setInterval(cleanupRateLimitCache, 15 * 60 * 1000);

module.exports = {
  register,
  getProfile,
  updateProfile,
  login,
  refreshToken,
  logout,
  logoutAll,
  verifySession,
  autoRefreshToken,
  forgotPassword,
  resetPassword
};




// // src/controllers/auth.controller.js
// const User = require('../models/User');
// const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
// const { sendEmail, getPasswordResetUrl } = require('../utils/email');
// const { hashPassword, comparePassword, generateResetToken } = require('../utils/helpers');
// const logger = require('../config/logger');

// const register = async (req, res, next) => {
//   try {
//     const { name, email, password, role = 'student', class: classId } = req.body;

//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return res.status(400).json({ message: 'User already exists with this email.' });
//     }

//     const user = await User.create({ name, email, password, role, class: classId });
//     const accessToken = generateAccessToken(user._id, user.role);
//     const refreshToken = generateRefreshToken(user._id);

//     user.refreshToken = refreshToken;
//     await user.save();

//     res.status(201).json({
//       user: { id: user._id, name, email, role },
//       accessToken,
//       refreshToken
//     });
//   } catch (error) {
//     logger.error('Auth register error:', error);
//     next(error);
//   }
// };

// const login = async (req, res, next) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email }).select('+password +refreshToken');
//     if (!user || !(await comparePassword(password, user.password))) {
//       return res.status(401).json({ message: 'Invalid email or password.' });
//     }

//     const accessToken = generateAccessToken(user._id, user.role);
//     const refreshToken = generateRefreshToken(user._id);

//     user.refreshToken = refreshToken;
//     await user.save();

//     res.json({
//       accessToken,
//       refreshToken,
//       user: { id: user._id, name: user.name, email: user.email, role: user.role }
//     });
//   } catch (error) {
//     logger.error('Auth login error:', error);
//     next(error);
//   }
// };

// const refreshToken = async (req, res, next) => {
//   try {
//     const { refreshToken: token } = req.body;
//     if (!token) return res.status(400).json({ message: 'Refresh token required.' });

//     const decoded = verifyToken(token, process.env.REFRESH_TOKEN_SECRET);
//     if (!decoded) return res.status(401).json({ message: 'Invalid refresh token.' });

//     const user = await User.findById(decoded.id).select('+refreshToken');
//     if (!user || user.refreshToken !== token) {
//       return res.status(401).json({ message: 'Refresh token revoked.' });
//     }

//     const accessToken = generateAccessToken(user._id, user.role);
//     res.json({ accessToken });
//   } catch (error) {
//     logger.error('Refresh token error:', error);
//     next(error);
//   }
// };

// const forgotPassword = async (req, res, next) => {
//   try {
//     const { email } = req.body;
//     const user = await User.findOne({ email });
//     if (!user) return res.status(404).json({ message: 'Email not found.' });

//     const resetToken = generateResetToken();
//     user.resetPasswordToken = resetToken;
//     user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
//     await user.save();

//     const resetUrl = getPasswordResetUrl(resetToken);
//     await sendEmail(
//       email,
//       'Password Reset Request',
//       `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}" target="_blank">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`
//     );

//     res.json({ message: 'Password reset email sent.' });
//   } catch (error) {
//     logger.error('Forgot password error:', error);
//     next(error);
//   }
// };

// const resetPassword = async (req, res, next) => {
//   try {
//     const { token } = req.params;
//     const { password } = req.body;

//     const user = await User.findOne({
//       resetPasswordToken: token,
//       resetPasswordExpires: { $gt: Date.now() }
//     });

//     if (!user) return res.status(400).json({ message: 'Token invalid or expired.' });

//     user.password = password;
//     user.resetPasswordToken = undefined;
//     user.resetPasswordExpires = undefined;
//     await user.save();

//     res.json({ message: 'Password has been reset successfully.' });
//   } catch (error) {
//     logger.error('Reset password error:', error);
//     next(error);
//   }
// };

// const getProfile = async (req, res, next) => {
//   try {
//     const user = await User.findById(req.user.id).select('-password -refreshToken');
//     if (!user) {
//       return res.status(404).json({ message: 'User not found.' });
//     }
//     res.json(user);
//   } catch (error) {
//     logger.error('Get profile error:', error);
//     next(error);
//   }
// };

// const updateProfile = async (req, res, next) => {
//   try {
//     const { name, email } = req.body;
//     const updates = { name };
//     if (email && email !== req.user.email) {
//       const existing = await User.findOne({ email });
//       if (existing) return res.status(400).json({ message: 'Email already in use.' });
//       updates.email = email;
//     }

//     const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true })
//       .select('-password -refreshToken');
//     res.json(user);
//   } catch (error) {
//     logger.error('Update profile error:', error);
//     next(error);
//   }
// };

// const logout = async (req, res, next) => {
//   try {
//     await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
//     res.json({ message: 'Logged out successfully.' });
//   } catch (error) {
//     logger.error('Logout error:', error);
//     next(error);
//   }
// };

// module.exports = {
//   register,
//   login,
//   refreshToken,
//   forgotPassword,
//   resetPassword,
//   getProfile,
//   updateProfile,
//   logout
// };