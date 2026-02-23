// routes/user.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const  userValidator = require('../validators/user.validator');
const  userCtrl = require('../controllers/user.controller');

// Admin routes
router.route('/')
  .get(authMiddleware('admin'), userCtrl.getAllUsers)
  .post(authMiddleware('admin'), validate(userValidator.createUserSchema), userCtrl.createUser);
router.post('/bulk', authMiddleware('admin'), validate(userValidator.bulkCreateUsersSchema), userCtrl.bulkCreateUsers);
router.route('/:id')
  .get(authMiddleware('admin'), userCtrl.getUserById)
  .patch(authMiddleware('admin'), validate(userValidator.updateUserSchema), userCtrl.updateUser)
  .delete(authMiddleware('admin'), userCtrl.deleteUser);
// Add these if needed (optional - can use existing endpoints with filters) 
// Current user routes
router.get('/me/classes', authMiddleware(['student', 'teacher', 'admin']), userCtrl.getCurrentUserClasses);

module.exports = router;