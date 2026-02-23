const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const reportCtrl = require('../controllers/report.controller');

// All routes are protected
router.use(protect);

router.get('/system', requireRole('admin'), reportCtrl.getSystemReport);
router.get('/exams', requireRole('admin'), reportCtrl.getExamReport);
router.get('/users', requireRole('admin'), reportCtrl.getUserReport);
router.get('/custom', requireRole('admin'), reportCtrl.getCustomReport);

module.exports = router;