// routes/upload.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const   uploadCtrl = require('../controllers/upload.controller');

// Exam answer upload (student)
router.post(
  '/exam-answer',
  authMiddleware('student'),
  upload.single('file'),
  handleUploadError,
  uploadCtrl.uploadExamAnswer
);

// Study material upload (teacher)
router.post(
  '/material',
  authMiddleware(['teacher', 'admin']),
  upload.single('file'),
  handleUploadError,
  uploadCtrl.uploadMaterial
);

// File download
router.get('/:fileId', authMiddleware(['teacher', 'admin']), uploadCtrl.downloadFile);

module.exports = router;