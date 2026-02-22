// controllers/notification.controller.js
const Notification = require('../models/Notification');
const User = require('../models/User');

const getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user?._id.toString() })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: 'Notification not found.' });
    res.json(notif);
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark as read.' });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user?._id.toString() }, { read: true });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark all as read.' });
  }
};

const sendNotification = async (req, res) => {
  try {
    const { userIds, title, message, type = 'general' } = req.body;

    const notifications = userIds.map(userId => ({
      user: userId,
      title,
      message,
      type
    }));

    await Notification.insertMany(notifications);
    res.status(201).json({ message: 'Notifications sent.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  sendNotification
};