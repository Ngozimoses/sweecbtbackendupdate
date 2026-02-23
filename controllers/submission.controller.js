// controllers/submission.controller.js
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const mongoose = require('mongoose'); 

// In controllers/submission.controller.js
const autoSave = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, timeSpent } = req.body;

    console.log('=== AUTO-SAVE DEBUG ===');
    console.log('Submission ID:', id);
    console.log('timeSpent received:', timeSpent, 'type:', typeof timeSpent);
    console.log('answers received:', answers ? answers.length : 0);

    // Validate required fields
    if (!answers) {
      return res.status(400).json({ message: 'Answers are required' });
    }

    if (timeSpent === undefined || timeSpent === null) {
      return res.status(400).json({ message: 'timeSpent is required' });
    }

    const submission = await Submission.findById(id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

<<<<<<< HEAD
    // Check authorization
    if (submission.student.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if exam is still in draft
    if (submission.status !== 'draft') {
      return res.status(400).json({ message: 'Cannot auto-save: exam already submitted' });
    }

    // Get exam to get max duration
    const exam = await Exam.findById(submission.exam);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const examDurationSeconds = (exam.duration || 10) * 60;
    console.log('Exam duration seconds:', examDurationSeconds);
    
    // Process timeSpent - ensure it's a number and within limits
    let finalTimeSpent = Number(timeSpent);
    
    // Check if it's a valid number
    if (isNaN(finalTimeSpent)) {
      console.error('Invalid timeSpent:', timeSpent);
      return res.status(400).json({ message: 'Invalid timeSpent value' });
    }

    // If timeSpent is greater than exam duration in seconds * 2, it's likely in milliseconds
    if (finalTimeSpent > examDurationSeconds * 2) {
      console.log('Converting timeSpent from ms to seconds:', finalTimeSpent);
      finalTimeSpent = Math.floor(finalTimeSpent / 1000);
    }
    
    // Ensure timeSpent doesn't exceed exam duration
    finalTimeSpent = Math.min(finalTimeSpent, examDurationSeconds);
    // Ensure it's not negative
    finalTimeSpent = Math.max(0, finalTimeSpent);
    
    console.log('Final timeSpent:', finalTimeSpent, 'seconds');

    // Update answers - ensure each answer has required fields
    const processedAnswers = answers.map(a => ({
      question: a.questionId,
      subQuestionId: a.subQuestionId || null,
      answer: a.answer || '',
      answerText: typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer || ''),
      isCorrect: null,
      awardedMarks: 0,
      reviewed: false
    }));

    submission.answers = processedAnswers;
    submission.timeSpent = finalTimeSpent;

    await submission.save();
    
    console.log('Auto-save successful for submission:', id);
    
    res.json({ 
      success: true,
      message: 'Auto-saved successfully',
      timeSpent: submission.timeSpent,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Auto-save error:', error);
    res.status(500).json({ 
      message: 'Auto-save failed', 
      error: error.message 
    });
  }
};
const deleteSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await Submission.findById(id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Check if user is authorized (teacher who created the exam or admin)
    const exam = await Exam.findById(submission.exam);
    if (exam.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Submission.findByIdAndDelete(id);
    
    res.json({ message: 'Submission deleted successfully' });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ message: 'Failed to delete submission' });
  }
};

 
// In controllers/submission.controller.js
const getSubmissionWithDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await Submission.findById(id)
      .populate('exam', 'title subject duration totalMarks')
      .populate('exam.subject', 'name code')
      .populate('student', 'name email')
      .populate('answers.question', 'text type options diagrams passage comprehensionQuestions')
      .populate('gradedBy', 'name');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Check authorization - allow if:
    // 1. Student owns the submission
    // 2. Teacher created the exam
    // 3. User is admin
    const isStudent = submission.student._id.toString() === req.user.id;
    const exam = await Exam.findById(submission.exam);
    const isTeacher = exam && exam.createdBy.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isStudent && !isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ message: 'Failed to fetch submission' });
  }
};
// NEW: Grade a specific answer (for manual grading)
const gradeAnswer = async (req, res) => {
  try {
    const { submissionId, answerId } = req.params;
    const { awardedMarks, reviewed, feedback } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Check if user is authorized to grade (teacher who created exam or admin)
    const exam = await Exam.findById(submission.exam);
    if (exam.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const answer = submission.answers.id(answerId);
    if (!answer) {
      return res.status(404).json({ message: 'Answer not found' });
    }

    answer.awardedMarks = awardedMarks;
    answer.reviewed = reviewed !== undefined ? reviewed : true;
    
    // Recalculate total score
    submission.totalScore = submission.answers.reduce((sum, ans) => sum + (ans.awardedMarks || 0), 0);
    
    // Check if all answers are reviewed
    const allReviewed = submission.answers.every(ans => ans.reviewed === true);
    if (allReviewed && submission.status === 'submitted') {
      submission.status = 'graded';
    }
    
    submission.gradedBy = req.user.id;
    submission.feedback = feedback || submission.feedback;

    await submission.save();
    
    res.json({
      message: 'Answer graded successfully',
      awardedMarks,
      totalScore: submission.totalScore,
      status: submission.status
    });
  } catch (error) {
    console.error('Grade answer error:', error);
    res.status(500).json({ message: 'Failed to grade answer' });
  }
};

// NEW: Bulk grade answers
const bulkGradeAnswers = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { grades } = req.body; // Array of { answerId, awardedMarks, reviewed }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const exam = await Exam.findById(submission.exam);
    if (exam.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    grades.forEach(grade => {
      const answer = submission.answers.id(grade.answerId);
      if (answer) {
        answer.awardedMarks = grade.awardedMarks;
        answer.reviewed = grade.reviewed !== undefined ? grade.reviewed : true;
      }
    });

    // Recalculate total score
    submission.totalScore = submission.answers.reduce((sum, ans) => sum + (ans.awardedMarks || 0), 0);
    
    // Check if all answers are reviewed
    const allReviewed = submission.answers.every(ans => ans.reviewed === true);
    if (allReviewed && submission.status === 'submitted') {
      submission.status = 'graded';
    }
    
    submission.gradedBy = req.user.id;

    await submission.save();
    
    res.json({
      message: `Graded ${grades.length} answers successfully`,
      totalScore: submission.totalScore,
      status: submission.status
    });
  } catch (error) {
    console.error('Bulk grade error:', error);
    res.status(500).json({ message: 'Failed to grade answers' });
  }
};

// NEW: Request reevaluation
const requestReevaluation = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { reason, questionIds } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (submission.student.toString() !== req.user.id) {
=======
    if (submission.student.toString() !== req.user?._id.toString()) {
>>>>>>> 64a66fbc9537bb0fdd595a1f0c1b5a1326ad6159
      return res.status(403).json({ message: 'Access denied' });
    }

    if (submission.status !== 'graded' && submission.status !== 'published') {
      return res.status(400).json({ message: 'Only graded exams can be reevaluated' });
    }

    submission.reevaluationRequested = true;
    submission.status = 'reeval-requested';
    
    // Mark specific questions for reevaluation
    if (questionIds && questionIds.length > 0) {
      questionIds.forEach(qId => {
        const answer = submission.answers.id(qId);
        if (answer) {
          answer.reviewed = false;
        }
      });
    }

    submission.feedback = reason || submission.feedback;

    await submission.save();
    
    res.json({
      message: 'Reevaluation requested successfully',
      status: submission.status
    });
  } catch (error) {
    console.error('Reevaluation request error:', error);
    res.status(500).json({ message: 'Failed to request reevaluation' });
  }
};

// NEW: Get submission statistics
const getSubmissionStats = async (req, res) => {
  try {
    const { examId } = req.params;

    const stats = await Submission.aggregate([
      { $match: { exam: mongoose.Types.ObjectId(examId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgScore: { $avg: '$totalScore' },
          totalStudents: { $sum: 1 }
        }
      }
    ]);

    const timeStats = await Submission.aggregate([
      { $match: { exam: mongoose.Types.ObjectId(examId), status: { $ne: 'draft' } } },
      {
        $group: {
          _id: null,
          avgTimeSpent: { $avg: '$timeSpent' },
          minTimeSpent: { $min: '$timeSpent' },
          maxTimeSpent: { $max: '$timeSpent' }
        }
      }
    ]);

    res.json({
      statusBreakdown: stats,
      timeStatistics: timeStats[0] || { avgTimeSpent: 0, minTimeSpent: 0, maxTimeSpent: 0 }
    });
  } catch (error) {
    console.error('Get submission stats error:', error);
    res.status(500).json({ message: 'Failed to fetch submission statistics' });
  }
};

module.exports = {
  autoSave,
  getSubmissionWithDetails,
  gradeAnswer,
  bulkGradeAnswers,
  requestReevaluation,deleteSubmission,
  getSubmissionStats
};