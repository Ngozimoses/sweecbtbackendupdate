// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const adminCtrl = require('../controllers/admin.controller');

// router.use(protect);
router.use(authMiddleware);
router.get('/stats', adminCtrl.getDashboardStats);
router.get('/exam-trend', adminCtrl.getExamTrend);
router.get('/user-distribution', adminCtrl.getUserDistribution);
router.get('/subject-performance', adminCtrl.getSubjectPerformance);

module.exports = router;