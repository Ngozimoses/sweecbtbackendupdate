// routes/material.routes.js
const express = require('express');
const router = express.Router();
const { protect, requireRole ,authMiddleware} = require('../middleware/auth');
const materialCtrl = require('../controllers/material.controller');
const { singleFileUpload, handleUploadError } = require('../middleware/upload');

// Admin: Materials Store
router.get('/store', 
  authMiddleware('admin'), 
  materialCtrl.getMaterialsStore
);

router.post('/store', 
 
  authMiddleware('admin'), 
  singleFileUpload, 
  handleUploadError,
  materialCtrl.addMaterialToStore
);

router.delete('/store/:id', 
  authMiddleware('admin'), 
  materialCtrl.removeMaterialFromStore
);


module.exports = router;