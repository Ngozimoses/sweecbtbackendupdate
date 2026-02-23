// controllers/student.controller.js
const User = require('../models/User');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const Class = require('../models/Class');

/**
 * Get current time as a true UTC Date object.
 * All exam times (scheduledAt, endsAt) are stored in UTC.
 */
const nowUTC = () => {
  return new Date(); // MongoDB and JS Date use UTC internally for comparisons
};

/**
 * Helper to determine exam status based on current UTC time
 */
const getExamStatus = (exam, submission, now) => {
  const startTime = new Date(exam.scheduledAt);
  const endTime = new Date(exam.endsAt);

  if (submission) {
    return 'completed';
  }
  if (endTime < now) {
    return 'missed';
  }
  if (startTime <= now && now <= endTime) {
    return 'active';
  }
  return 'upcoming';
};

// Get recent exam results for current student
const getRecentResults = async (req, res) => {
  try {
    const studentId = req.params.id === 'me' ? req.user.id : req.params.id;
    
    if (req.params.id && req.params.id !== 'me') {
      if (req.user.role === 'student' && req.user.id !== studentId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const student = await User.findById(studentId).select('class');
    if (!student?.class) {
      return res.json([]);
    }

    const allExams = await Exam.find({ 
      class: student.class, 
      status: 'published' 
    })
    .populate('subject', 'name')
    .select('title subject scheduledAt endsAt duration _id')
    .lean();

    const submissions = await Submission.find({ 
      student: studentId,
      totalScore: { $exists: true, $ne: null } // Only graded submissions
    })
    .select('exam totalScore maxScore status createdAt')
    .lean();

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.exam.toString()] = sub;
    });

    const completedExams = allExams
      .filter(exam => {
        const examId = exam._id.toString();
        return !!submissionMap[examId];
      })
      .map(exam => {
        const examId = exam._id.toString();
        const submission = submissionMap[examId];
        return {
          _id: exam._id,
          exam: {
            title: exam.title,
            subject: exam.subject
          },
          totalScore: submission.totalScore,
          maxScore: submission.maxScore || 100,
          submittedAt: submission.createdAt,
          status: submission.status
        };
      })
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, 3);

    res.json(completedExams);
  } catch (error) {
    console.error('Recent results error:', error);
    res.status(500).json({ message: 'Failed to fetch results' });
  }
};

// Get subject-wise performance for current student
const getPerformance = async (req, res) => {
  try {
    const studentId = req.params.id === 'me' ? req.user.id : req.params.id;
    
    if (req.params.id && req.params.id !== 'me') {
      if (req.user.role === 'student' && req.user.id !== studentId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const student = await User.findById(studentId).select('class');
    if (!student?.class) {
      return res.json([]);
    }

    const allExams = await Exam.find({ 
      class: student.class, 
      status: 'published' 
    })
    .populate('subject', 'name')
    .lean();

    const submissions = await Submission.find({ 
      student: studentId,
      totalScore: { $exists: true, $ne: null }
    })
    .lean();

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.exam.toString()] = sub;
    });

    const subjectMap = {};
    allExams.forEach(exam => {
      const examId = exam._id.toString();
      const submission = submissionMap[examId];
      
      if (submission) {
        const subjectName = exam.subject?.name || 'General';
        if (!subjectMap[subjectName]) {
          subjectMap[subjectName] = { total: 0, count: 0 };
        }
        subjectMap[subjectName].total += submission.totalScore;
        subjectMap[subjectName].count += 1;
      }
    });

    const performance = Object.entries(subjectMap).map(([name, data]) => ({
      name,
      averageScore: data.count > 0 ? Math.round(data.total / data.count) : 0
    }));

    res.json(performance);
  } catch (error) {
    console.error('Performance error:', error);
    res.status(500).json({ message: 'Failed to fetch performance' });
  }
};

// Get upcoming exams for current student
const getUpcomingExams = async (req, res) => {
  try {
    const studentId = req.params.id === 'me' ? req.user.id : req.params.id;
    
    if (req.params.id && req.params.id !== 'me') {
      if (req.user.role === 'student' && req.user.id !== studentId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const student = await User.findById(studentId).select('class');
    if (!student || !student.class) {
      return res.json([]);
    }

    const now = nowUTC();
    const exams = await Exam.find({
      class: student.class,
      status: 'published',
      endsAt: { $gte: now }
    })
    .populate('subject', 'name')
    .populate('class', 'name')
    .select('title scheduledAt endsAt subject class')
    .sort('scheduledAt')
    .limit(10);

    const formatted = exams.map(exam => ({
      _id: exam._id,
      title: exam.title,
      startTime: exam.scheduledAt,
      endTime: exam.endsAt,
      subject: exam.subject,
      class: exam.class
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Upcoming exams error:', error);
    res.status(500).json({ message: 'Failed to load upcoming exams' });
  }
};

// In getMyExamHistory function, update the mapping part:
const getMyExamHistory = async (req, res) => {
  try {
    const studentId = req.user.id;
    const now = nowUTC();

    const student = await User.findById(studentId).select('class');
    if (!student?.class) {
      return res.json([]);
    }

    const allExams = await Exam.find({ 
      class: student.class, 
      status: 'published' 
    })
    .populate('subject', 'name')
    .select('title subject scheduledAt endsAt duration _id showResults') 
    .lean();

    const submissions = await Submission.find({ 
      student: studentId 
    })
    .select('exam totalScore maxScore status createdAt answers')
    .lean();

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.exam.toString()] = sub;
    });

    const examHistory = allExams.map(exam => {
      const examId = exam._id.toString();
      const submission = submissionMap[examId];
      const status = getExamStatus(exam, submission, now);

      // Calculate score properly
      let score = null;
      let maxScore = 100;
      let percentage = null;
      
      if (submission) {
        // Use submission's maxScore if available
        maxScore = submission.maxScore || 100;
        
        // If submission has totalScore, use it
        if (submission.totalScore !== undefined && submission.totalScore !== null) {
          score = submission.totalScore;
        } 
        // Otherwise calculate from answers if available
        else if (submission.answers && submission.answers.length > 0) {
          score = submission.answers.reduce((sum, ans) => {
            return sum + (ans.awardedMarks || (ans.isCorrect ? 1 : 0));
          }, 0);
        }
        
        // Calculate percentage if we have both values
        if (score !== null && maxScore > 0) {
          percentage = Math.round((score / maxScore) * 100);
        }
      }

      return {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        startTime: exam.scheduledAt,
        endTime: exam.endsAt,
        duration: exam.duration,
        score,
        maxScore,
        percentage,
        status,
        submittedAt: submission?.createdAt,
        showResults: exam.showResults
      };
    });

    examHistory.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    res.json(examHistory);
  } catch (error) {
    console.error('Get my exam history error:', error);
    res.status(500).json({ message: 'Failed to fetch exam history' });
  }
};
const getExamHistory = async (req, res) => {
  try {
    if (req.user.role === 'student' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const studentId = req.params.id;
    const now = nowUTC();
    
    const student = await User.findById(studentId).select('class');
    if (!student?.class) {
      return res.json([]);
    }

    const allExams = await Exam.find({ 
      class: student.class, 
      status: 'published' 
    })
    .populate('subject', 'name') 
    .select('title subject scheduledAt endsAt duration _id showResults') // ← ADD showResults here
    .lean();

    const submissions = await Submission.find({ 
      student: studentId 
    })
    .select('exam totalScore maxScore status createdAt')
    .lean();

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.exam.toString()] = sub;
    });

// In getMyExamHistory function, update the mapping part:
const examHistory = allExams.map(exam => {
  const examId = exam._id.toString();
  const submission = submissionMap[examId];
  const status = getExamStatus(exam, submission, now);

  // Calculate score if submission exists
  let score = submission?.totalScore;
  let maxScore = submission?.maxScore || 100;
  
  // If submission exists but totalScore is not set, calculate it from answers
  if (submission && submission.answers && !submission.totalScore) {
    // You might need to populate exam questions here to get points
    score = submission.answers.reduce((sum, ans) => {
      return sum + (ans.awardedMarks || (ans.isCorrect ? 1 : 0));
    }, 0);
  }

  return {
    _id: exam._id,
    title: exam.title,
    subject: exam.subject,
    startTime: exam.scheduledAt,
    endTime: exam.endsAt,
    duration: exam.duration,
    score,
    maxScore,
    percentage: maxScore > 0 && score !== undefined ? (score / maxScore) * 100 : null,
    status,
    submittedAt: submission?.createdAt,
    showResults: exam.showResults
  };
});

    examHistory.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    res.json(examHistory);
  } catch (error) {
    console.error('Get exam history error:', error);
    res.status(500).json({ message: 'Failed to fetch exam history' });
  }
};  

// controllers/student.controller.js
const getExamResult = async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    
    if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find submission and populate all necessary data
    const submission = await Submission.findOne({ 
      student: studentId, 
      exam: examId 
    })
    .populate({
      path: 'exam',
      select: 'title subject passingMarks totalMarks questions showResults',
      populate: {
        path: 'questions.question',
        select: 'text type points options correctAnswer'
      }
    })
    .populate('answers.question', 'text type points');

    if (!submission) {
      return res.status(404).json({ message: 'Exam result not found' });
    }

    // Check if results should be shown
    if (submission.exam && submission.exam.showResults === false) {
      return res.json({
        _id: submission._id,
        exam: {
          _id: submission.exam._id,
          title: submission.exam.title,
          subject: submission.exam.subject,
          showResults: false
        },
        status: submission.status,
        submittedAt: submission.submittedAt || submission.createdAt,
        message: 'Results are not yet published'
      });
    }

    // Create a map of question IDs to their max points from the exam
    const questionPointsMap = new Map();
    if (submission.exam && submission.exam.questions) {
      submission.exam.questions.forEach(q => {
        const questionId = q.question?._id?.toString() || q.question?.toString();
        if (questionId) {
          questionPointsMap.set(questionId, q.points || 1);
        }
      });
    }

    // Process answers to ensure awardedMarks is set correctly
    let totalCalculatedScore = 0;
    const processedAnswers = submission.answers.map((ans, index) => {
      const questionId = ans.question?._id?.toString() || ans.question?.toString();
      const maxPoints = questionPointsMap.get(questionId) || 1;
      
      // Get the awarded marks - if not set, calculate from isCorrect
      let awardedMarks = ans.awardedMarks;
      
      // If awardedMarks is 0 or undefined but answer is correct, set to max points
      if ((awardedMarks === undefined || awardedMarks === 0) && ans.isCorrect === true) {
        awardedMarks = maxPoints;
      }
      
      // If still undefined, default to 0
      if (awardedMarks === undefined) {
        awardedMarks = 0;
      }

      // Add to total score
      totalCalculatedScore += awardedMarks;

      console.log(`Question ${index + 1}: awardedMarks=${awardedMarks}, isCorrect=${ans.isCorrect}, maxPoints=${maxPoints}`);

      return {
        ...ans.toObject(),
        awardedMarks,
        maxPoints,
        question: ans.question ? {
          ...ans.question.toObject(),
          points: maxPoints
        } : null
      };
    });

    // Use the submission's maxScore or calculate from exam
    const maxScore = submission.maxScore || 
                    submission.exam?.totalMarks || 
                    Array.from(questionPointsMap.values()).reduce((sum, points) => sum + points, 0);

    // Use the submission's totalScore or our calculated total
    const totalScore = submission.totalScore || totalCalculatedScore;

    // Calculate percentage
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    // Determine pass/fail
    const passingPercentage = submission.exam?.passingMarks || 40;
    const passed = percentage >= passingPercentage;

    console.log('Final calculation:', {
      totalScore,
      maxScore,
      percentage,
      passed,
      submissionTotalScore: submission.totalScore,
      calculatedTotal: totalCalculatedScore
    });

    // Create the response object
    const responseData = {
      _id: submission._id,
      exam: {
        _id: submission.exam?._id,
        title: submission.exam?.title || 'Exam',
        subject: submission.exam?.subject || null,
        passingMarks: submission.exam?.passingMarks,
        totalMarks: maxScore,
        showResults: submission.exam?.showResults
      },
      answers: processedAnswers,
      totalScore,
      maxScore,
      percentage: Math.round(percentage * 100) / 100,
      passed,
      status: submission.status,
      startedAt: submission.startTime,
      submittedAt: submission.submittedAt || submission.createdAt,
      gradedAt: submission.gradedAt,
      feedback: submission.feedback,
      timeSpent: submission.timeSpent,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt
    };

    res.json(responseData);

  } catch (error) {
    console.error('Get exam result error:', error);
    res.status(500).json({ message: 'Failed to fetch exam result' });
  }
};
module.exports = {
  getUpcomingExams,
  getRecentResults,
  getPerformance,
  getExamHistory,
  getExamResult,
  getMyExamHistory
};
