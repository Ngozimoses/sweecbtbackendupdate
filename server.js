const User = require('../models/User');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken,
  setTokenCookies,
  clearTokenCookies,
  extractTokenFromRequest
} = require('../utils/jwt');
const { sendEmail, getPasswordResetUrl } = require('../utils/email');
const { comparePassword, generateResetToken } = require('../utils/helpers');
const logger = require('../config/logger');

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'student', class: classId } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    // Create user
    const user = await User.create({ 
      name, 
      email, 
      password, 
      role, 
      class: classId 
    });
    
    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    // Return user data (no tokens in body)
    res.status(201).json({
      success: true,
      user: { 
        id: user._id, 
        name, 
        email, 
        role,
        class: user.class 
      }
    });
  } catch (error) {
    logger.error('Auth register error:', error);
    next(error);
  }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Find user with password and refreshToken fields
    const user = await User.findOne({ email }).select('+password +refreshToken');
    
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Update refresh token in database
    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    // Return user data
    res.json({
      success: true,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        class: user.class 
      }
    });
  } catch (error) {
    logger.error('Auth login error:', error);
    next(error);
  }
};

/**
 * Refresh access token using refresh token from cookie
 */
const refreshToken = async (req, res, next) => {
  try {
    // Get refresh token from cookies
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required.' });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    if (!decoded) {
      // Clear invalid cookies
      clearTokenCookies(res);
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    // Check if token exists in database and matches
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      // Token might be compromised - clear all tokens
      clearTokenCookies(res);
      if (user) {
        user.refreshToken = null;
        await user.save();
      }
      return res.status(401).json({ message: 'Refresh token revoked.' });
    }

    // Generate new access token
    const accessToken = generateAccessToken(user._id, user.role);
    
    // Set new access token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: process.env.COOKIE_SAMESITE || 'lax',
      domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
      path: '/',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    // Optionally rotate refresh token for better security
    // const newRefreshToken = generateRefreshToken(user._id);
    // user.refreshToken = newRefreshToken;
    // await user.save();
    // res.cookie('refreshToken', newRefreshToken, { ...same options, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ 
      success: true,
      message: 'Token refreshed successfully' 
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    next(error);
  }
};

/**
 * Logout user - clear cookies and remove refresh token from database
 */
const logout = async (req, res, next) => {
  try {
    // Get refresh token from cookies
    const refreshToken = req.cookies.refreshToken;
    
    if (refreshToken && req.user) {
      // Find user with this refresh token and clear it
      await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    } else if (refreshToken) {
      // If no user in request but we have a token, try to find and clear
      const decoded = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      if (decoded) {
        await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      }
    }
    
    // Clear cookies
    clearTokenCookies(res);

    res.json({ 
      success: true,
      message: 'Logged out successfully.' 
    });
  } catch (error) {
    logger.error('Logout error:', error);
    // Still clear cookies even if database update fails
    clearTokenCookies(res);
    res.json({ message: 'Logged out successfully.' });
  }
};

/**
 * Check authentication status - get current user from token
 */
const checkAuth = async (req, res) => {
  try {
    // User is already attached by protect middleware
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        class: req.user.class,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    logger.error('Check auth error:', error);
    res.status(401).json({ 
      success: false,
      authenticated: false, 
      message: 'Not authenticated' 
    });
  }
};

/**
 * Get user profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -refreshToken')
      .populate('class', 'name code');
      
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    next(error);
  }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const updates = { name };
    
    // If email is being updated, check it's not already taken
    if (email && email !== req.user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ message: 'Email already in use.' });
      }
      updates.email = email;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id, 
      updates, 
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    res.json({
      success: true,
      user
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    next(error);
  }
};

/**
 * Forgot password - send reset email
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: 'Email not found.' });
    }

    const resetToken = generateResetToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = getPasswordResetUrl(resetToken);
    await sendEmail(
      email,
      'Password Reset Request',
      `<p>You requested a password reset.</p>
       <p>Click <a href="${resetUrl}" target="_blank">here</a> to reset your password.</p>
       <p>This link expires in 1 hour.</p>
       <p>If you didn't request this, please ignore this email.</p>`
    );

    res.json({ 
      success: true,
      message: 'Password reset email sent.' 
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    next(error);
  }
};

/**
 * Reset password with token
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token invalid or expired.' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ 
      success: true,
      message: 'Password has been reset successfully.' 
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  checkAuth,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile
};