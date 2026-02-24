const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const examValidator = require('../validators/exam.validator');
const examCtrl = require('../controllers/exam.controller');
const submissionValidator = require('../validators/submission.validator');

// All routes are protected
router.use(protect);

// Student-specific routes (must come before /:id routes)
router.get('/active', requireRole('student'), examCtrl.getActiveExams);

// General exam management (Teacher/Admin)
router.route('/')
  .get(requireRole('admin', 'teacher'), examCtrl.getAllExams)
  .post(requireRole('admin', 'teacher'), validate(examValidator.createExamSchema), examCtrl.createExam); // ✅ Fixed: teachers can now create exams

// Single exam routes
router.route('/:id')
  .get(requireRole('student', 'teacher', 'admin'), examCtrl.getExamById)
  .patch(requireRole('admin'), validate(examValidator.updateExamSchema), examCtrl.updateExam)
  .delete(requireRole('admin'), examCtrl.deleteExam);

// Exam submission
router.post('/:id/submissions', 
  requireRole('student'), 
  validate(submissionValidator.createSubmissionSchema), 
  examCtrl.submitExam
);

// Exam management routes
router.post('/:id/publish', requireRole('teacher', 'admin'), examCtrl.publishExam);
router.post('/:id/schedule', requireRole('teacher', 'admin'), validate(examValidator.scheduleExamSchema), examCtrl.scheduleExam);
router.post('/:id/start', requireRole('student'), examCtrl.startExam);

// Submissions routes
router.get('/:id/submissions', requireRole('teacher'), examCtrl.getExamSubmissions);
router.post('/:id/submit', requireRole('student'), validate(examValidator.submitExamSchema), examCtrl.submitExam);
router.get('/:id/results', requireRole('student'), examCtrl.getStudentExamResult);

module.exports = router;
