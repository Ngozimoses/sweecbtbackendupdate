// routes/submission.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const submissionCtrl = require('../controllers/submission.controller');

// Auto-save partial answers during exam
router.patch('/:id/auto-save', authMiddleware('student'), submissionCtrl.autoSave);
module.exports = router;