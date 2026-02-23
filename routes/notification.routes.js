// routes/notification.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const  notificationValidator = require('../validators/notification.validator');
const   notificationCtrl = require('../controllers/notification.controller');

// User notifications
router.get('/', authMiddleware(['student', 'teacher', 'admin']), notificationCtrl.getUserNotifications);
router.post('/mark-read/:id', authMiddleware(['student', 'teacher', 'admin']), notificationCtrl.markNotificationRead);
router.post('/mark-all-read', authMiddleware(['student', 'teacher', 'admin']), notificationCtrl.markAllNotificationsRead);

// Admin/Teacher send notification
router.post('/send', authMiddleware(['admin', 'teacher']), validate(notificationValidator.sendNotificationSchema), notificationCtrl.sendNotification);

module.exports = router;