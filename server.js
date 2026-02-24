const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const questionRoutes = require('./routes/question.routes');
// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Validate required environment variables
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
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// ========================
// TRUST PROXY (important for Render and iOS)
// ========================
app.set('trust proxy', 1);

// ========================
// iOS-Specific Headers Middleware
// ========================
app.use((req, res, next) => {
  // Essential headers for iOS Safari
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  
  // Prevent caching of authenticated requests (important for iOS)
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
});

// ========================
// CORS CONFIGURATION
// ========================
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://sweecbt.vercel.app',  // Your frontend domain
  'https://sweecbtbackend.onrender.com'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      logger.warn(`CORS policy blocked: ${origin}`);
      return callback(new Error('CORS policy blocked this request'), false);
    }
    return callback(null, true);
  },
  credentials: true,
  exposedHeaders: ['Authorization', 'Refresh-Token', 'Set-Cookie'],
  optionsSuccessStatus: 200
}));

// ========================
// LOGGING MIDDLEWARE
// ========================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400,
    stream: { write: (message) => logger.error(message.trim()) }
  }));
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode >= 400,
    stream: { write: (message) => logger.info(message.trim()) }
  }));
}

// ========================
// BODY PARSING & COOKIES
// ========================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ========================
// RATE LIMITING (with health check bypass)
// ========================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes EXCEPT health check
app.use('/api/', (req, res, next) => {
  // Skip rate limiting for health check endpoint
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  return limiter(req, res, next);
});

// Add root health check (completely bypasses rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime()
  });
});

// ========================
// iOS Cookie Debugging (only in development)
// ========================
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log('🍪 Cookies:', req.cookies);
    console.log('📋 Headers:', req.headers);
    console.log('📱 User-Agent:', req.headers['user-agent']);
    next();
  });
}

// ========================
// API ROUTES
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
app.use('/api/students', require('./routes/student.routes'));
app.use('/api/materials', materialRoutes);
app.use('/api/submissions', require('./routes/submission.routes'));
app.use('/api/teachers', teacherRoutes);
app.use('/api/questions', questionRoutes);

// ========================
// STATIC FILES
// ========================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ========================
// HEALTH CHECK & API INFO
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
    }
  });
});

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
// 404 HANDLER
// ========================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
      timestamp: new Date().toISOString()
    }
  });
});

// ========================
// GLOBAL ERROR HANDLER
// ========================
app.use(errorHandler);

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`🌐 Frontend origin: ${process.env.CLIENT_URL}`);
  logger.info(`📱 iOS/Safari compatibility enabled`);
  logger.info(`📝 Available routes:`);
  logger.info(`   - POST   /api/auth/login`);
  logger.info(`   - POST   /api/auth/register`);
  logger.info(`   - POST   /api/auth/refresh-token`);
  logger.info(`   - GET    /api/auth/profile`);
  logger.info(`   - PATCH  /api/auth/profile`);
  logger.info(`   - POST   /api/auth/logout`);
  logger.info(`   - GET    /api/auth/check`);
  logger.info(`   - GET    /api/auth/verify-session`);
  logger.info(`   - GET    /health (rate limit bypass)`);
  logger.info(`   - GET    /api/health (rate limit bypass)`);
});

// ========================
// GRACEFUL SHUTDOWN
// ========================
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION:', error);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated.');
    process.exit(0);
  });
});

module.exports = app;
