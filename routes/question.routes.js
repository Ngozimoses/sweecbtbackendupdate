// routes/question.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { upload, handleUploadError } = require('../middleware/upload');
const questionValidator = require('../validators/question.validator');
const questionCtrl = require('../controllers/question.controller');

// Question bank - filtered by subject (NEW)
router.get('/bank', authMiddleware(['teacher', 'admin']), questionCtrl.getQuestionBank);

// Get questions by IDs (FIXED - use query parameter instead of duplicate route)
router.get('/bank/ids', authMiddleware(['student','admin', 'teacher']), questionCtrl.getQuestionsByIds);

// Get teacher's subjects
router.get('/subjects', authMiddleware(['admin', 'teacher']), questionCtrl.getTeacherSubjects);

// Teacher-specific question bank (by teacher ID)
router.get('/teacher/:teacherId', authMiddleware(['admin', 'teacher']), questionCtrl.getTeacherQuestions);

// Individual question operations
router.route('/:id')
  .get(authMiddleware(['teacher', 'admin']), questionCtrl.getQuestionById)
  .patch(authMiddleware(['teacher', 'admin']), validate(questionValidator.updateQuestionSchema), questionCtrl.updateQuestion)
  .delete(authMiddleware(['teacher', 'admin']), questionCtrl.deleteQuestion);

// Import/Export
router.post('/import', authMiddleware(['teacher', 'admin']), upload.single('file'), handleUploadError, questionCtrl.importQuestions);
router.get('/export', authMiddleware(['teacher', 'admin']), questionCtrl.exportQuestions);
// Sharing
router.post('/:id/share', authMiddleware(['teacher', 'admin']), validate(questionValidator.shareQuestionSchema), questionCtrl.shareQuestion);

module.exports = router;