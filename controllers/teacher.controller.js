// controllers/teacher.controller.js
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const Class = require('../models/Class');
const User = require('../models/User');
const Subject = require('../models/Subject');

// Get pending submissions for a teacher's exams
const getPendingSubmissions = async (req, res) => {
  try {
    const teacherId = req.user?._id.toString();
    
    // Find all exams created by this teacher
    const exams = await Exam.find({ 
      createdBy: teacherId
    }).select('_id');
    
    if (exams.length === 0) {
      return res.json([]);
    }

    // Find ungraded submissions for these exams
    const examIds = exams.map(e => e._id);
    const submissions = await Submission.find({
      exam: { $in: examIds },
      status: 'submitted' // Only ungraded submissions
    })
    .populate('exam', 'title')
    .populate('student', 'name email');

    res.json(submissions);
  } catch (error) {
    console.error('Pending submissions error:', error);
    res.status(500).json({ message: 'Failed to fetch pending submissions' });
  }
};

// Get all students taught by this teacher
const getTeacherStudents = async (req, res) => {
  try {
    const teacherId = req.user?._id.toString();
    
    // Find classes where this teacher is assigned
    const classes = await Class.find({ 
      teacher: teacherId 
    }).select('students');
    
    if (classes.length === 0) {
      return res.json([]);
    }

    // Get all student IDs from these classes
    const studentIds = classes.flatMap(cls => cls.students);
    const students = await User.find({ 
      _id: { $in: studentIds },
      role: 'student'
    }).select('name email class');

    res.json(students);
  } catch (error) {
    console.error('Teacher students error:', error);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
};

// Get class performance (subject-wise average scores)
const getClassPerformance = async (req, res) => {
  try {
    const teacherId = req.user?._id.toString();
    
    // Get teacher's classes
    const classes = await Class.find({ teacher: teacherId });
    if (classes.length === 0) {
      return res.json([]);
    }

    const classIds = classes.map(c => c._id);
    
    // Get all exams for these classes
    const exams = await Exam.find({ 
      class: { $in: classIds }
    }).select('_id subject');
    
    if (exams.length === 0) {
      return res.json([]);
    }

    const examIds = exams.map(e => e._id);
    
    // Get all GRADED submissions
    const submissions = await Submission.find({
      exam: { $in: examIds },
      status: 'graded'
    }).populate('exam', 'subject');

    if (submissions.length === 0) {
      return res.json([]);
    }

    // Group by subject
    const subjectMap = {};
    submissions.forEach(sub => {
      const subjectId = sub.exam.subject.toString();
      if (!subjectMap[subjectId]) {
        subjectMap[subjectId] = { total: 0, count: 0 };
      }
      subjectMap[subjectId].total += sub.totalScore;
      subjectMap[subjectId].count += 1;
    });

    // Get subject names
    const subjectIds = Object.keys(subjectMap);
    const subjects = await Subject.find({ _id: { $in: subjectIds } });
    const subjectNames = {};
    subjects.forEach(s => {
      subjectNames[s._id.toString()] = s.name;
    });

    const performance = Object.entries(subjectMap).map(([id, data]) => ({
      name: subjectNames[id] || 'General',
      averageScore: data.count > 0 ? data.total / data.count : 0
    }));

    res.json(performance);
  } catch (error) {
    console.error('Performance error:', error);
    res.status(500).json({ message: 'Failed to fetch performance data' });
  }
};

module.exports = {
  getPendingSubmissions,
  getTeacherStudents,
  getClassPerformance
};