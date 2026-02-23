// routes/submission.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const submissionCtrl = require('../controllers/submission.controller');

router.get('/:id/details', protect, submissionCtrl.getSubmissionWithDetails);
// In submission.routes.js, add:
router.delete('/:id', protect, requireRole('teacher', 'admin'), submissionCtrl.deleteSubmission);
router.patch('/:id/auto-save', protect, requireRole('student'), submissionCtrl.autoSave);

module.exports = router;