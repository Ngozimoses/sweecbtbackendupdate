const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const notificationValidator = require('../validators/notification.validator');
const notificationCtrl = require('../controllers/notification.controller');

// All routes are protected
router.use(protect);

// User notifications (accessible by all authenticated users)
router.get('/', requireRole('student', 'teacher', 'admin'), notificationCtrl.getUserNotifications);
router.post('/mark-read/:id', requireRole('student', 'teacher', 'admin'), notificationCtrl.markNotificationRead);
router.post('/mark-all-read', requireRole('student', 'teacher', 'admin'), notificationCtrl.markAllNotificationsRead);

// Admin/Teacher send notification
router.post('/send', requireRole('admin', 'teacher'), validate(notificationValidator.sendNotificationSchema), notificationCtrl.sendNotification);

module.exports = router;