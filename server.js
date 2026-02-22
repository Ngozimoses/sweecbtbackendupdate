// // server.js
// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');

// Add this BEFORE your routes, after helmet/cors

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '.env') });

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
const { handleUploadError } = require('./middleware/upload');
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
// CORS
// ========================
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://sweecbt.vercel.app'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `CORS policy blocked: ${origin}`;
        logger.warn(msg);
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    exposedHeaders: ['Authorization', 'Refresh-Token'],
    optionsSuccessStatus: 200
  })
);

// ========================
// LOGGING MIDDLEWARE
// ========================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Log 4xx/5xx errors to error stream
  app.use(
    morgan('combined', {
      skip: (req, res) => res.statusCode < 400,
      stream: { write: (message) => logger.error(message.trim()) }
    })
  );
  // Log 2xx/3xx success to info stream
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
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use((req, res, next) => {
  console.log('🍪 Cookies:', req.cookies);
  console.log('📋 Headers:', req.headers.cookie);
  next();
});
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
// ERROR HANDLERS
// Must be in this exact order:
// 1. Upload error handler (handles multer errors)
// 2. 404 handler (catches unmatched routes)
// 3. Global error handler (catches everything else)
// ========================
// app.use(handleUploadError);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
      timestamp: new Date().toISOString()
    }
  });
});

app.use(errorHandler);

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  logger.info(`🌐 Frontend origin: ${process.env.CLIENT_URL}`);
});

// ========================
// GRACEFUL SHUTDOWN
// ========================
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION:', error);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => logger.info('Process terminated.'));
});

module.exports = app;


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
