const User = require('../models/User');
const logger = require('../config/logger');
const { verifyToken, extractTokenFromRequest } = require('../utils/jwt');

 
const protect = async (req, res, next) => {
  try {
    // Extract token from cookies or Authorization header
    const token = extractTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }

    // Verify access token
    const decoded = verifyToken(token, process.env.JWT_SECRET);
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token.' 
      });
    }

    // Get user from database
    const user = await User.findById(decoded.id).select('-password -refreshToken');

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false,
      message: 'Authentication failed.' 
    });
  }
};

 
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);
    
    if (token) {
      const decoded = verifyToken(token, process.env.JWT_SECRET);
      if (decoded) {
        const user = await User.findById(decoded.id).select('-password -refreshToken');
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Just continue without user
    next();
  }
};
 
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required.' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied: insufficient permissions.' 
      });
    }

    next();
  };
};

module.exports = { protect, optionalAuth, requireRole };