// routes/submission.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const submissionCtrl = require('../controllers/submission.controller');

<<<<<<< HEAD
router.get('/:id/details', protect, submissionCtrl.getSubmissionWithDetails);
// In submission.routes.js, add:
router.delete('/:id', protect, requireRole('teacher', 'admin'), submissionCtrl.deleteSubmission);
router.patch('/:id/auto-save', protect, requireRole('student'), submissionCtrl.autoSave);

=======
// Auto-save partial answers during exam
router.patch('/:id/auto-save', authMiddleware('student'), submissionCtrl.autoSave);
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159
module.exports = router;