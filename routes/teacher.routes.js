// routes/teacher.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const teacherCtrl = require('../controllers/teacher.controller');

router.use(protect);
router.use(authMiddleware(['teacher', 'admin']));
// Handle /me routes (uses req.user.id)
router.get('/me/pending-submissions', (req, res) => {
  req.params.teacherId = req.user.id;
  return teacherCtrl.getPendingSubmissions(req, res);
});

router.get('/me/students', (req, res) => {
  req.params.teacherId = req.user.id;
  return teacherCtrl.getTeacherStudents(req, res);
});

router.get('/me/performance', (req, res) => {
  req.params.teacherId = req.user.id;
  return teacherCtrl.getClassPerformance(req, res);
});

// Keep existing :teacherId routes for admin access
router.get('/:teacherId/pending-submissions', teacherCtrl.getPendingSubmissions);
router.get('/:teacherId/students', teacherCtrl.getTeacherStudents);
router.get('/:teacherId/performance', teacherCtrl.getClassPerformance);

module.exports = router;