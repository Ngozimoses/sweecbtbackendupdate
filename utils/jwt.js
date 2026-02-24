const jwt = require('jsonwebtoken');

/**
 * Generate access token (short-lived)
 */
const generateAccessToken = (userId, role) => {
  console.log('🔑 Generating access token for user:', userId, 'role:', role);
  const token = jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
  console.log('✅ Access token generated, length:', token.length);
  return token;
};

/**
 * Generate refresh token (long-lived)
 */
const generateRefreshToken = (userId) => {
  console.log('🔄 Generating refresh token for user:', userId);
  const token = jwt.sign(
    { id: userId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
  );
  console.log('✅ Refresh token generated, length:', token.length);
  return token;
};

/**
 * Set token cookies in response
 */
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log('🍪 Setting cookies. Production:', isProduction);
  console.log('🍪 Cookie domain:', isProduction ? process.env.COOKIE_DOMAIN : 'undefined');
  console.log('🍪 SameSite:', isProduction ? 'none' : 'lax');
  console.log('🍪 Secure:', true);
  
  // For cross-site requests (frontend and backend on different domains),
  // we need SameSite=None and Secure=true in production
  const cookieOptions = {
    httpOnly: true,
    secure: true, // Must be true when SameSite=None
    sameSite: 'none', // Changed from 'lax' to 'none' for cross-site
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
    path: '/'
  };

  // Access token cookie (15 minutes)
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000
  });
  console.log('✅ Access token cookie set, expires in 15 minutes');

  // Refresh token cookie (7 days)
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  console.log('✅ Refresh token cookie set, expires in 7 days');
};

/**
 * Clear token cookies
 */
const clearTokenCookies = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log('🧹 Clearing cookies');
  
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
    path: '/'
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  console.log('✅ Cookies cleared');
};

/**
 * Verify token
 */
const verifyToken = (token, secret) => {
  try {
    console.log('🔍 JWT Verify - Token start:', token.substring(0, 30) + '...');
    console.log('🔍 JWT Verify - Token length:', token.length);
    console.log('🔍 JWT Verify - Secret length:', secret ? secret.length : 'undefined');
    
    const decoded = jwt.verify(token, secret);
    console.log('✅ JWT Verify - Success:', { 
      id: decoded.id, 
      role: decoded.role,
      iat: new Date(decoded.iat * 1000).toISOString(),
      exp: new Date(decoded.exp * 1000).toISOString()
    });
    return decoded;
  } catch (error) {
    console.log('❌ JWT Verify - Failed:', error.message);
    if (error.name === 'TokenExpiredError') {
      console.log('❌ Token expired at:', new Date(error.expiredAt).toISOString());
    }
    return null;
  }
};

/**
 * Extract token from cookies or authorization header
 */
const extractTokenFromRequest = (req) => {
  console.log('🔍 Extracting token from request');
  
  // First try cookies
  if (req.cookies) {
    console.log('🍪 Cookies object keys:', Object.keys(req.cookies));
    if (req.cookies.accessToken) {
      console.log('✅ Found accessToken in cookies');
      return req.cookies.accessToken;
    } else {
      console.log('❌ No accessToken in cookies');
    }
  } else {
    console.log('❌ req.cookies is undefined');
  }
  
  // Then try authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    console.log('📋 Authorization header present');
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('✅ Found Bearer token in header, length:', token.length);
      return token;
    } else {
      console.log('❌ Authorization header does not start with Bearer');
    }
  } else {
    console.log('❌ No Authorization header');
  }
  
  console.log('❌ No token found in request');
  return null;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearTokenCookies,
  verifyToken,
  extractTokenFromRequest
};
