const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const examValidator = require('../validators/exam.validator');
const examCtrl = require('../controllers/exam.controller');
const submissionValidator = require('../validators/submission.validator');

// General exam management (Teacher/Admin)
router.route('/')
  .get(authMiddleware(['admin', 'teacher']), examCtrl.getAllExams)
  .post(authMiddleware('admin'), validate(examValidator.createExamSchema), examCtrl.createExam);

// Single exam routes
router.route('/:id')
  .get(authMiddleware(['student','teacher', 'admin']), examCtrl.getExamById)
  .patch(authMiddleware('admin'), validate(examValidator.updateExamSchema), examCtrl.updateExam)
  .delete(authMiddleware('admin'), examCtrl.deleteExam);

// ✅ CORRECT: Separate route for submissions
router.post('/:id/submissions', 
  authMiddleware('student'), 
  validate(submissionValidator.createSubmissionSchema), 
  examCtrl.submitExam
);

// Exam management routes
router.post('/:id/publish', authMiddleware(['teacher', 'admin']), examCtrl.publishExam);
router.post('/:id/schedule', authMiddleware(['teacher', 'admin']), validate(examValidator.scheduleExamSchema), examCtrl.scheduleExam);

// Submissions routes
router.get('/:id/submissions', authMiddleware('teacher'), examCtrl.getExamSubmissions);
// Student-specific routes
router.get('/active', authMiddleware('student'), examCtrl.getActiveExams);
router.post('/:id/submit', authMiddleware('student'), validate(examValidator.submitExamSchema), examCtrl.submitExam);
router.get('/:id/results', authMiddleware('student'), examCtrl.getStudentExamResult);
router.post('/:id/start', authMiddleware('student'), examCtrl.startExam);
module.exports = router;