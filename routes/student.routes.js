const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const studentCtrl = require('../controllers/student.controller');

// All routes are protected
router.use(protect);

// ========================
// CURRENT USER ROUTES (using 'me')
// ========================

/**
 * @route   GET /api/students/me/exam-history
 * @desc    Get exam history for current student
 * @access  Private (Student only)
 */
router.get('/me/exam-history', 
  requireRole('student'), 
  studentCtrl.getMyExamHistory
);

/**
 * @route   GET /api/students/me/upcoming-exams
 * @desc    Get upcoming exams for current student
 * @access  Private (Student only)
 */
router.get('/me/upcoming-exams', 
  requireRole('student'), 
  studentCtrl.getUpcomingExams
);

/**
 * @route   GET /api/students/me/recent-results
 * @desc    Get recent results for current student
 * @access  Private (Student only)
 */
router.get('/me/recent-results', 
  requireRole('student'), 
  studentCtrl.getRecentResults
);

/**
 * @route   GET /api/students/me/performance
 * @desc    Get performance metrics for current student
 * @access  Private (Student only)
 */
router.get('/me/performance', 
  requireRole('student'), 
  studentCtrl.getPerformance
);

// ========================
// SPECIFIC STUDENT ROUTES (admin or self)
// ========================

/**
 * @route   GET /api/students/:id/exam-history
 * @desc    Get exam history for specific student
 * @access  Private (Admin or the student themselves)
 */
router.get('/:id/exam-history', 
  requireRole('admin', 'student'), 
  studentCtrl.getExamHistory
);

/**
 * @route   GET /api/students/:id/upcoming-exams
 * @desc    Get upcoming exams for specific student
 * @access  Private (Admin or the student themselves)
 */
router.get('/:id/upcoming-exams', 
  requireRole('admin', 'student'), 
  studentCtrl.getUpcomingExams
);

/**
 * @route   GET /api/students/:id/recent-results
 * @desc    Get recent results for specific student
 * @access  Private (Admin or the student themselves)
 */
router.get('/:id/recent-results', 
  requireRole('admin', 'student'), 
  studentCtrl.getRecentResults
);

/**
 * @route   GET /api/students/:id/performance
 * @desc    Get performance metrics for specific student
 * @access  Private (Admin or the student themselves)
 */
router.get('/:id/performance', 
  requireRole('admin', 'student'), 
  studentCtrl.getPerformance
);

/**
 * @route   GET /api/students/:id/exam-result/:examId
 * @desc    Get specific exam result for a student
 * @access  Private (Admin or the student themselves)
 */
router.get('/:id/exam-result/:examId', 
  requireRole('admin', 'student'), 
  studentCtrl.getExamResult
);

module.exports = router;