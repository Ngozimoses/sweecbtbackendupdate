// routes/student.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const studentCtrl = require('../controllers/student.controller');

// ✅ EXISTING: Exam history for current user
router.get('/me/exam-history', authMiddleware('student'), studentCtrl.getMyExamHistory);
// ✅ ADD THESE MISSING ROUTES:
router.get('/me/upcoming-exams', authMiddleware('student'), studentCtrl.getUpcomingExams);
router.get('/me/recent-results', authMiddleware('student'), studentCtrl.getRecentResults);
router.get('/me/performance', authMiddleware('student'), studentCtrl.getPerformance);

// Keep existing :id routes for admin access
router.get('/:id/exam-history', authMiddleware(['admin', 'student']), studentCtrl.getExamHistory);
router.get('/:id/upcoming-exams', authMiddleware(['admin', 'student']), studentCtrl.getUpcomingExams);
router.get('/:id/recent-results', authMiddleware(['admin', 'student']), studentCtrl.getRecentResults);
router.get('/:id/performance', authMiddleware(['admin', 'student']), studentCtrl.getPerformance);
router.get('/:id/exam-result/:examId', authMiddleware(['admin', 'student']), studentCtrl.getExamResult);

module.exports = router;