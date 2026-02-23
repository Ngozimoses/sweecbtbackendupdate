const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const userValidator = require('../validators/user.validator');
const userCtrl = require('../controllers/user.controller');

// All routes are protected
router.use(protect);

// Admin routes
router.route('/')
  .get(requireRole('admin'), userCtrl.getAllUsers)
  .post(requireRole('admin'), validate(userValidator.createUserSchema), userCtrl.createUser);

router.post('/bulk', 
  requireRole('admin'), 
  validate(userValidator.bulkCreateUsersSchema), 
  userCtrl.bulkCreateUsers
);

router.route('/:id')
  .get(requireRole('admin'), userCtrl.getUserById)
  .patch(requireRole('admin'), validate(userValidator.updateUserSchema), userCtrl.updateUser)
  .delete(requireRole('admin'), userCtrl.deleteUser);

// Current user routes (accessible by authenticated users)
router.get('/me/classes', 
  requireRole('student', 'teacher', 'admin'), 
  userCtrl.getCurrentUserClasses
);

module.exports = router;