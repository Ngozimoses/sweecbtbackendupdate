// controllers/class.controller.js
const Class = require('../models/Class');
const User = require('../models/User');
const Subject = require('../models/Subject'); // ✅ if used in controller

const classService = require('../services/class.service');
const getAllClasses = async (req, res) => {
  try {
    const classes = await Class.find().populate('teacher', 'name email');
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch classes.' });
  }
};
// Add these methods
const getClassSubjects = async (req, res) => {
  try {
    const subjects = await classService.getClassSubjects(req.params.id);
    res.json(subjects);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

const assignSubjectToClass = async (req, res) => {
  try {
    const { subjectId, teacherId } = req.body; // ← lowercase

    // Pass teacherId (not teacherID)
    const assignment = await classService.assignSubjectToClass(
      req.params.id,
      subjectId,
      teacherId || null // ← safe fallback
    );

    res.status(201).json(assignment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
const removeSubjectFromClass = async (req, res) => {
  try {
    const result = await classService.removeSubjectFromClass(
      req.params.classId,
      req.params.subjectId
    );
    res.json(result);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};
const createClass = async (req, res) => {
  try {
    const cls = await Class.create(req.body);
    res.status(201).json(cls);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// controllers/class.controller.js
const getClassById = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id)
      .populate('teacher', 'name email')
      .populate('students', 'name email')
      // ✅ CRITICAL: Populate subject names in assignments
      .populate('subjects.subject', 'name'); // This populates assignment.subject.name

    if (!cls) return res.status(404).json({ message: 'Class not found.' });

    // ✅ PERMISSION LOGIC (from previous fix)
    if (req.user.role === 'admin') {
      return res.json(cls);
    }
    if (req.user.role === 'teacher') {
      if (cls.teacher && cls.teacher._id.toString() === req.user.id) {
        return res.json(cls);
      }
      return res.status(403).json({ message: 'You can only view classes you teach.' });
    }
    if (req.user.role === 'student') {
      const isEnrolled = cls.students.some(student => 
        student._id.toString() === req.user?._id.toString()
      );
      if (isEnrolled) {
        return res.json(cls);
      }
      return res.status(403).json({ message: 'You are not enrolled in this class.' });
    }
    return res.status(403).json({ message: 'Access denied.' });
  } catch (error) {
    console.error('Get class error:', error);
    res.status(500).json({ message: 'Failed to fetch class.' });
  }
};

const updateClass = async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cls) return res.status(404).json({ message: 'Class not found.' });
    res.json(cls);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteClass = async (req, res) => {
  try {
    const cls = await Class.findByIdAndDelete(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found.' });
    res.json({ message: 'Class deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete class.' });
  }
};

const assignTeacher = async (req, res) => {
  try {
    const { teacherId } = req.body;
    const cls = await Class.findByIdAndUpdate(
      req.params.id,
      { teacher: teacherId },
      { new: true }
    ).populate('teacher', 'name');
    if (!cls) return res.status(404).json({ message: 'Class not found.' });
    res.json(cls);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
// controllers/class.controller.js
const getPublicClasses = async (req, res) => {
  try {
    // Only return safe fields: _id, name, code
    const classes = await Class.find()
      .select('_id name code')
      .populate('teacher', 'name'); // optional
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch classes.' });
  }
};
// Add these methods to your class controller
 
 

const enrollStudent = async (req, res) => {
  try {
    const { studentId } = req.body;
    const classId = req.params.id;

    // Validate student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // If student is already in another class, remove them from it first
    if (student.class && student.class.toString() !== classId) {
      await Class.findByIdAndUpdate(student.class, {
        $pull: { students: studentId }
      });
    }

    // 1. Add student to new class roster
    const cls = await Class.findByIdAndUpdate(
      classId,
      { $addToSet: { students: studentId } },
      { new: true }
    );
    if (!cls) return res.status(404).json({ message: 'Class not found.' });

    // 2. Update student's class reference
    await User.findByIdAndUpdate(studentId, {
      $set: { class: classId }
    });

    res.json(cls);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const enrollStudents = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const classId = req.params.id;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds must be a non-empty array' });
    }

    // Validate all students exist
    const students = await User.find({ _id: { $in: studentIds } });
    const validStudentIds = students.map(s => s._id.toString());

    if (validStudentIds.length !== studentIds.length) {
      return res.status(400).json({ message: 'One or more students not found.' });
    }

    // Remove students from their current classes (if any)
    const currentClassUpdates = students
      .filter(s => s.class && s.class.toString() !== classId)
      .map(s =>
        Class.findByIdAndUpdate(s.class, {
          $pull: { students: s._id }
        })
      );

    await Promise.all(currentClassUpdates);

    // 1. Add all students to new class
    const cls = await Class.findByIdAndUpdate(
      classId,
      { $addToSet: { students: { $each: validStudentIds } } },
      { new: true }
    );
    if (!cls) return res.status(404).json({ message: 'Class not found.' });

    // 2. Update all students' class reference
    await User.updateMany(
      { _id: { $in: validStudentIds } },
      { $set: { class: classId } }
    );

    res.status(200).json({ message: 'Students enrolled successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const unenrollStudents = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const classId = req.params.id;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds must be a non-empty array' });
    }

    // 1. Remove from class roster
    const cls = await Class.findByIdAndUpdate(
      classId,
      { $pull: { students: { $in: studentIds } } },
      { new: true }
    );
    if (!cls) return res.status(404).json({ message: 'Class not found.' });

    // 2. Clear the class reference from students (only if they belong to this class)
    await User.updateMany(
      { _id: { $in: studentIds }, class: classId },
      { $unset: { class: "" } }
    );

    res.status(200).json({ message: 'Students removed from class' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getAllClasses,
  createClass,
  getClassById,
  updateClass,
  deleteClass,
  assignTeacher,
  enrollStudent,getPublicClasses,removeSubjectFromClass,assignSubjectToClass,getClassSubjects,enrollStudents,unenrollStudents
};
