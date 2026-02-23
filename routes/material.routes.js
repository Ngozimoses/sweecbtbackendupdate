const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const materialCtrl = require('../controllers/material.controller');
const { singleFileUpload, handleUploadError } = require('../middleware/upload');

// All routes are protected
router.use(protect);

// Admin: Materials Store
router.get('/store', 
  requireRole('admin'), 
  materialCtrl.getMaterialsStore
);

router.post('/store', 
  requireRole('admin'), 
  singleFileUpload, 
  handleUploadError,
  materialCtrl.addMaterialToStore
);

router.delete('/store/:id', 
  requireRole('admin'), 
  materialCtrl.removeMaterialFromStore
);

module.exports = router;