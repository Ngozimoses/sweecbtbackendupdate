const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const submissionCtrl = require('../controllers/submission.controller');

// All routes are protected
router.use(protect);

// Auto-save partial answers during exam
router.patch('/:id/auto-save', requireRole('student'), submissionCtrl.autoSave);

// Get submission details
router.get('/:id/details', requireRole('student', 'teacher', 'admin'), submissionCtrl.getSubmissionWithDetails);

// Delete submission (teacher/admin only)
router.delete('/:id', requireRole('teacher', 'admin'), submissionCtrl.deleteSubmission);

module.exports = router;