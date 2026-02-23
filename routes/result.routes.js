const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const resultValidator = require('../validators/result.validator');
const resultCtrl = require('../controllers/result.controller');

// All routes are protected
router.use(protect);

// General results access
router.get('/', 
  requireRole('student', 'teacher', 'admin'), 
  resultCtrl.getAllResults
);

router.get('/exam/:examId', 
  requireRole('student', 'teacher', 'admin'), 
  resultCtrl.getExamResults
);

router.get('/student/:studentId', 
  requireRole('student', 'teacher', 'admin'), 
  resultCtrl.getStudentResults
);

router.get('/class/:classId', 
  requireRole('student', 'teacher', 'admin'), 
  resultCtrl.getClassResults
);

// Single grading endpoint
router.patch('/:id/grade', 
  requireRole('teacher'), 
  validate(resultValidator.gradeSubmissionSchema), 
  resultCtrl.gradeSubmission
);

// Publishing & re-evaluation
router.post('/exam/:examId/publish', 
  requireRole('teacher'), 
  resultCtrl.publishExamResults
);

router.post('/:submissionId/reevaluate', 
  requireRole('student'), 
  resultCtrl.requestReevaluation
);

// Analytics & export
router.get('/analytics', 
  requireRole('student', 'teacher', 'admin'), 
  resultCtrl.getAnalytics
);

router.get('/exam/:examId/export', 
  requireRole('student', 'teacher', 'admin'), 
  resultCtrl.exportExamResults
);

module.exports = router;