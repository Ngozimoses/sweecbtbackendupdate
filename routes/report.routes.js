// routes/report.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const   reportCtrl = require('../controllers/report.controller');

router.get('/system', authMiddleware('admin'), reportCtrl.getSystemReport);
router.get('/exams', authMiddleware('admin'), reportCtrl.getExamReport);
router.get('/users', authMiddleware('admin'), reportCtrl.getUserReport);
router.get('/custom', authMiddleware('admin'), reportCtrl.getCustomReport);

module.exports = router;