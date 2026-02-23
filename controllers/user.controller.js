// controllers/user.controller.js
const User = require('../models/User');
const Class = require('../models/Class');
// controllers/user.controller.js

// Add these functions
const getTeacherStudents = async (req, res) => {
  try {
    // Find classes taught by this teacher
    const classes = await Class.find({ 
      teacher: req.params.teacherId 
    }).select('students');
    
    if (classes.length === 0) {
      return res.json([]);
    }

    // Get all student IDs from these classes
    const studentIds = classes.flatMap(cls => cls.students);
    const students = await User.find({ 
      _id: { $in: studentIds },
      role: 'student'
    }).select('name email');

    res.json(students);
  } catch (error) {
    console.error('Teacher students error:', error);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
};
 
const getTeacherPerformance = async (req, res) => {
  try {
    // Implement logic
    res.json([]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

 
const getAllUsers = async (req, res) => {
  try {
    const { role, class: classId } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (classId) filter.class = classId;

    const users = await User.find(filter).select('-password -refreshToken');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
};
const createUser = async (req, res) => {
  try {
    const { class: classId, ...userData } = req.body;

    // Validate class if provided (for students)
    let finalClassId = null;
    if (classId && userData.role === 'student') {
      const cls = await Class.findById(classId);
      if (!cls) {
        return res.status(400).json({ message: 'Invalid class ID.' });
      }
      finalClassId = classId;
    }

    const user = new User({
      ...userData,
      class: finalClassId // ✅ Set class for student
    });

    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch user.' });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .select('-password -refreshToken');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user.' });
  }
};

const getCurrentUserClasses = async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const student = await User.findById(req.user?._id.toString()).populate('class', 'name code');
      return res.json(student.class ? [student.class] : []);
    }

    if (req.user.role === 'teacher') {
      const classes = await Class.find({ teacher: req.user?._id.toString() }).select('name code');
      return res.json(classes);
    }

    res.json([]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch classes.' });
  }
};
// Add this function to your user.controller.js
// Ensure bulkCreateUsers returns proper responses
const bulkCreateUsers = async (req, res) => {
  const { users } = req.body;
  const createdUsers = [];
  const errors = [];

  for (let i = 0; i < users.length; i++) {
    const userData = users[i];
    try {
      // Auto-generate username/password if not provided
      const username = userData.username || userData.email.split('@')[0];
      const password = userData.password || username;
      
      // Validate class if provided
      let classId = null;
      if (userData.classId) {
        const cls = await Class.findById(userData.classId);
        if (!cls) throw new Error(`Invalid class ID: ${userData.classId}`);
        classId = userData.classId;
      }

      const user = new User({
        name: userData.name,
        email: userData.email,
        password, // Will be hashed by pre-save hook
        role: 'student',
        class: classId
      });

      await user.save();
      createdUsers.push(user);
    } catch (error) {
      errors.push({
        index: i,
        email: userData.email,
        error: error.message
      });
    }
  }

  if (errors.length > 0) {
    return res.status(207).json({
      created: createdUsers,
      count: createdUsers.length,
      failed: errors.length,
      errors
    });
  }

  res.status(201).json({
    created: createdUsers,
    count: createdUsers.length
  });
};
module.exports = {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  getCurrentUserClasses,bulkCreateUsers, getTeacherStudents,
 
  getTeacherPerformance
};