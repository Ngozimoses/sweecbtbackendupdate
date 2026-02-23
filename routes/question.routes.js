const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { upload, handleUploadError } = require('../middleware/upload');
const questionValidator = require('../validators/question.validator');
const questionCtrl = require('../controllers/question.controller');

// All routes are protected
router.use(protect);

// Question bank - filtered by subject
router.get('/bank', requireRole('teacher', 'admin'), questionCtrl.getQuestionBank);

// Get questions by IDs
router.get('/bank/ids', requireRole('student', 'admin', 'teacher'), questionCtrl.getQuestionsByIds);

// Get teacher's subjects
router.get('/subjects', requireRole('admin', 'teacher'), questionCtrl.getTeacherSubjects);

// Teacher-specific question bank (by teacher ID)
router.get('/teacher/:teacherId', requireRole('admin', 'teacher'), questionCtrl.getTeacherQuestions);

// Individual question operations
router.route('/:id')
  .get(requireRole('teacher', 'admin'), questionCtrl.getQuestionById)
  .patch(requireRole('teacher', 'admin'), validate(questionValidator.updateQuestionSchema), questionCtrl.updateQuestion)
  .delete(requireRole('teacher', 'admin'), questionCtrl.deleteQuestion);

// Import/Export
router.post('/import', requireRole('teacher', 'admin'), upload.single('file'), handleUploadError, questionCtrl.importQuestions);
router.get('/export', requireRole('teacher', 'admin'), questionCtrl.exportQuestions);

// Sharing
router.post('/:id/share', requireRole('teacher', 'admin'), validate(questionValidator.shareQuestionSchema), questionCtrl.shareQuestion);

module.exports = router;