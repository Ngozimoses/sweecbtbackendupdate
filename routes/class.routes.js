const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const classValidator = require('../validators/class.validator');
const classCtrl = require('../controllers/class.controller');

// All routes are protected
router.use(protect);

// Public routes (still need protection but accessible by all authenticated users)
router.get('/public', requireRole('admin', 'teacher', 'student'), classCtrl.getPublicClasses);

// Admin/Teacher routes
router.route('/')
  .get(requireRole('admin', 'teacher'), classCtrl.getAllClasses)
  .post(requireRole('admin'), validate(classValidator.createClassSchema), classCtrl.createClass);

// Single class routes
router.route('/:id')
  .get(requireRole('admin', 'teacher'), classCtrl.getClassById) 
  .patch(requireRole('admin'), validate(classValidator.updateClassSchema), classCtrl.updateClass)
  .delete(requireRole('admin'), classCtrl.deleteClass);

// Teacher assignment (admin only)
router.post('/:id/assign-teacher', requireRole('admin'), validate(classValidator.assignTeacherSchema), classCtrl.assignTeacher);

// Subject management
router.get('/:id/subjects', requireRole('admin', 'teacher'), classCtrl.getClassSubjects);
router.post('/:id/subjects', requireRole('admin'), validate(classValidator.assignSubjectSchema), classCtrl.assignSubjectToClass);
router.delete('/:id/subjects/:subjectId', requireRole('admin'), classCtrl.removeSubjectFromClass);

// Student enrollment (admin only)
router.post('/:id/enroll', requireRole('admin'), validate(classValidator.enrollStudentsSchema), classCtrl.enrollStudents);
router.delete('/:id/unenroll', requireRole('admin'), validate(classValidator.unenrollStudentsSchema), classCtrl.unenrollStudents);

module.exports = router;