const User = require('../models/User');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken,
  setTokenCookies,
  clearTokenCookies
} = require('../utils/jwt');
const { sendEmail, getPasswordResetUrl } = require('../utils/email');
const { comparePassword, generateResetToken } = require('../utils/helpers');
const logger = require('../config/logger');

const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'student', class: classId } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    const user = await User.create({ name, email, password, role, class: classId });
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    // For backward compatibility, still return tokens in response
    res.status(201).json({
      success: true,
      user: { id: user._id, name, email, role },
      accessToken,  // Keep for backward compatibility
      refreshToken  // Keep for backward compatibility
    });
  } catch (error) {
    logger.error('Auth register error:', error);
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password +refreshToken');
    
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      accessToken,   // Keep for backward compatibility
      refreshToken,  // Keep for backward compatibility
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

const refreshToken = async (req, res, next) => {
  try {
    // Try to get refresh token from cookies first, then from request body
    const token = req.cookies.refreshToken || req.body.refreshToken;
    
    if (!token) {
      return res.status(400).json({ message: 'Refresh token required.' });
    }

    const decoded = verifyToken(token, process.env.REFRESH_TOKEN_SECRET);
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: 'Refresh token revoked.' });
    }

    const accessToken = generateAccessToken(user._id, user.role);
    
    // Update access token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: process.env.COOKIE_SAMESITE || 'lax',
      domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
      path: '/',
      maxAge: 15 * 60 * 1000
    });

    res.json({ 
      success: true,
      accessToken  // Keep for backward compatibility
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
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

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password -refreshToken')
      .populate('class', 'name code');
      
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

    res.json(user);
  } catch (error) {
    logger.error('Update profile error:', error);
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    // Clear refresh token from database
    if (req.user) {
      await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    }
    
    // Clear cookies
    clearTokenCookies(res);

    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    logger.error('Logout error:', error);
    // Still clear cookies even if database update fails
    clearTokenCookies(res);
    res.json({ message: 'Logged out successfully.' });
  }
};

// New endpoint to check authentication status
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

module.exports = {
  register,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  logout,
  checkAuth
};