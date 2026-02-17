// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const authValidator = require('../validators/auth.validator');
const authCtrl = require('../controllers/auth.controller');

// Public routes
router.post('/register', validate(authValidator.registerSchema), authCtrl.register);
router.post('/login', validate(authValidator.loginSchema), authCtrl.login);
router.post('/forgot-password', validate(authValidator.forgotPasswordSchema), authCtrl.forgotPassword);
router.post('/reset-password/:token', validate(authValidator.resetPasswordSchema), authCtrl.resetPassword);
//ADDED VERIFY SESSION ENDPOINT
router.post('/verify-session', authCtrl.verifySession);
// Protected routes
router.post('/refresh', authCtrl.refreshToken);
router.get('/profile', authCtrl.getProfile);
router.patch('/profile', validate(authValidator.updateProfileSchema), authCtrl.updateProfile);
router.post('/logout', authCtrl.logout);

module.exports = router;