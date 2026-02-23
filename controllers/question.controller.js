// controllers/question.controller.js 
const mongoose = require('mongoose');
const Question = require('../models/Question');
const Subject = require('../models/Subject');
const fs = require('fs');
const path = require('path');
// Add these methods
  
// controllers/question.controller.js - Add/Update these methods

const createQuestion = async (req, res) => {
  try {
    const questionData = { ...req.body, createdBy: req.user.id };
    
    // Handle comprehension passages specially
    if (questionData.type === 'comprehension') {
      // Ensure comprehensionQuestions have proper structure
      if (questionData.comprehensionQuestions) {
        questionData.comprehensionQuestions = questionData.comprehensionQuestions.map(q => ({
          ...q,
          _id: q._id || new mongoose.Types.ObjectId()
        }));
      }
    }
    
    const question = await Question.create(questionData);
    
    // Populate for response
    const populatedQuestion = await Question.findById(question._id)
      .populate('subject', 'name code');
      
    res.status(201).json(populatedQuestion);
  } catch (error) {
    console.error('Create question error:', error);
    res.status(400).json({ message: error.message });
  }
};

const getQuestionBank = async (req, res) => {
  try {
    const { subject } = req.query;
    const filter = { createdBy: req.user.id };
    
    if (subject && mongoose.Types.ObjectId.isValid(subject)) {
      filter.subject = new mongoose.Types.ObjectId(subject);
    }

    const questions = await Question.find(filter)
      .populate('subject', 'name code')
      .select('text type options points subject difficulty diagrams imageUrl passage comprehensionQuestions totalMarks')
      .sort({ createdAt: -1 });

    res.json(questions);
  } catch (error) {
    console.error('Get question bank error:', error);
    res.status(500).json({ message: 'Failed to fetch question bank' });
  }
};

const getQuestionById = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('subject', 'name code');
      
    if (!question) {
      return res.status(404).json({ message: 'Question not found.' });
    }

    // Check ownership or sharing
    if (
      question.createdBy.toString() !== req.user.id &&
      !question.sharedWith.includes(req.user.id) &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json(question);
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ message: 'Failed to fetch question.' });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Question not found.' });
    }

    if (question.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Handle comprehension questions
    if (req.body.type === 'comprehension' && req.body.comprehensionQuestions) {
      req.body.comprehensionQuestions = req.body.comprehensionQuestions.map(q => ({
        ...q,
        _id: q._id || new mongoose.Types.ObjectId()
      }));
    }

    Object.assign(question, req.body);
    await question.save();
    
    const updatedQuestion = await Question.findById(question._id)
      .populate('subject', 'name code');
      
    res.json(updatedQuestion);
  } catch (error) {
    console.error('Update question error:', error);
    res.status(400).json({ message: error.message });
  }
};
// Add this method
const getQuestionsByIds = async (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) {
      return res.status(400).json({ message: 'Question IDs are required' });
    }

    const idArray = Array.isArray(ids) ? ids : ids.split(',');
    const questions = await Question.find({ 
      _id: { $in: idArray },
      createdBy: req.user.id // Only allow teacher to access their own questions
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
 
const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Security check
    if (req.user.role === 'teacher' && question.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // 🔥 Check if question is used in any exam
    const examCount = await Exam.countDocuments({
      'questions.question': question._id
    });

    if (examCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete: question is used in ${examCount} exam(s).`
      });
    }

    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const importQuestions = async (req, res) => {
  // Simplified: assume CSV parsing logic exists
  res.status(501).json({ message: 'Import not implemented.' });
};

const exportQuestions = async (req, res) => {
  // Simplified
  res.status(501).json({ message: 'Export not implemented.' });
};
// Add this method
const getTeacherQuestions = async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Security: Teachers can only access their own questions
    if (req.user.role === 'teacher' && req.user.id !== teacherId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const questions = await Question.find({ 
      createdBy: teacherId 
    })
    .populate('subject', 'name code')
    .sort({ createdAt: -1 });

    res.json(questions);
  } catch (error) {
    console.error('Get teacher questions error:', error);
    res.status(500).json({ message: 'Failed to fetch questions' });
  }
};
// Add these methods


const getTeacherSubjects = async (req, res) => {
  try {
    // For teachers: get subjects they teach
    if (req.user.role === 'teacher') {
      // Get classes taught by teacher
      const classes = await Class.find({ 
        $or: [
          { teacher: req.user.id },
          { 'subjects.teacher': req.user.id }
        ]
      }).distinct('subjects.subject');
      
      // Get unique subjects
      const subjects = await Subject.find({ 
        _id: { $in: classes }
      });
      res.json(subjects);
    } else {
      // Admins see all subjects
      const subjects = await Subject.find();
      res.json(subjects);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const shareQuestion = async (req, res) => {
  try {
    const { teacherIds } = req.body;
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found.' });

    if (question.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only owner can share.' });
    }

    question.sharedWith = [...new Set([...question.sharedWith, ...teacherIds])];
    await question.save();
    res.json(question);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createQuestion,
  getQuestionBank,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  importQuestions,
  exportQuestions,
  shareQuestion,getQuestionsByIds,getTeacherQuestions,getTeacherSubjects
};