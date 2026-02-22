// controllers/result.controller.js
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const User = require('../models/User');
const resultService = require('../services/result.service');
const getAllResults = async (req, res) => {
  try {
    const filter = {};
    if (req.query.exam) filter.exam = req.query.exam;
    if (req.query.student) filter.student = req.query.student;
    if (req.query.class) {
      const students = await User.find({ class: req.query.class }, '_id');
      filter.student = { $in: students.map(s => s._id) };
    }

    const submissions = await Submission.find(filter)
      .populate('exam', 'title')
      .populate('student', 'name email')
      .populate('gradedBy', 'name');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch results.' });
  }
};

// controllers/result.controller.js
const getExamResults = async (req, res) => {
  try {
    const submissions = await Submission.find({ exam: req.params.examId })
      .populate('student', 'name')
      .populate('gradedBy', 'name')
      .populate('exam', 'title');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch exam results.' });
  }
};

const getStudentResults = async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.params.studentId })
      .populate('exam', 'title')
      .populate('gradedBy', 'name');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch student results.' });
  }
};

const getClassResults = async (req, res) => {
  try {
    const students = await User.find({ class: req.params.classId }, '_id');
    const submissions = await Submission.find({ student: { $in: students.map(s => s._id) } })
      .populate('exam', 'title')
      .populate('student', 'name')
      .populate('gradedBy', 'name');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch class results.' });
  }
};
// controllers/result.controller.js
// controllers/result.controller.js
const gradeSubmission = async (req, res) => {
  try {
    const { feedback, status, answers } = req.body;
    const { id: submissionId } = req.params;

    // Find submission
    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    // Update answers if provided
    if (answers && Array.isArray(answers)) {
      submission.answers = answers.map((updatedAns, index) => {
        const existingAns = submission.answers[index];
        if (existingAns) {
          return {
            ...existingAns.toObject(),
            awardedMarks: updatedAns.awardedMarks || 0,
            reviewed: updatedAns.reviewed !== undefined ? updatedAns.reviewed : true
          };
        }
        return existingAns;
      });
    }

    // ✅ FETCH EXAM TO GET QUESTION POINTS
    const exam = await Exam.findById(submission.exam).select('questions totalMarks');
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found.' });
    }

    // ✅ RECALCULATE TOTAL SCORE FROM AWARDED MARKS
    let totalScore = 0;
    submission.answers.forEach((ans) => {
      // Find the question reference in the exam
      const examQuestionRef = exam.questions.find(
        eq => eq.question.toString() === ans.question.toString()
      );
      const points = examQuestionRef ? examQuestionRef.points : 1;

      if (ans.reviewed === true) {
        if (ans.awardedMarks !== undefined) {
          // Use teacher-assigned marks (clamped to max points)
          totalScore += Math.min(ans.awardedMarks, points);
        } else if (ans.isCorrect === true) {
          // Auto-graded correct answer
          totalScore += points;
        }
        // If isCorrect is false or awardedMarks is 0, add nothing
      }
      // If not reviewed, don't count it (shouldn't happen in 'graded' status)
    });

    // ✅ SAVE THE CORRECT TOTAL SCORE
    submission.totalScore = totalScore;
    submission.feedback = feedback;
    submission.status = status || 'graded';
    submission.gradedBy = req.user.id;
    
    await submission.save();

    res.json(submission);
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(400).json({ message: error.message });
  }
};

const publishExamResults = async (req, res) => {
  try {
    await Submission.updateMany(
      { exam: req.params.examId },
      { status: 'published' }
    );
    res.json({ message: 'Results published successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to publish results.' });
  }
};

const requestReevaluation = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission || submission.student.toString() !== req.user?._id.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    submission.reevaluationRequested = true;
    submission.status = 'reeval-requested';
    await submission.save();

    res.json({ message: 'Re-evaluation request submitted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to request re-evaluation.' });
  }
};
const getAnalytics = async (req, res) => {
  try {
    const data = await resultService.getAnalytics(req.query);
    res.json(data); // ← must be array
  } catch (error) {
    console.error(error);
    res.status(500).json([]); // ← fallback to empty array
  }
};
const exportExamResults = async (req, res) => {
  // Simplified
  res.status(501).json({ message: 'Export not implemented.' });
};

module.exports = {
  getAllResults,
  getExamResults,
  getStudentResults,
  getClassResults,
  gradeSubmission,
  publishExamResults,
  requestReevaluation,
  getAnalytics,
  exportExamResults
};