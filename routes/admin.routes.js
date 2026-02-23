const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const adminCtrl = require('../controllers/admin.controller');

// All admin routes are protected and require admin role
router.use(protect);
router.use(requireRole('admin'));

/**
 * @route   GET /api/admin/stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/stats', adminCtrl.getDashboardStats);

/**
 * @route   GET /api/admin/exam-trend
 * @desc    Get exam trend data for charts
 * @access  Private (Admin only)
 */
router.get('/exam-trend', adminCtrl.getExamTrend);

/**
 * @route   GET /api/admin/user-distribution
 * @desc    Get user distribution by role
 * @access  Private (Admin only)
 */
router.get('/user-distribution', adminCtrl.getUserDistribution);

/**
 * @route   GET /api/admin/subject-performance
 * @desc    Get subject performance metrics
 * @access  Private (Admin only)
 */
router.get('/subject-performance', adminCtrl.getSubjectPerformance);

module.exports = router;