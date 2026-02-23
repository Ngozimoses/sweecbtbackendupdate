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
// controllers/result.controller.js - Fixed gradeSubmission function
const gradeSubmission = async (req, res) => {
  try {
    const { feedback, status, answers } = req.body;
    const { id: submissionId } = req.params;

    // Find submission and populate exam with questions
    const submission = await Submission.findById(submissionId)
      .populate({
        path: 'exam',
        select: 'questions totalMarks passingMarks title',
        populate: {
          path: 'questions.question',
          select: 'text points correctAnswer type'
        }
      });

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    const exam = submission.exam;
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found.' });
    }

    // Create a map of question IDs to their points
    const questionPointsMap = new Map();
    exam.questions.forEach(q => {
      const questionId = q.question?._id?.toString() || q.question?.toString();
      if (questionId) {
        questionPointsMap.set(questionId, q.points || 1);
      }
    });

    console.log('Question points map:', Object.fromEntries(questionPointsMap));

    // Update answers if provided by teacher
    if (answers && Array.isArray(answers)) {
      submission.answers = submission.answers.map((existingAns, index) => {
        const updatedAns = answers[index];
        if (updatedAns) {
          const questionId = existingAns.question?.toString();
          const maxPoints = questionPointsMap.get(questionId) || 1;
          
          // Calculate awarded marks properly
          let awardedMarks = 0;
          
          if (updatedAns.awardedMarks !== undefined && updatedAns.awardedMarks !== null) {
            // Use teacher-assigned marks
            awardedMarks = Math.min(
              Math.max(Number(updatedAns.awardedMarks) || 0, 0), 
              maxPoints
            );
          } else if (updatedAns.isCorrect === true) {
            // Auto-graded correct answer - give full points
            awardedMarks = maxPoints;
          } else if (existingAns.isCorrect === true) {
            // If existing answer was correct but no new marks, give full points
            awardedMarks = maxPoints;
          }

          return {
            ...existingAns.toObject(),
            awardedMarks,
            reviewed: updatedAns.reviewed !== undefined ? updatedAns.reviewed : true,
            isCorrect: updatedAns.isCorrect !== undefined ? updatedAns.isCorrect : (awardedMarks === maxPoints),
            feedback: updatedAns.feedback || existingAns.feedback
          };
        }
        return existingAns;
      });
    } else {
      // If no answers provided by teacher, auto-grade based on isCorrect flag
      submission.answers = submission.answers.map(ans => {
        const questionId = ans.question?.toString();
        const maxPoints = questionPointsMap.get(questionId) || 1;
        
        // Calculate awarded marks based on isCorrect
        let awardedMarks = 0;
        if (ans.isCorrect === true) {
          awardedMarks = maxPoints;
        }
        
        return {
          ...ans.toObject(),
          awardedMarks,
          reviewed: ans.reviewed || true
        };
      });
    }

    // Recalculate total score
    let totalScore = 0;
    submission.answers.forEach((ans, index) => {
      totalScore += ans.awardedMarks || 0;
      console.log(`Question ${index + 1}: awardedMarks = ${ans.awardedMarks}, total so far = ${totalScore}`);
    });

    // Calculate max total points from exam
    const maxTotalPoints = exam.totalMarks || exam.questions.reduce((sum, q) => {
      const points = q.points || 1;
      return sum + points;
    }, 0);

    console.log('Total Score:', totalScore);
    console.log('Max Total Points:', maxTotalPoints);

    // Calculate percentage
    const percentage = maxTotalPoints > 0 ? (totalScore / maxTotalPoints) * 100 : 0;

    // Determine pass/fail
    const passingPercentage = exam.passingMarks || 40;
    const passed = percentage >= passingPercentage;

    // Update submission
    submission.totalScore = totalScore;
    submission.percentage = Math.round(percentage * 100) / 100;
    submission.passed = passed;
    submission.feedback = feedback || submission.feedback;
    submission.status = status || 'graded';
    submission.gradedBy = req.user.id;
    submission.gradedAt = new Date();
    
    await submission.save();

    // Return enhanced response
    res.json({
      status: 'success',
      data: {
        submission: {
          ...submission.toObject(),
          totalScore,
          percentage: submission.percentage,
          passed,
          maxScore: maxTotalPoints,
          answerDetails: submission.answers.map((ans, index) => ({
            questionNumber: index + 1,
            awardedMarks: ans.awardedMarks,
            maxPoints: questionPointsMap.get(ans.question?.toString()) || 1,
            isCorrect: ans.isCorrect
          }))
        }
      }
    });

  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(400).json({ 
      status: 'error',
      message: error.message 
    });
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