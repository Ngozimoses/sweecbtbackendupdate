const Material = require('../models/Material');
const Class = require('../models/Class');
const User = require('../models/User');
const Subject = require('../models/Subject');
const path = require('path');
const fs = require('fs');
const {
  getFileType,
  isValidFileType,
  formatFileSize,
  cleanupFile
} = require('../utils/fileUpload');

// Serve static files route (add this to your server.js later)
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5000';

// Admin: Get all materials in store (general materials)
const getMaterialsStore = async (req, res) => {
  try {
    const { page = 1, limit = 20, subject, type, status = 'active' } = req.query;
    
    const filter = { class: null, status };
    if (subject) filter.subject = subject;
    if (type) filter.type = type;

    const materials = await Material.find(filter)
      .populate('subject', 'name')
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Material.countDocuments(filter);

    res.json({
      materials,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get materials store error:', error);
    res.status(500).json({ message: 'Failed to fetch materials store' });
  }
};

// Admin: Add material to store
const addMaterialToStore = async (req, res) => {
  try {
    const { title, description, type, subject, externalUrl } = req.body;
    
    // Validate required fields
    if (!title || (!req.file && !externalUrl)) {
      return res.status(400).json({ message: 'Title and file/URL are required' });
    }

    // Handle external URL
    if (externalUrl) {
      const material = new Material({
        title,
        description,
        type: type || 'link',
        subject,
        externalUrl,
        uploadedBy: req.user?._id.toString(),
        uploadedByRole: req.user.role,
        class: null
      });

      await material.save();
      const populatedMaterial = await Material.findById(material._id)
        .populate('subject', 'name')
        .populate('uploadedBy', 'name email');
      
      return res.status(201).json(populatedMaterial);
    }

    // Handle file upload
    if (req.file) {
      const file = req.file;
      
      // Validate file type
      if (!isValidFileType(file.mimetype)) {
        return res.status(400).json({ 
          message: 'Invalid file type. Only PDF, DOC, PPT, XLS, TXT, CSV, JPG, PNG, GIF, MP4, MOV, MP3, WAV files are allowed.' 
        });
      }

      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        cleanupFile(file.path);
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }

      const fileUrl = `${PUBLIC_URL}/uploads/materials/${file.filename}`;
      const fileSize = file.size;
      const fileType = getFileType(file.mimetype);

      const material = new Material({
        title,
        description,
        type: type || fileType,
        subject,
        fileUrl,
        fileSize,
        uploadedBy: req.user?._id.toString(),
        uploadedByRole: req.user.role,
        class: null
      });

      await material.save();

      const populatedMaterial = await Material.findById(material._id)
        .populate('subject', 'name')
        .populate('uploadedBy', 'name email');

      res.status(201).json(populatedMaterial);
    }
  } catch (error) {
    console.error('Add material to store error:', error);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      cleanupFile(req.file.path);
    }
    
    res.status(500).json({ message: error.message || 'Failed to add material to store' });
  }
};

// Admin: Remove material from store
const removeMaterialFromStore = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    
    if (!material || material.class) {
      return res.status(404).json({ message: 'Material not found in store' });
    }

    // Clean up file if it exists
    if (material.fileUrl && material.fileUrl.includes('/uploads/')) {
      const filename = material.fileUrl.split('/').pop();
      const filePath = path.join(__dirname, '../uploads/materials', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: 'Material removed from store successfully' });
  } catch (error) {
    console.error('Remove material from store error:', error);
    res.status(500).json({ message: 'Failed to remove material from store' });
  }
};

// Teacher: Get materials for their assigned classes
const getTeacherClassMaterials = async (req, res) => {
  try {
    const teacherId = req.user?._id.toString();
    
    // Get classes assigned to this teacher
    const classes = await Class.find({ 
      'teachers.teacher': teacherId 
    }).select('_id');

    if (classes.length === 0) {
      return res.json([]);
    }

    const classIds = classes.map(cls => cls._id);
    const { classId, subject, type, status = 'active' } = req.query;
    
    const filter = { 
      class: { $in: classIds },
      status 
    };
    
    if (classId) filter.class = classId;
    if (subject) filter.subject = subject;
    if (type) filter.type = type;

    const materials = await Material.find(filter)
      .populate('class', 'name code')
      .populate('subject', 'name')
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(materials);
  } catch (error) {
    console.error('Get teacher class materials error:', error);
    res.status(500).json({ message: 'Failed to fetch class materials' });
  }
};

// Teacher: Add material to specific class
const addClassMaterial = async (req, res) => {
  try {
    const { classId, title, description, type, subject, externalUrl } = req.body;
    
    // Verify teacher has access to this class
    const classDoc = await Class.findOne({ 
      _id: classId,
      'teachers.teacher':req.user?._id.toString() 
    });
    
    if (!classDoc) {
      return res.status(403).json({ message: 'Access denied: You are not assigned to this class' });
    }

    if (!title || (!req.file && !externalUrl)) {
      return res.status(400).json({ message: 'Title and file/URL are required' });
    }

    // Handle external URL
    if (externalUrl) {
      const material = new Material({
        title,
        description,
        type: type || 'link',
        subject,
        class: classId,
        externalUrl,
        uploadedBy: req.user?._id.toString(),
        uploadedByRole: req.user.role
      });

      await material.save();
      const populatedMaterial = await Material.findById(material._id)
        .populate('class', 'name code')
        .populate('subject', 'name')
        .populate('uploadedBy', 'name email');
      
      return res.status(201).json(populatedMaterial);
    }

    // Handle file upload
    if (req.file) {
      const file = req.file;
      
      if (!isValidFileType(file.mimetype)) {
        return res.status(400).json({ 
          message: 'Invalid file type. Only PDF, DOC, PPT, XLS, TXT, CSV, JPG, PNG, GIF, MP4, MOV, MP3, WAV files are allowed.' 
        });
      }

      if (file.size > 10 * 1024 * 1024) {
        cleanupFile(file.path);
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }

      const fileUrl = `${PUBLIC_URL}/uploads/materials/${file.filename}`;
      const fileSize = file.size;
      const fileType = getFileType(file.mimetype);

      const material = new Material({
        title,
        description,
        type: type || fileType,
        subject,
        class: classId,
        fileUrl,
        fileSize,
        uploadedBy: req.user.id,
        uploadedByRole: req.user.role
      });

      await material.save();

      const populatedMaterial = await Material.findById(material._id)
        .populate('class', 'name code')
        .populate('subject', 'name')
        .populate('uploadedBy', 'name email');

      res.status(201).json(populatedMaterial);
    }
  } catch (error) {
    console.error('Add class material error:', error);
    
    if (req.file && req.file.path) {
      cleanupFile(req.file.path);
    }
    
    res.status(500).json({ message: error.message || 'Failed to add class material' });
  }
};

// Teacher: Remove class material
const removeClassMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    
    if (!material || !material.class) {
      return res.status(404).json({ message: 'Class material not found' });
    }

    // Verify teacher has access to this class
    const classDoc = await Class.findOne({ 
      _id: material.class,
      'teachers.teacher': req.user?._id.toString() 
    });
    
    if (!classDoc) {
      return res.status(403).json({ message: 'Access denied: You are not assigned to this class' });
    }

    // Clean up file
    if (material.fileUrl && material.fileUrl.includes('/uploads/')) {
      const filename = material.fileUrl.split('/').pop();
      const filePath = path.join(__dirname, '../uploads/materials', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Material.findByIdAndDelete(req.params.id);
    res.json({ message: 'Class material removed successfully' });
  } catch (error) {
    console.error('Remove class material error:', error);
    res.status(500).json({ message: 'Failed to remove class material' });
  }
};

// Student: Get materials for their class
const getStudentClassMaterials = async (req, res) => {
  try {
    const student = await User.findById(req.user?._id.toString()).select('class');
    
    if (!student.class) {
      return res.json([]);
    }

    const { subject, type, status = 'active' } = req.query;
    
    const filter = { 
      class: student.class,
      status 
    };
    
    if (subject) filter.subject = subject;
    if (type) filter.type = type;

    const materials = await Material.find(filter)
      .populate('class', 'name code')
      .populate('subject', 'name')
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(materials);
  } catch (error) {
    console.error('Get student class materials error:', error);
    res.status(500).json({ message: 'Failed to fetch class materials' });
  }
};

// Get material by ID (for download/viewing)
const getMaterialById = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    
    if (!material || material.status !== 'active') {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Check access permissions
    if (material.class) {
      if (req.user.role === 'student') {
        const user = await User.findById(req.user?._id.toString()).select('class');
        if (user.class?.toString() !== material.class.toString()) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else if (req.user.role === 'teacher') {
        const classDoc = await Class.findOne({ 
          _id: material.class,
          'teachers.teacher': req.user?._id.toString() 
        });
        if (!classDoc) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
    }

    const populatedMaterial = await Material.findById(material._id)
      .populate('class', 'name code')
      .populate('subject', 'name')
      .populate('uploadedBy', 'name');

    res.json(populatedMaterial);
  } catch (error) {
    console.error('Get material by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch material' });
  }
};

// Download material
const downloadMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    
    if (!material) {
      return res.status(404).json({ message: 'Material not found' });
    }

    // Check access permissions
    if (material.class) {
      if (req.user.role === 'student') {
        const user = await User.findById(req.user?._id.toString()).select('class');
        if (user.class?.toString() !== material.class.toString()) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else if (req.user.role === 'teacher') {
        const classDoc = await Class.findOne({ 
          _id: material.class,
          'teachers.teacher': req.user?._id.toString()
        });
        if (!classDoc) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
    }

    // Handle external URL
    if (material.externalUrl) {
      return res.redirect(material.externalUrl);
    }

    // Handle local file
    if (material.fileUrl && material.fileUrl.includes('/uploads/')) {
      const filename = material.fileUrl.split('/').pop();
      const filePath = path.join(__dirname, '../uploads/materials', filename);
      
      if (fs.existsSync(filePath)) {
        return res.download(filePath, filename);
      }
    }

    return res.status(404).json({ message: 'File not found' });
  } catch (error) {
    console.error('Download material error:', error);
    res.status(500).json({ message: 'Failed to download material' });
  }
};

module.exports = {
  getMaterialsStore,
  addMaterialToStore,
  removeMaterialFromStore,
  getTeacherClassMaterials,
  addClassMaterial,
  removeClassMaterial,
  getStudentClassMaterials,
  getMaterialById,
  downloadMaterial
};