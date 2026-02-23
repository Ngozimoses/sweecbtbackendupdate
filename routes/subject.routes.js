// routes/subject.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole,authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const  subjectValidator = require('../validators/subject.validator');
const   subjectCtrl = require('../controllers/subject.controller');

router.route('/')
  .get(authMiddleware(['admin', 'teacher']), subjectCtrl.getAllSubjects)
  .post(authMiddleware('admin'), validate(subjectValidator.createSubjectSchema), subjectCtrl.createSubject);

router.route('/:id')
  .get(authMiddleware('admin'), subjectCtrl.getSubjectById)
  .patch(authMiddleware('admin'), validate(subjectValidator.updateSubjectSchema), subjectCtrl.updateSubject)
  .delete(authMiddleware('admin'), subjectCtrl.deleteSubject);

module.exports = router;