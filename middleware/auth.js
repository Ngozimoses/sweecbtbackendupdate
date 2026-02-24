const User = require('../models/User');
const logger = require('../config/logger');
const { verifyToken, extractTokenFromRequest } = require('../utils/jwt');

/**
 * Middleware to protect routes: verifies JWT access token from cookies or header
 */
const protect = async (req, res, next) => {
  try {
    console.log('\n🛡️ ===== PROTECT MIDDLEWARE =====');
    console.log('📝 Request Path:', req.method, req.path);
    console.log('📝 Full URL:', req.originalUrl);
    console.log('🍪 Raw Cookie Header:', req.headers.cookie || 'No cookie header');
    console.log('🍪 Parsed Cookies:', req.cookies || {});
    console.log('📋 All Headers:', JSON.stringify(req.headers, null, 2));
    
    // Extract token from cookies or Authorization header
    const token = extractTokenFromRequest(req);
    console.log('🔑 Extracted Token:', token ? `${token.substring(0, 30)}...` : '❌ No token found');

    if (!token) {
      console.log('❌ Access denied - No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }

    // Verify access token
    console.log('🔍 Verifying token with JWT_SECRET');
    console.log('🔍 JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined');
    
    const decoded = verifyToken(token, process.env.JWT_SECRET);
    
    if (!decoded) {
      console.log('❌ Invalid or expired token');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token.' 
      });
    }

    console.log('✅ Token decoded successfully:', { 
      id: decoded.id, 
      role: decoded.role,
      iat: new Date(decoded.iat * 1000).toISOString(),
      exp: new Date(decoded.exp * 1000).toISOString()
    });

    // Get user from database
    console.log('🔍 Looking up user in database with ID:', decoded.id);
    const user = await User.findById(decoded.id).select('-password -refreshToken');
    
    console.log('👤 Database user result:', user ? { 
      id: user._id.toString(), 
      role: user.role, 
      email: user.email,
      name: user.name
    } : '❌ User not found');

    if (!user) {
      console.log('❌ User not found in database');
      return res.status(401).json({ 
        success: false,
        message: 'User not found.' 
      });
    }

    req.user = user;
    console.log('✅ Authentication successful for user:', user.email);
    console.log('✅ User role:', user.role);
    console.log('🛡️ ===== END PROTECT =====\n');
    next();
  } catch (error) {
    console.log('❌ Unexpected error in protect middleware:', error.message);
    console.log('❌ Error stack:', error.stack);
    logger.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false,
      message: 'Authentication failed.' 
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    console.log('\n🔄 ===== OPTIONAL AUTH =====');
    const token = extractTokenFromRequest(req);
    
    if (token) {
      console.log('🔑 Token found, attempting verification');
      const decoded = verifyToken(token, process.env.JWT_SECRET);
      if (decoded) {
        const user = await User.findById(decoded.id).select('-password -refreshToken');
        if (user) {
          req.user = user;
          console.log('✅ Optional auth - user attached:', user.email);
        } else {
          console.log('⚠️ Optional auth - token valid but user not found');
        }
      } else {
        console.log('⚠️ Optional auth - token invalid');
      }
    } else {
      console.log('ℹ️ Optional auth - no token provided');
    }
    console.log('🔄 ===== END OPTIONAL AUTH =====\n');
    next();
  } catch (error) {
    console.log('❌ Error in optional auth:', error.message);
    // Just continue without user
    next();
  }
};

/**
 * Middleware to restrict access by role
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    console.log('\n🔐 ===== REQUIRE ROLE CHECK =====');
    console.log('👤 User in request:', req.user ? { 
      id: req.user._id, 
      role: req.user.role,
      email: req.user.email 
    } : '❌ No user found');
    console.log('🎭 Allowed roles:', allowedRoles);
    
    if (!req.user) {
      console.log('❌ Authentication required - no user');
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required.' 
      });
    }

    console.log('🔍 Checking if role', req.user.role, 'is in', allowedRoles);
    const hasRole = allowedRoles.includes(req.user.role);
    console.log('✅ Has required role:', hasRole);

    if (!hasRole) {
      console.log('❌ Access denied - insufficient permissions');
      return res.status(403).json({ 
        success: false,
        message: 'Access denied: insufficient permissions.' 
      });
    }

    console.log('🔐 ===== ROLE CHECK PASSED =====\n');
    next();
  };
};

module.exports = { protect, optionalAuth, requireRole };
