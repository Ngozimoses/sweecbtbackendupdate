const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const classValidator = require('../validators/class.validator');
const classCtrl = require('../controllers/class.controller');

// Public routes
router.get('/public', classCtrl.getPublicClasses);

// Admin/Teacher routes
router.route('/')
  .get(authMiddleware(['admin', 'teacher']), classCtrl.getAllClasses)
  .post(authMiddleware('admin'), validate(classValidator.createClassSchema), classCtrl.createClass);

// Single class routes
router.route('/:id')
  .get( authMiddleware(['admin', 'teacher']), classCtrl.getClassById) // ✅ FIXED
  .patch( authMiddleware('admin'), validate(classValidator.updateClassSchema), classCtrl.updateClass)
  .delete( authMiddleware('admin'), classCtrl.deleteClass);

// Teacher assignment (admin only)
router.post('/:id/assign-teacher', authMiddleware('admin'), validate(classValidator.assignTeacherSchema), classCtrl.assignTeacher);

// Subject management
router.get('/:id/subjects', authMiddleware(['admin', 'teacher']), classCtrl.getClassSubjects); // ✅ Teachers can view
router.post('/:id/subjects', authMiddleware('admin'), validate(classValidator.assignSubjectSchema), classCtrl.assignSubjectToClass); // Admin only
router.delete('/:id/subjects/:subjectId', authMiddleware('admin'), classCtrl.removeSubjectFromClass); // Admin only

// Student enrollment (admin only)
router.post('/:id/enroll',authMiddleware('admin'), validate(classValidator.enrollStudentsSchema), classCtrl.enrollStudents);
router.delete('/:id/unenroll', authMiddleware('admin'), validate(classValidator.unenrollStudentsSchema), classCtrl.unenrollStudents);

module.exports = router;