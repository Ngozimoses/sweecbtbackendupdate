const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');  // ✅ Fixed import
const teacherCtrl = require('../controllers/teacher.controller');

// ✅ Use authMiddleware correctly
// router.use(authMiddleware(['teacher', 'admin']));

// Handle /me routes (uses req.user.id)
// router.get('/me/pending-submissions', (req, res) => {
//   req.params.teacherId = req.user.id;
//   return teacherCtrl.getPendingSubmissions(req, res);
// });

// router.get('/me/students', (req, res) => {
//   req.params.teacherId = req.user.id;
//   return teacherCtrl.getTeacherStudents(req, res);
// });

// router.get('/me/performance', (req, res) => {
//   req.params.teacherId = req.user.id;
//   return teacherCtrl.getClassPerformance(req, res);
// });

// Keep existing :teacherId routes for admin access
router.get('/:teacherId/pending-submissions', authMiddleware(['teacher', 'admin']),teacherCtrl.getPendingSubmissions);
router.get('/:teacherId/students',authMiddleware(['teacher', 'admin']), teacherCtrl.getTeacherStudents);
router.get('/:teacherId/performance', authMiddleware(['teacher', 'admin']), teacherCtrl.getClassPerformance);

module.exports = router;
