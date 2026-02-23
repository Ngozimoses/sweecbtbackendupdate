<<<<<<< HEAD
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
=======
// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'student', class: classId } = req.body;

<<<<<<< HEAD
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
=======
// Validate essential environment variables early
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'CLIENT_URL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ FATAL: Missing required environment variables:');
  missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
  process.exit(1);
}

console.log('✅ Environment variables loaded:');
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   - PORT: ${process.env.PORT || 5000}`);
console.log(`   - CLIENT_URL: ${process.env.CLIENT_URL}`);

// Initialize Express app
const app = express();

// Import configurations
const connectDB = require('./config/db');
const logger = require('./config/logger');

// Import middleware
const { errorHandler } = require('./middleware/error');
const teacherRoutes = require('./routes/teacher.routes');
const adminRoutes = require('./routes/admin.routes');
const materialRoutes = require('./routes/material.routes');

// Connect to MongoDB
connectDB();

// ========================
// SECURITY MIDDLEWARE
// ========================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.CLIENT_URL]
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159
    }

<<<<<<< HEAD
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
=======
// ========================
// CORS
// ========================
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://sweecbt.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    const msg = `CORS policy blocked: ${origin}`;
    logger.warn(msg);
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  exposedHeaders: ['Authorization', 'Refresh-Token'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ✅ This is the critical fix — explicitly handle ALL OPTIONS preflight requests
// before any other middleware (rate limiter, auth, etc.) can block them
app.options(/(.*)/, cors(corsOptions));

// ========================
// LOGGING MIDDLEWARE
// ========================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      skip: (req, res) => res.statusCode < 400,
      stream: { write: (message) => logger.error(message.trim()) }
    })
  );
  app.use(
    morgan('combined', {
      skip: (req, res) => res.statusCode >= 400,
      stream: { write: (message) => logger.info(message.trim()) }
    })
  );
}

app.use(cookieParser());

// ========================
// BODY PARSING
// ========================
app.use(express.json({ limit: '10mb' }));

// ========================
// RATE LIMITING
// ========================
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ========================
// ROUTES
// ========================
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/classes', require('./routes/class.routes'));
app.use('/api/subjects', require('./routes/subject.routes'));
app.use('/api/exams', require('./routes/exam.routes'));
app.use('/api/questions', require('./routes/question.routes'));
app.use('/api/results', require('./routes/result.routes'));
app.use('/api/reports', require('./routes/report.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/upload', require('./routes/upload.routes'));
app.use('/api/admin', adminRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/students', require('./routes/student.routes'));
app.use('/api/materials', materialRoutes);
app.use('/api/submissions', require('./routes/submission.routes'));
app.use('/api/teachers', teacherRoutes);

// ========================
// HEALTH CHECK & API DOCS
// ========================
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'School CBT API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      docs: '/api/docs',
      health: '/api/health'
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159
    }

<<<<<<< HEAD
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
=======
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'connected'
  });
});

app.get('/api/docs', (req, res) => {
  res.json({
    message: 'API Documentation',
    baseUrl: `${req.protocol}://${req.get('host')}`,
    endpoints: [
      { path: '/api/auth', methods: ['POST', 'GET'], description: 'Authentication' },
      { path: '/api/users', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'User management' },
      { path: '/api/exams', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Exam management' },
      { path: '/api/questions', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Question bank' },
      { path: '/api/results', methods: ['GET', 'POST'], description: 'Exam results' }
    ]
  });
});

// ========================
// ERROR HANDLERS
// ========================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
      timestamp: new Date().toISOString()
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159
    }

<<<<<<< HEAD
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
=======
app.use(errorHandler);

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`🌐 Frontend origin: ${process.env.CLIENT_URL}`);
});
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159

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

<<<<<<< HEAD
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
=======
module.exports = app;
//SECOND SERVER FILE, NOT THE MAIN ONE. THIS IS FOR TESTING PURPOSES ONLY. DO NOT USE THIS IN PRODUCTION.
// const express = require('express');
// const dotenv = require('dotenv');
// const cors = require('cors');
// const helmet = require('helmet');
// const morgan = require('morgan');
// const path = require('path');
// const cookieParser = require('cookie-parser');

// // Add this BEFORE your routes, after helmet/cors

// // Load environment variables from .env
// dotenv.config({ path: path.resolve(__dirname, '.env') });

// // Validate essential environment variables early
// const requiredEnvVars = [
//   'MONGODB_URI',
//   'JWT_SECRET',
//   'REFRESH_TOKEN_SECRET',
//   'CLIENT_URL'
// ];

// const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

// if (missingEnvVars.length > 0) {
//   console.error('❌ FATAL: Missing required environment variables:');
//   missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
//   process.exit(1);
// }

// console.log('✅ Environment variables loaded:');
// console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
// console.log(`   - PORT: ${process.env.PORT || 5000}`);
// console.log(`   - CLIENT_URL: ${process.env.CLIENT_URL}`);

// // Initialize Express app
// const app = express();

// // Import configurations
// const connectDB = require('./config/db');
// const logger = require('./config/logger');

// // Import middleware
// const { errorHandler } = require('./middleware/error');
// const { handleUploadError } = require('./middleware/upload');
// const teacherRoutes = require('./routes/teacher.routes'); 
// const adminRoutes = require('./routes/admin.routes'); 
// const materialRoutes = require('./routes/material.routes');

// // Connect to MongoDB
// connectDB();

// // ========================
// // SECURITY MIDDLEWARE
// // ========================
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       scriptSrc: ["'self'"],
//       imgSrc: ["'self'", "data:", "https:"],
//       connectSrc: ["'self'", process.env.CLIENT_URL]
//     }
//   },
//   crossOriginResourcePolicy: { policy: "cross-origin" }
// }));

// // ========================
// // CORS
// // ========================
// const allowedOrigins = [
//   process.env.CLIENT_URL,
//   'http://localhost:5173',
//   'http://localhost:3000',
//   'http://localhost:3001',
//   'https://sweecbt.vercel.app'
// ];

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       if (!origin) return callback(null, true);
//       if (allowedOrigins.indexOf(origin) === -1) {
//         const msg = `CORS policy blocked: ${origin}`;
//         logger.warn(msg);
//         return callback(new Error(msg), false);
//       }
//       return callback(null, true);
//     },
//     credentials: true,
//     exposedHeaders: ['Authorization', 'Refresh-Token'],
//     optionsSuccessStatus: 200
//   })
// );

// // ========================
// // LOGGING MIDDLEWARE
// // ========================
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// } else {
//   // Log 4xx/5xx errors to error stream
//   app.use(
//     morgan('combined', {
//       skip: (req, res) => res.statusCode < 400,
//       stream: { write: (message) => logger.error(message.trim()) }
//     })
//   );
//   // Log 2xx/3xx success to info stream
//   app.use(
//     morgan('combined', {
//       skip: (req, res) => res.statusCode >= 400,
//       stream: { write: (message) => logger.info(message.trim()) }
//     })
//   );
// }
// app.use(cookieParser());
// // ========================
// // BODY PARSING
// // ========================
// app.use(express.json({ limit: '10mb' }));
// // app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // ========================
// // RATE LIMITING
// // ========================
// const rateLimit = require('express-rate-limit');
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use('/api/', limiter);
// app.use((req, res, next) => {
//   console.log('🍪 Cookies:', req.cookies);
//   console.log('📋 Headers:', req.headers.cookie);
//   next();
// });
// // ========================
// // ROUTES
// // ========================
// app.use('/api/auth', require('./routes/auth.routes'));
// app.use('/api/users', require('./routes/user.routes'));
// app.use('/api/classes', require('./routes/class.routes'));
// app.use('/api/subjects', require('./routes/subject.routes'));
// app.use('/api/exams', require('./routes/exam.routes'));
// app.use('/api/questions', require('./routes/question.routes'));
// app.use('/api/results', require('./routes/result.routes'));
// app.use('/api/reports', require('./routes/report.routes'));
// app.use('/api/notifications', require('./routes/notification.routes'));
// app.use('/api/upload', require('./routes/upload.routes'));
// app.use('/api/admin', adminRoutes);
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use('/api/students', require('./routes/student.routes'));
// app.use('/api/materials', materialRoutes); 
// app.use('/api/submissions', require('./routes/submission.routes'));
// app.use('/api/teachers', teacherRoutes);

// // ========================
// // HEALTH CHECK & API DOCS
// // ========================
// app.get('/', (req, res) => {
//   res.status(200).json({
//     message: 'School CBT API',
//     version: '1.0.0',
//     environment: process.env.NODE_ENV,
//     timestamp: new Date().toISOString(),
//     endpoints: {
//       auth: '/api/auth',
//       docs: '/api/docs',
//       health: '/api/health'
//     }
//   });
// });

// app.get('/api/health', (req, res) => {
//   res.status(200).json({
//     status: 'OK',
//     timestamp: new Date().toISOString(),
//     environment: process.env.NODE_ENV,
//     uptime: process.uptime(),
//     memory: process.memoryUsage(),
//     database: 'connected'
//   });
// });

// app.get('/api/docs', (req, res) => {
//   res.json({
//     message: 'API Documentation',
//     baseUrl: `${req.protocol}://${req.get('host')}`,
//     endpoints: [
//       { path: '/api/auth', methods: ['POST', 'GET'], description: 'Authentication' },
//       { path: '/api/users', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'User management' },
//       { path: '/api/exams', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Exam management' },
//       { path: '/api/questions', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Question bank' },
//       { path: '/api/results', methods: ['GET', 'POST'], description: 'Exam results' }
//     ]
//   });
// });

// // ========================
// // ERROR HANDLERS
// // Must be in this exact order:
// // 1. Upload error handler (handles multer errors)
// // 2. 404 handler (catches unmatched routes)
// // 3. Global error handler (catches everything else)
// // ========================
// // app.use(handleUploadError);

// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     error: {
//       message: `Route ${req.originalUrl} not found`,
//       code: 'ROUTE_NOT_FOUND',
//       timestamp: new Date().toISOString()
//     }
//   });
// });

// app.use(errorHandler);

// // ========================
// // START SERVER
// // ========================
// const PORT = process.env.PORT || 10000;
// const server = app.listen(PORT, '0.0.0.0', () => {
//   logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
//   logger.info(`🌐 Frontend origin: ${process.env.CLIENT_URL}`);
// });

// // ========================
// // GRACEFUL SHUTDOWN
// // ========================
// process.on('unhandledRejection', (reason) => {
//   logger.error('UNHANDLED REJECTION:', reason);
//   server.close(() => process.exit(1));
// });

// process.on('uncaughtException', (error) => {
//   logger.error('UNCAUGHT EXCEPTION:', error);
//   server.close(() => process.exit(1));
// });

// process.on('SIGTERM', () => {
//   logger.info('SIGTERM received. Shutting down gracefully...');
//   server.close(() => logger.info('Process terminated.'));
// });

// module.exports = app;


// const express = require('express');
// const dotenv = require('dotenv');
// const cors = require('cors');
// const helmet = require('helmet');
// const morgan = require('morgan');
// const path = require('path');

// // Load environment variables from .env
// dotenv.config({ path: path.resolve(__dirname, '.env') });

// // 🔍 Critical: Validate essential environment variables early
// const requiredEnvVars = [
//   'MONGODB_URI',
//   'JWT_SECRET',
//   'REFRESH_TOKEN_SECRET',
//   'CLIENT_URL'
// ];

// const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

// if (missingEnvVars.length > 0) {
//   console.error('❌ FATAL: Missing required environment variables:');
//   missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
//   process.exit(1);
// }

// // Log loaded environment variables (hide sensitive values)
// console.log('✅ Environment variables loaded:');
// console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
// console.log(`   - PORT: ${process.env.PORT || 5000}`);
// console.log(`   - CLIENT_URL: ${process.env.CLIENT_URL}`);
// console.log(`   - JWT_EXPIRE: ${process.env.JWT_EXPIRE || '15m'}`);
// console.log(`   - REFRESH_TOKEN_EXPIRE: ${process.env.REFRESH_TOKEN_EXPIRE || '7d'}`);
// console.log('✅ MONGODB_URI is loaded.');

// // Initialize Express app
// const app = express();

// // Import configurations
// const connectDB = require('./config/db');
// const logger = require('./config/logger');

// // Import middleware
// const { errorHandler } = require('./middleware/error');
// const { handleUploadError } = require('./middleware/upload');
// const teacherRoutes = require('./routes/teacher.routes'); 
// const adminRoutes = require('./routes/admin.routes'); 
// const materialRoutes = require('./routes/material.routes');

// // Connect to MongoDB
// connectDB();
 
// // ========================
// // SECURITY MIDDLEWARE
// // ========================
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       scriptSrc: ["'self'"],
//       imgSrc: ["'self'", "data:", "https:"],
//       connectSrc: ["'self'", process.env.CLIENT_URL]
//     }
//   },
//   crossOriginResourcePolicy: { policy: "cross-origin" }
// }));

// // ✅ CORS Configuration
// const allowedOrigins = [
//   process.env.CLIENT_URL,
//   'http://localhost:5173',  // Vite dev server
//   'http://localhost:3000',
//   'http://localhost:3001',// Create React App dev server
//   'https://sweecbt.vercel.app'  // Your production frontend
// ];

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       // Allow requests with no origin (like mobile apps, curl, etc.)
//       if (!origin) return callback(null, true);
      
//       if (allowedOrigins.indexOf(origin) === -1) {
//         const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
//         logger.warn(`CORS blocked: ${origin}`);
//         return callback(new Error(msg), false);
//       }
//       return callback(null, true);
//     },
//     credentials: true, // Required for cookies/auth headers
//     exposedHeaders: ['Authorization', 'Refresh-Token'],
//     optionsSuccessStatus: 200
//   })
// );

// // ========================
// // LOGGING MIDDLEWARE
// // ========================
// if (process.env.NODE_ENV === 'development') {
//   app.use(morgan('dev'));
// } else {
//   app.use(
//     morgan('combined', {
//       skip: (req, res) => res.statusCode < 400,
//       stream: { write: (message) => logger.info(message.trim()) }
//     })
//   );
//   app.use(
//     morgan('combined', {
//       skip: (req, res) => res.statusCode >= 400,
//       stream: { write: (message) => logger.error(message.trim()) }
//     })
//   );
// }

// // ========================
// // BODY PARSING
// // ========================
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // ========================
// // RATE LIMITING (Optional but recommended)
// // ========================
// const rateLimit = require('express-rate-limit');
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use('/api/', limiter);

// // ========================
// // ROUTES
// // ========================
// app.use('/api/auth', require('./routes/auth.routes'));
// app.use('/api/users', require('./routes/user.routes'));
// app.use('/api/classes', require('./routes/class.routes'));
// app.use('/api/subjects', require('./routes/subject.routes'));
// app.use('/api/exams', require('./routes/exam.routes'));
// app.use('/api/questions', require('./routes/question.routes'));
// app.use('/api/results', require('./routes/result.routes'));
// app.use('/api/reports', require('./routes/report.routes'));
// app.use('/api/notifications', require('./routes/notification.routes'));
// app.use('/api/upload', require('./routes/upload.routes'));
// app.use('/api/admin', adminRoutes);
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use('/api/students', require('./routes/student.routes'));
// app.use('/api/materials', materialRoutes); 
// app.use('/api/submissions', require('./routes/submission.routes'));
// app.use('/api/teachers', teacherRoutes);

// // ========================
// // HEALTH CHECK & API DOCS
// // ========================
// app.get('/', (req, res) => {
//   res.status(200).json({
//     message: 'School CBT API',
//     version: '1.0.0',
//     environment: process.env.NODE_ENV,
//     timestamp: new Date().toISOString(),
//     endpoints: {
//       auth: '/api/auth',
//       docs: '/api/docs',
//       health: '/api/health'
//     }
//   });
// });

// app.get('/api/health', (req, res) => {
//   res.status(200).json({
//     status: 'OK',
//     timestamp: new Date().toISOString(),
//     environment: process.env.NODE_ENV,
//     uptime: process.uptime(),
//     memory: process.memoryUsage(),
//     database: 'connected' // You could check MongoDB connection here
//   });
// });

// // API Documentation route
// app.get('/api/docs', (req, res) => {
//   res.json({
//     message: 'API Documentation',
//     baseUrl: `${req.protocol}://${req.get('host')}`,
//     endpoints: [
//       { path: '/api/auth', methods: ['POST', 'GET'], description: 'Authentication' },
//       { path: '/api/users', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'User management' },
//       { path: '/api/exams', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Exam management' },
//       { path: '/api/questions', methods: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Question bank' },
//       { path: '/api/results', methods: ['GET', 'POST'], description: 'Exam results' }
//     ]
//   });
// });

// // ========================
// // ERROR HANDLING FOR 404
// // ========================
// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     error: {
//       message: `Route ${req.originalUrl} not found`,
//       code: 'ROUTE_NOT_FOUND',
//       timestamp: new Date().toISOString()
//     }
//   });
// });

// app.use(handleUploadError);
// app.use(errorHandler);

// // ========================
// // START SERVER
// // ========================
// const PORT = process.env.PORT || 10000; // Changed to match Render's PORT
// const server = app.listen(PORT, '0.0.0.0', () => {
//   logger.info(`🚀 School CBT Backend running in ${process.env.NODE_ENV} mode on port ${PORT}`);
//   logger.info(`🌐 Frontend origin allowed: ${process.env.CLIENT_URL}`);
//   logger.info(`🔗 Health check: ${process.env.CLIENT_URL ? process.env.CLIENT_URL : 'http://localhost:' + PORT}/api/health`);
//   logger.info(`🔗 API Base URL: ${process.env.CLIENT_URL ? process.env.CLIENT_URL.replace('https://', 'https://api.') : 'http://localhost:' + PORT}/api`);
// });

// // ========================
// // GRACEFUL SHUTDOWN
// // ========================
// process.on('unhandledRejection', (reason) => {
//   logger.error('UNHANDLED REJECTION:', reason);
//   server.close(() => process.exit(1));
// });

// process.on('uncaughtException', (error) => {
//   logger.error('UNCAUGHT EXCEPTION:', error);
//   server.close(() => process.exit(1));
// });

// process.on('SIGTERM', () => {
//   logger.info('SIGTERM received. Shutting down gracefully...');
//   server.close(() => logger.info('Process terminated.'));
// });

// module.exports = app;
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159
