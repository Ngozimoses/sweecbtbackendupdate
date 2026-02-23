const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const authValidator = require('../validators/auth.validator');
const authCtrl = require('../controllers/auth.controller');
 
router.post('/register', validate(authValidator.registerSchema), authCtrl.register);

 
router.post('/login', validate(authValidator.loginSchema), authCtrl.login);
 
router.post('/refresh-token', validate(authValidator.refreshTokenSchema), authCtrl.refreshToken);

 
router.post('/forgot-password', validate(authValidator.forgotPasswordSchema), authCtrl.forgotPassword);
 
router.post('/reset-password/:token', validate(authValidator.resetPasswordSchema), authCtrl.resetPassword);
 
router.get('/check', protect, authCtrl.checkAuth);

 
router.get('/profile', protect, authCtrl.getProfile);

 
router.patch('/profile', protect, validate(authValidator.updateProfileSchema), authCtrl.updateProfile);

 
router.post('/logout', protect, authCtrl.logout);

 
router.get('/verify-session', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Session is valid',
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;