const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const subjectValidator = require('../validators/subject.validator');
const subjectCtrl = require('../controllers/subject.controller');

// All routes are protected
router.use(protect);

router.route('/')
  .get(requireRole('admin', 'teacher'), subjectCtrl.getAllSubjects)
  .post(requireRole('admin'), validate(subjectValidator.createSubjectSchema), subjectCtrl.createSubject);

router.route('/:id')
  .get(requireRole('admin'), subjectCtrl.getSubjectById)
  .patch(requireRole('admin'), validate(subjectValidator.updateSubjectSchema), subjectCtrl.updateSubject)
  .delete(requireRole('admin'), subjectCtrl.deleteSubject);

module.exports = router;