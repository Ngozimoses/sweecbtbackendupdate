const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const uploadCtrl = require('../controllers/upload.controller');

// All routes are protected
router.use(protect);

// Exam answer upload (student)
router.post(
  '/exam-answer',
  requireRole('student'),
  upload.single('file'),
  handleUploadError,
  uploadCtrl.uploadExamAnswer
);

// Study material upload (teacher)
router.post(
  '/material',
  requireRole('teacher', 'admin'),
  upload.single('file'),
  handleUploadError,
  uploadCtrl.uploadMaterial
);

// File download
router.get('/:fileId', requireRole('teacher', 'admin'), uploadCtrl.downloadFile);

module.exports = router;