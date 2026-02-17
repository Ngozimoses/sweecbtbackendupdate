// routes/result.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const resultValidator = require('../validators/result.validator');
const resultCtrl = require('../controllers/result.controller');

// General results access
router.get('/', authMiddleware(['student', 'teacher', 'admin']), resultCtrl.getAllResults);
router.get('/exam/:examId', authMiddleware(['student', 'teacher', 'admin']), resultCtrl.getExamResults);
router.get('/student/:studentId', authMiddleware(['student', 'teacher', 'admin']), resultCtrl.getStudentResults);
router.get('/class/:classId', authMiddleware(['student', 'teacher', 'admin']), resultCtrl.getClassResults);

// ✅ CORRECT: Single grading endpoint
router.patch('/:id/grade', authMiddleware('teacher'), validate(resultValidator.gradeSubmissionSchema), resultCtrl.gradeSubmission);

// Publishing & re-evaluation
router.post('/exam/:examId/publish', authMiddleware('teacher'), resultCtrl.publishExamResults);
router.post('/:submissionId/reevaluate', authMiddleware('student'), resultCtrl.requestReevaluation);
// Analytics & export
router.get('/analytics', authMiddleware(['student', 'teacher', 'admin']), resultCtrl.getAnalytics);
router.get('/exam/:examId/export', authMiddleware(['student', 'teacher', 'admin']), resultCtrl.exportExamResults);

module.exports = router;