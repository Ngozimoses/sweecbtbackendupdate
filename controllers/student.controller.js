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
    const studentId = req.params.id === 'me' ? req.user?._id.toString() : req.params.id;
    
    if (req.params.id && req.params.id !== 'me') {
      if (req.user.role === 'student' && req.user?._id.toString() !== studentId) {
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
    const studentId = req.params.id === 'me' ? req.user?._id.toString(): req.params.id;
    
    if (req.params.id && req.params.id !== 'me') {
      if (req.user.role === 'student' && req.user?._id.toString() !== studentId) {
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
    const studentId = req.params.id === 'me' ? req.user?._id.toString() : req.params.id;
    
    if (req.params.id && req.params.id !== 'me') {
      if (req.user.role === 'student' && req.user?._id.toString() !== studentId) {
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

// Get exam history for current student
const getMyExamHistory = async (req, res) => {
  try {
    const studentId = req.user?._id.toString();
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
    .select('exam totalScore maxScore status createdAt')
    .lean();

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.exam.toString()] = sub;
    });

    const examHistory = allExams.map(exam => {
      const examId = exam._id.toString();
      const submission = submissionMap[examId];
      const status = getExamStatus(exam, submission, now);

      return {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        startTime: exam.scheduledAt,
        endTime: exam.endsAt,
        duration: exam.duration,
        score: submission?.totalScore,
        maxScore: submission?.maxScore || 100,
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

// Get exam history for any student (teacher view)
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

    const examHistory = allExams.map(exam => {
      const examId = exam._id.toString();
      const submission = submissionMap[examId];
      const status = getExamStatus(exam, submission, now);

      return {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        startTime: exam.scheduledAt,
        endTime: exam.endsAt,
        duration: exam.duration,
        score: submission?.totalScore,
        maxScore: submission?.maxScore || 100,
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

const getExamResult = async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    
    if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const submission = await Submission.findOne({ 
      student: studentId, 
      exam: examId 
    })
    .populate('exam', 'title passingMarks')
    .populate('answers.question', 'text');

    if (!submission) {
      return res.status(404).json({ message: 'Exam result not found' });
    }

    res.json(submission);
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
