// controllers/exam.controller.js
const Exam = require('../models/Exam');
const Class = require('../models/Class');
const Question = require('../models/Question');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Submission = require('../models/Submission');
// Add this helper at top
const getNowUTC = () => {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000);
};

 
 
const getAllExams = async (req, res) => {
  try {
    const { teacher, class: classId, subject, status } = req.query;
    const filter = {};
    
    if (teacher) {
      filter.createdBy = teacher;
    } else if (req.user.role === 'teacher') {
      filter.createdBy = req.user?._id.toString();;
    }
    
    if (classId) filter.class = classId;
    if (subject) filter.subject = subject;
    if (status) filter.status = status;

    const exams = await Exam.find(filter)
      .populate('class', 'name code')
      .populate('subject', 'name')
      .populate('createdBy', 'name');

    const enhancedExams = await Promise.all(
      exams.map(async (exam) => {
        const enhanced = {
          ...exam.toObject(),
          startDate: exam.scheduledAt,
          endDate: exam.endsAt
        };

        if (!enhanced.totalStudents || !enhanced.completed) {
          const classData = await Class.findById(exam.class).select('students');
          enhanced.totalStudents = classData?.students?.length || 0;
          
          const completedCount = await Submission.countDocuments({
            exam: exam._id,
            status: 'submitted'
          });
          enhanced.completed = completedCount;
        }

        return enhanced;
      })
    );

    res.json(enhancedExams);
  } catch (error) {
    console.error('Exam list error:', error);
    res.status(500).json({ message: 'Failed to fetch exams.' });
  }
};

const createExam = async (req, res) => {
  try {
    const {
      title,
      class: classId,
      subject,
      duration,
      questions,
      startDate,
      endDate,
      instructions,
      passingMarks,
      totalMarks,
      shuffleQuestions,
      showResults
    } = req.body;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      throw new Error('End date must be after start date');
    }

    const cls = await Class.findById(classId);
    if (!cls) throw new Error('Class not found.');
    
    const isSubjectAssigned = cls.subjects.some(
      assignment => assignment.subject.toString() === subject
    );
    if (!isSubjectAssigned) {
      throw new Error('Subject is not assigned to this class');
    }
    
    const subj = await Subject.findById(subject);
    if (!subj) throw new Error('Subject not found.');

    // ✅ Create all questions FIRST
    const savedQuestionIds = [];
    for (const q of questions) {
      const options = q.type === 'short_answer' ? [] : q.options;

      const question = new Question({
        type: q.type,
        text: q.text,
        subject,
        createdBy:req.user?._id.toString(),
        difficulty: 'medium',
        options,
        points: q.marks
      });

      const savedQuestion = await question.save();
      savedQuestionIds.push(savedQuestion._id);
    }

    // ✅ Create exam with questions in SINGLE operation
    const questionRefs = questions.map((q, index) => ({
      question: savedQuestionIds[index],
      points: q.marks
    }));

    const exam = new Exam({
      title,
      class: classId,
      subject,
      duration,
      scheduledAt: startDate,
      endsAt: endDate,
      instructions,
      passingMarks,
      totalMarks,
      shuffleQuestions,
      showResults,
      totalQuestions: questions.length,
      createdBy: req.user.id,
      status: 'draft',
      questions: questionRefs // 👈 Include questions from the start
    });

    await exam.save(); // 👈 Only ONE save operation

    const populatedExam = await Exam.findById(exam._id)
      .populate('class', 'name code')
      .populate('subject', 'name')
      .populate('createdBy', 'name');

    res.status(201).json(populatedExam);
  } catch (error) {
    console.error('Exam creation error:', error);
    res.status(400).json({ message: error.message || 'Failed to create exam.' });
  }
};
// controllers/exam.controller.js

// In controllers/exam.controller.js - submitExam function

const submitExam = async (req, res) => {
  try {
    const examId = req.params.id;
    const studentId = req.user?._id.toString();
    const { error, value } = require('../validators/exam.validator').submitExamSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    const { answers, timeSpent, warnings = [] } = value;

    // 1. Validate exam exists and is published
    const exam = await Exam.findById(examId).select('title duration questions status totalMarks');
    if (!exam || exam.status !== 'published') {
      return res.status(400).json({ message: 'Exam not available for submission' });
    }

    // 2. Validate exam has questions
    if (!exam.questions || exam.questions.length === 0) {
      return res.status(400).json({ message: 'Exam contains no questions' });
    }

    // 3. Find ONLY draft submission
    let submission = await Submission.findOne({
      exam: examId,
      student: studentId,
      status: 'draft'
    });

    // If no draft exists, reject (startExam should have created one)
    if (!submission) {
      return res.status(400).json({ message: 'No active exam session found. Please start the exam first.' });
    }

    // 4. Validate answers reference valid question IDs
    const questionIds = exam.questions.map(q => q.question.toString());
    const submittedQuestionIds = answers.map(a => a.question);

    for (const id of submittedQuestionIds) {
      if (!questionIds.includes(id)) {
        return res.status(400).json({ message: `Invalid question ID: ${id}` });
      }
    }

    // 5. Ensure all questions are represented (even unanswered)
    const normalizedAnswers = exam.questions.map(examQ => {
      const ans = answers.find(a => a.question === examQ.question.toString());
      return {
        question: examQ.question.toString(),
        answer: ans?.answer || ''
      };
    });

    // 6. Fetch full question data
    const fullQuestionIds = exam.questions.map(q => q.question);
    const fullQuestions = await Question.find({ _id: { $in: fullQuestionIds } });
    const questionMap = {};
    fullQuestions.forEach(q => {
      questionMap[q._id.toString()] = q;
    });

    // 7. Score answers — NEVER auto-grade short_answer
   // 7. Score answers
let totalScore = 0;
const maxScore = exam.totalMarks;

const scoredAnswers = exam.questions.map(examQ => {
  const ans = normalizedAnswers.find(a => a.question === examQ.question.toString());
  const fullQuestion = questionMap[examQ.question.toString()];
  const answerText = ans?.answer || '';

  if (!fullQuestion) {
    // Deleted question - no points, but doesn't block auto-grading
    return {
      question: examQ.question,
      answer: answerText,
      isCorrect: null,
      reviewed: true // ← Mark as reviewed since it doesn't need grading
    };
  }

  // Get actual points for this question
  const questionPoints = examQ.points || 0;

  // Handle MCQ / True-False
  if (fullQuestion.type === 'multiple_choice' || fullQuestion.type === 'true_false') {
    const correctOption = fullQuestion.options.find(opt => opt.isCorrect);
    const isCorrect = correctOption && answerText === correctOption.text;
    if (isCorrect) {
      totalScore += questionPoints;
    }
    return {
      question: examQ.question,
      answer: answerText,
      isCorrect,
      reviewed: true
    };
  }

  // Non-MCQ questions (short_answer, essay, etc.)
  return {
    question: examQ.question,
    answer: answerText,
    isCorrect: null,
    reviewed: false
  };
});

// 8. Determine final status - KEY CHANGE HERE
const allQuestionsAreAutoGraded = exam.questions.every(examQ => {
  const fullQuestion = questionMap[examQ.question.toString()];
  if (!fullQuestion) return true; // Deleted questions don't prevent auto-grading
  
  return fullQuestion.type === 'multiple_choice' || fullQuestion.type === 'true_false';
});

const finalStatus = allQuestionsAreAutoGraded ? 'graded' : 'submitted';

// 9. Update the draft submission
submission.answers = scoredAnswers;
submission.timeSpent = timeSpent;
submission.warnings = warnings;
submission.totalScore = totalScore;
submission.maxScore = maxScore;
submission.status = finalStatus;
submission.submittedAt = new Date();

await submission.save();

    return res.status(201).json({
      message: 'Exam submitted successfully',
      submission: {
        id: submission._id,
        totalScore: submission.totalScore,
        maxScore: submission.maxScore,
        status: submission.status,
        submittedAt: submission.submittedAt
      }
    });
  } catch (error) {
    console.error('Submission error:', error);
    return res.status(500).json({
      message: 'Internal server error during submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .select('+questions')
      .populate('class', 'name section code')
      .populate('subject', 'name code')
      .populate('createdBy', 'name');

    if (!exam) return res.status(404).json({ message: 'Exam not found.' });

    // ✅ ALWAYS include questions - no user role checking
   // ✅ ALWAYS include questions - no user role checking
let finalQuestions = [];

if (exam.questions && exam.questions.length > 0) {
  console.log("🔍 POPULATION STARTED - Raw exam questions:", exam.questions);
  
  const questionIds = exam.questions.map(q => q.question);
  console.log("🔍 Question IDs to fetch:", questionIds);
  
  const fullQuestions = await Question.find({ 
    _id: { $in: questionIds } 
  }).select('text type options');
  
  console.log("🔍 Fetched full questions count:", fullQuestions.length);
  console.log("🔍 Full questions data:", JSON.stringify(fullQuestions, null, 2));
  
  const questionMap = {};
  fullQuestions.forEach(q => {
    questionMap[q._id.toString()] = q;
  });
  
  console.log("🔍 Question map keys:", Object.keys(questionMap));
  
  // Create NEW array with populated questions
  finalQuestions = exam.questions.map(eq => {
    const qId = eq.question.toString();
    const fullQ = questionMap[qId];
    console.log("🔍 Processing question ID:", qId, "Found:", !!fullQ);
    
    if (!fullQ) {
      console.log("❌ Question not found in map:", qId);
      return {
        _id: qId,
        text: '[Deleted Question]',
        type: 'deleted',
        options: [],
        marks: eq.points,
        isDeleted: true
      };
    }
    const transformedQuestion = {
      _id: fullQ._id.toString(), // Ensure it's a string
      type: fullQ.type,
      text: fullQ.text,
      options: fullQ.options || [],
      marks: eq.points
    };
    console.log("✅ Transformed question:", JSON.stringify(transformedQuestion, null, 2));
    return transformedQuestion;
  });
} else {
  console.log("❌ No questions found in exam");
}

// ✅ Create a clean response object
const response = {
  _id: exam._id,
  title: exam.title,
  class: exam.class,
  subject: exam.subject,
  createdBy: exam.createdBy,
  duration: exam.duration,
  totalQuestions: exam.totalQuestions,
  passingMarks: exam.passingMarks,
  totalMarks: exam.totalMarks,
  shuffleQuestions: exam.shuffleQuestions,
  showResults: exam.showResults,
  status: exam.status,
  scheduledAt: exam.scheduledAt,
  endsAt: exam.endsAt,
  instructions: exam.instructions,
  totalStudents: exam.totalStudents,
  completed: exam.completed,
  publishedAt: exam.publishedAt,
  createdAt: exam.createdAt,
  updatedAt: exam.updatedAt,
  startDate: exam.scheduledAt,
  endDate: exam.endsAt,
  questions: finalQuestions // ✅ Use the new array, not exam.questions
};

   console.log("✅ FINAL RESPONSE QUESTIONS:", JSON.stringify(response.questions, null, 2));
res.json(response);

  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({ message: 'Failed to fetch exam.' });
  }
};
// ✅ SECURE UPDATE: Only allow safe fields
const updateExam = async (req, res) => {
  try {
    const updatableFields = [
      'title', 'duration', 'instructions', 
      'passingMarks', 'totalMarks', 
      'shuffleQuestions', 'showResults'
    ];
    
    const updateData = {};
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!exam) return res.status(404).json({ message: 'Exam not found.' });
    res.json(exam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

 

const deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findByIdAndDelete(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found.' });
    res.json({ message: 'Exam deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete exam.' });
  }
};

const publishExam = async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { status: 'published', publishedAt: new Date() },
      { new: true }
    );
    if (!exam) return res.status(404).json({ message: 'Exam not found.' });
    res.json(exam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const scheduleExam = async (req, res) => {
  try {
    const { start, end } = req.body;
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { scheduledAt: start, endsAt: end, status: 'scheduled' },
      { new: true }
    );
    if (!exam) return res.status(404).json({ message: 'Exam not found.' });
    res.json(exam);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ✅ FIXED: Removed invalid eligibleStudents field
const getActiveExams = async (req, res) => {
  try {
    const student = await User.findById(req.user?._id.toString()).select('class');
    if (!student.class) {
      return res.json([]);
    }

    const now = new  Date();
    const exams = await Exam.find({
      class: student.class, // ✅ Only use class (no eligibleStudents)
      status: 'published',
      scheduledAt: { $lte: now },
      endsAt: { $gte: now }
    })
    .populate('subject', 'name')
    .select('title subject duration scheduledAt endsAt');

    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch active exams.' });
  }
};

// In exam.controller.js - getStudentExamResult
const getStudentExamResult = async (req, res) => {
  try {
    // Find the submission for this student and exam
    const submission = await Submission.findOne({
      exam: req.params.id,
      student: req.user?._id.toString()
    })
    .populate('exam', 'title subject passingMarks maxScore')
    .populate('exam.subject', 'name')
    .populate('answers.question', 'text');

    if (!submission) return res.status(404).json({ message: 'Submission not found.' });
    res.json(submission);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch result.' });
  }
};

const isExamActive = (exam) => {
  const now = getNowUTC();
  return new Date(exam.scheduledAt) <= now && now <= new Date(exam.endsAt);
};
// In exam.controller.js - getExamSubmissions
// controllers/exam.controller.js
const getExamSubmissions = async (req, res) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.id,
      createdBy: req.user?._id.toString()
    });
    if (!exam) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // ✅ POPULATE exam field in submissions
    const submissions = await Submission.find({ exam: req.params.id })
      .populate('student', 'name email')
      .populate('gradedBy', 'name')
      .populate('exam', 'title'); // ✅ This is the key fix!

    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// In controllers/exam.controller.js
const startExam = async (req, res) => {
  try {
    const { id: examId } = req.params;
    const studentId = req.user?._id.toString();

    // 1. Validate exam exists and is published
    const exam = await Exam.findById(examId);
    if (!exam || exam.status !== 'published') {
      return res.status(400).json({ message: 'Exam not available.' });
    }

    // 2. Validate timing
    const now = new Date();
    const scheduledAt = new Date(exam.scheduledAt);
    const endsAt = new Date(exam.endsAt);

    if (now < scheduledAt) {
      return res.status(400).json({ message: 'Exam has not started yet.' });
    }
    if (now > endsAt) {
      return res.status(400).json({ message: 'Exam has already ended.' });
    }

    // 3. Check if student already has a submission (resume or reject)
    let submission = await Submission.findOne({ exam: examId, student: studentId });

    if (submission) {
      if (submission.status !== 'draft') {
        return res.status(400).json({ message: 'Exam already submitted.' });
      }
      // Resume existing draft
    } else {
      // Create new draft submission
      submission = new Submission({
        exam: examId,
        student: studentId,
        startTime: now,
        maxScore: exam.totalMarks || 100,
        status: 'draft',
        answers: [],
        timeSpent: 0 // Will be updated on submit
      });
      await submission.save();
    }

    // 4. Compute remaining time
    const durationMs = (exam.duration || 10) * 60 * 1000; // minutes → ms
    const elapsed = now - new Date(submission.startTime);
    const timeLeft = Math.max(0, durationMs - elapsed);

    // 5. Fetch full questions for frontend
    const questionIds = exam.questions.map(q => q.question);
    const fullQuestions = await Question.find({ _id: { $in: questionIds } }).select('text type options');

    const questionMap = {};
    fullQuestions.forEach(q => {
      questionMap[q._id.toString()] = q;
    });

    const populatedQuestions = exam.questions.map(eq => {
      const q = questionMap[eq.question.toString()];
      if (!q) {
        return {
          _id: eq.question,
          text: '[Deleted Question]',
          type: 'deleted',
          options: [],
          marks: eq.points
        };
      }
      return {
        _id: q._id,
        type: q.type,
        text: q.text,
        options: q.options || [],
        marks: eq.points
      };
    });

    // 6. Send response
    res.json({
      submissionId: submission._id,
      timeLeft, // in milliseconds
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        duration: exam.duration,
        totalMarks: exam.totalMarks,
        shuffleQuestions: exam.shuffleQuestions,
        instructions: exam.instructions,
        scheduledAt: exam.scheduledAt,
        endsAt: exam.endsAt,
        questions: populatedQuestions
      }
    });
  } catch (error) {
    console.error('Start exam error:', error);
    res.status(500).json({ message: 'Failed to start exam.' });
  }
};
module.exports = {
  getAllExams,
  createExam,
  getExamById,
  updateExam,
  deleteExam,
  publishExam,
  scheduleExam,
  getActiveExams,
  submitExam,
  getStudentExamResult,
  getExamSubmissions ,startExam
};
