const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const authValidator = require('../validators/auth.validator');
const authCtrl = require('../controllers/auth.controller');

// Public routes
router.post('/register', validate(authValidator.registerSchema), authCtrl.register);
router.post('/login', validate(authValidator.loginSchema), authCtrl.login);
router.post('/refresh-token', authCtrl.refreshToken);
router.post('/forgot-password', validate(authValidator.forgotPasswordSchema), authCtrl.forgotPassword);
router.post('/reset-password/:token', validate(authValidator.resetPasswordSchema), authCtrl.resetPassword);

// Protected routes
router.get('/check', protect, authCtrl.checkAuth);
router.get('/profile', protect, authCtrl.getProfile);
router.patch('/profile', protect, validate(authValidator.updateProfileSchema), authCtrl.updateProfile);
router.post('/logout', protect, authCtrl.logout);

module.exports = router;