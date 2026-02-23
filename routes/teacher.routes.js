const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const teacherCtrl = require('../controllers/teacher.controller');

// All routes are protected
router.use(protect);

// Get pending submissions for a teacher
router.get('/:teacherId/pending-submissions', 
  requireRole('teacher', 'admin'), 
  teacherCtrl.getPendingSubmissions
);

// Get students taught by this teacher
router.get('/:teacherId/students', 
  requireRole('teacher', 'admin'), 
  teacherCtrl.getTeacherStudents
);

// Get class performance for teacher's classes
router.get('/:teacherId/performance', 
  requireRole('teacher', 'admin'), 
  teacherCtrl.getClassPerformance
);

module.exports = router;