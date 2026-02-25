// controllers/exam.controller.js
const Exam = require('../models/Exam');
const Class = require('../models/Class');
const Question = require('../models/Question');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Submission = require('../models/Submission');
const mongoose = require('mongoose'); 
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
      filter.createdBy = req.user.id;
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
// controllers/exam.controller.js - Update createExam and getExamById

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

    // Create all questions FIRST
    const savedQuestionIds = [];
    const questionRefs = [];

    for (const q of questions) {
      let questionData;
      
      if (q.type === 'comprehension') {
        // Handle comprehension passage
        questionData = {
          type: 'comprehension',
          text: q.passage || '', // Store passage in text field for backward compatibility
          passage: {
            title: q.title || '',
            content: q.passage || '',
            diagrams: q.diagrams || []
          },
          comprehensionQuestions: q.questions.map(subQ => ({
            ...subQ,
            _id: subQ.id || new mongoose.Types.ObjectId(),
            options: subQ.options?.map(opt => ({
              text: opt.text || '',
              isCorrect: opt.isCorrect || false,
              imageUrl: opt.imageUrl || null
            })) || []
          })),
          subject,
          createdBy: req.user.id,
          difficulty: 'medium',
          points: q.totalMarks || q.questions.reduce((sum, subQ) => sum + (subQ.marks || 1), 0)
        };
      } else {
        // Handle regular question
        questionData = {
          type: q.type,
          text: q.text,
          diagrams: q.diagrams || [],
          imageUrl: q.imageUrl || null,
          subject,
          createdBy: req.user.id,
          difficulty: 'medium',
          options: q.options?.map(opt => ({
            text: opt.text || '',
            isCorrect: opt.isCorrect || false,
            imageUrl: opt.imageUrl || null
          })) || [],
          points: q.marks || 1
        };
      }

      const question = new Question(questionData);
      const savedQuestion = await question.save();
      savedQuestionIds.push(savedQuestion._id);
      
      questionRefs.push({
        question: savedQuestion._id,
        points: q.type === 'comprehension' ? (q.totalMarks || 1) : (q.marks || 1),
        // For comprehension, include which sub-questions are included
        ...(q.type === 'comprehension' && {
          includedSubQuestions: savedQuestion.comprehensionQuestions.map(sq => sq._id)
        })
      });
    }

    // Create exam with questions
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
      questions: questionRefs
    });

    await exam.save();

    const populatedExam = await Exam.findById(exam._id)
      .populate('class', 'name code section')
      .populate('subject', 'name code')
      .populate('createdBy', 'name')
      .populate('questions.question', 'text type options diagrams passage comprehensionQuestions totalMarks');

    res.status(201).json(populatedExam);
  } catch (error) {
    console.error('Exam creation error:', error);
    res.status(400).json({ message: error.message || 'Failed to create exam.' });
  }
};

const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .select('+questions')
      .populate('class', 'name section code')
      .populate('subject', 'name code')
      .populate('createdBy', 'name')
      .populate('questions.question', 'text type options diagrams imageUrl passage comprehensionQuestions points totalMarks');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found.' });
    }

    // Transform questions for frontend
    const transformedQuestions = exam.questions.map(eq => {
      const question = eq.question;
      
      if (question.type === 'comprehension') {
        // For comprehension passages, return the passage and its questions
        return {
          id: question._id,
          type: 'comprehension',
          title: question.passage?.title || '',
          passage: question.passage?.content || question.text,
          diagrams: question.passage?.diagrams || question.diagrams || [],
          questions: question.comprehensionQuestions?.map(subQ => ({
            id: subQ._id,
            type: subQ.type,
            text: subQ.text,
            marks: subQ.marks || 1,
            options: subQ.options?.map(opt => ({
              text: opt.text,
              isCorrect: opt.isCorrect,
              imageUrl: opt.imageUrl
            })) || [],
            diagrams: subQ.diagrams || [],
            imageUrl: subQ.imageUrl
          })) || [],
          totalMarks: question.totalMarks || eq.points
        };
      } else {
        // Regular question
        return {
          id: question._id,
          type: question.type,
          text: question.text,
          marks: eq.points || question.points || 1,
          options: question.options?.map(opt => ({
            text: opt.text,
            isCorrect: opt.isCorrect,
            imageUrl: opt.imageUrl
          })) || [],
          diagrams: question.diagrams || [],
          imageUrl: question.imageUrl
        };
      }
    });

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
      questions: transformedQuestions
    };

    res.json(response);
  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({ message: 'Failed to fetch exam.' });
  }
};

// In controllers/exam.controller.js - Update submitExam function
const submitExam = async (req, res) => {
  try {
    const examId = req.params.id;
    const studentId = req.user.id;
    const { answers, timeSpent, warnings = [] } = req.body;

    console.log('Submit exam - timeSpent received:', timeSpent, 'type:', typeof timeSpent);
    console.log('Submit exam - answers count:', answers?.length);

    // Validate exam exists
    const exam = await Exam.findById(examId)
      .populate({
        path: 'questions.question',
        select: 'text type options comprehensionQuestions points',
        populate: {
          path: 'comprehensionQuestions',
          select: 'text type options marks'
        }
      });

    if (!exam || exam.status !== 'published') {
      return res.status(400).json({ message: 'Exam not available for submission' });
    }

    // Find draft submission
    let submission = await Submission.findOne({
      exam: examId,
      student: studentId,
      status: 'draft'
    });

    if (!submission) {
      return res.status(400).json({ message: 'No active exam session found.' });
    }

    // Process timeSpent - convert from milliseconds to seconds if needed
    let finalTimeSpent = timeSpent;
    const examDurationSeconds = exam.duration * 60;
    
    if (typeof finalTimeSpent === 'string') {
      finalTimeSpent = parseInt(finalTimeSpent, 10);
    }
    
    // If timeSpent is greater than exam duration in seconds * 2, it's likely in milliseconds
    if (finalTimeSpent > examDurationSeconds * 2) {
      console.log('Converting timeSpent from ms to seconds:', finalTimeSpent);
      finalTimeSpent = Math.floor(finalTimeSpent / 1000);
    }
    
    // Ensure timeSpent doesn't exceed exam duration and is not negative
    finalTimeSpent = Math.min(Math.max(0, finalTimeSpent), examDurationSeconds);
    
    console.log('Final timeSpent (seconds):', finalTimeSpent);

    // Calculate actual max score by counting questions
    let actualMaxScore = 0;
    const questionPointsMap = new Map();
    
    exam.questions.forEach(eq => {
      const questionId = eq.question._id.toString();
      
      if (eq.question.type === 'comprehension' && eq.question.comprehensionQuestions) {
        // For comprehension, each sub-question is worth 1 mark
        const subQuestionCount = eq.question.comprehensionQuestions.length;
        actualMaxScore += subQuestionCount;
        questionPointsMap.set(questionId, {
          type: 'comprehension',
          count: subQuestionCount,
          points: subQuestionCount // Total points for this comprehension passage
        });
      } else {
        // Regular question is worth 1 mark
        actualMaxScore += 1;
        questionPointsMap.set(questionId, {
          type: 'regular',
          points: 1
        });
      }
    });

    console.log('Actual max score calculated:', actualMaxScore);
    console.log('Question points map:', Object.fromEntries(questionPointsMap));

    // Validate that we have answers for all questions
    const expectedAnswerCount = actualMaxScore;
    if (answers.length !== expectedAnswerCount) {
      console.warn(`Warning: Expected ${expectedAnswerCount} answers but received ${answers.length}`);
      // Don't return error, just warn - some answers might be empty but still counted
    }

    // Score answers
    let totalScore = 0;
    const scoredAnswers = [];
    const processedQuestionIds = new Set();

    for (const answer of answers) {
      const examQuestion = exam.questions.find(
        eq => eq.question._id.toString() === answer.questionId
      );

      if (!examQuestion) {
        console.warn(`Question not found for ID: ${answer.questionId}`);
        continue;
      }

      const question = examQuestion.question;
      let marksObtained = 0;
      let isCorrect = null;
      let reviewed = true;
      let answerText = answer.answer || '';

      if (question.type === 'comprehension' && answer.subQuestionId) {
        // Handle comprehension sub-question
        const subQuestion = question.comprehensionQuestions.find(
          sq => sq._id.toString() === answer.subQuestionId
        );

        if (subQuestion) {
          // Store the question ID for tracking
          const uniqueId = `${answer.questionId}-${answer.subQuestionId}`;
          processedQuestionIds.add(uniqueId);

          if (subQuestion.type === 'multiple_choice' || subQuestion.type === 'true_false') {
            const correctOption = subQuestion.options?.find(opt => opt.isCorrect);
            isCorrect = correctOption && answerText === correctOption.text;
            marksObtained = isCorrect ? 1 : 0; // Each sub-question is worth 1 mark
            totalScore += marksObtained;
            
            console.log(`Sub-question ${uniqueId}: ${isCorrect ? '✓' : '✗'} marks=${marksObtained}`);
          } else {
            // Essay or open-ended questions need manual grading
            reviewed = false;
            isCorrect = null;
            console.log(`Sub-question ${uniqueId}: needs manual grading`);
          }
        } else {
          console.warn(`Sub-question not found: ${answer.subQuestionId}`);
        }
      } else {
        // Regular question
        const uniqueId = answer.questionId;
        processedQuestionIds.add(uniqueId);

        if (question.type === 'multiple_choice' || question.type === 'true_false') {
          const correctOption = question.options?.find(opt => opt.isCorrect);
          isCorrect = correctOption && answerText === correctOption.text;
          marksObtained = isCorrect ? 1 : 0; // Each question is worth 1 mark
          totalScore += marksObtained;
          
          console.log(`Question ${uniqueId}: ${isCorrect ? '✓' : '✗'} marks=${marksObtained}`);
        } else {
          // Essay or open-ended questions need manual grading
          reviewed = false;
          isCorrect = null;
          console.log(`Question ${uniqueId}: needs manual grading`);
        }
      }

      scoredAnswers.push({
        question: examQuestion.question._id,
        subQuestionId: answer.subQuestionId || null,
        answer: answerText,
        answerText: answerText, // Store for reference
        isCorrect,
        awardedMarks: marksObtained,
        reviewed,
        maxPoints: 1 // Each question/sub-question is worth 1 point
      });
    }

    // Check if all questions were answered
    if (processedQuestionIds.size < expectedAnswerCount) {
      console.warn(`Only ${processedQuestionIds.size} out of ${expectedAnswerCount} questions were answered`);
    }

    // Check if all questions are auto-graded
    const allQuestionsAutoGraded = exam.questions.every(eq => {
      if (eq.question.type === 'comprehension') {
        return eq.question.comprehensionQuestions?.every(
          sq => sq.type === 'multiple_choice' || sq.type === 'true_false'
        ) ?? false;
      }
      return eq.question.type === 'multiple_choice' || eq.question.type === 'true_false';
    });

    // Calculate percentage
    const percentage = (totalScore / actualMaxScore) * 100;

    // Update submission
    submission.answers = scoredAnswers;
    submission.timeSpent = finalTimeSpent;
    submission.warnings = warnings || [];
    submission.totalScore = totalScore;
    submission.maxScore = actualMaxScore; // This will be 20, not exam.totalMarks
    submission.status = allQuestionsAutoGraded ? 'graded' : 'submitted';
    submission.submittedAt = new Date();
    
    // Add metadata
    submission.metadata = {
      ...submission.metadata,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      submittedFrom: 'web'
    };

    await submission.save();

    console.log('✅ Submission saved successfully:', {
      submissionId: submission._id,
      totalScore: totalScore,
      maxScore: actualMaxScore,
      percentage: percentage.toFixed(2) + '%',
      status: submission.status,
      answerCount: scoredAnswers.length
    });

    // Return success response with correct data
    res.status(201).json({
      message: 'Exam submitted successfully',
      submission: {
        id: submission._id,
        totalScore: submission.totalScore,
        maxScore: submission.maxScore,
        percentage: Number(percentage.toFixed(2)),
        displayScore: `${submission.totalScore}/${submission.maxScore}`,
        status: submission.status,
        submittedAt: submission.submittedAt,
        timeSpent: submission.timeSpent,
        autoGraded: allQuestionsAutoGraded
      }
    });

  } catch (error) {
    console.error('❌ Submission error:', error);
    res.status(500).json({ 
      message: 'Internal server error during submission',
      error: error.message 
    });
  }
};
const updateExam = async (req, res) => {
  try {
    // Include ALL updatable fields including dates
    const updatableFields = [
      'title', 
      'duration', 
      'instructions', 
      'passingMarks', 
      'totalMarks', 
      'shuffleQuestions', 
      'showResults',
      'scheduledAt',  // ✅ ADD THIS
      'endsAt'        // ✅ ADD THIS
    ];
    
    const updateData = {};
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Optional: Validate dates if both are being updated
    if (updateData.scheduledAt && updateData.endsAt) {
      const start = new Date(updateData.scheduledAt);
      const end = new Date(updateData.endsAt);
      
      if (end <= start) {
        return res.status(400).json({ 
          message: 'End date must be after start date' 
        });
      }
    }

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('class subject createdBy');
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found.' });
    }
    
    // Add startDate/endDate aliases for frontend compatibility
    const response = exam.toObject();
    response.startDate = exam.scheduledAt;
    response.endDate = exam.endsAt;
    
    res.json(response);
  } catch (error) {
    console.error('Update exam error:', error);
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
    const student = await User.findById(req.user.id).select('class');
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
const getStudentExamResult = async (req, res) => {
  try {
    const { id: examId } = req.params;
    const studentId = req.user.id;

    // Find the submission for this student and exam
    const submission = await Submission.findOne({
      exam: examId,
      student: studentId
    })
    .populate({
      path: 'exam',
      select: 'title subject passingMarks totalMarks questions showResults',
      populate: {
        path: 'questions.question',
        select: 'text type points options correctAnswer comprehensionQuestions'
      }
    })
    .populate('answers.question', 'text type points');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
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
    let actualMaxScore = 0;
    
    if (submission.exam && submission.exam.questions) {
      submission.exam.questions.forEach(q => {
        const questionId = q.question?._id?.toString() || q.question?.toString();
        const points = q.points || 1;
        
        if (questionId) {
          questionPointsMap.set(questionId, points);
        }
        
        // Handle comprehension questions (count each sub-question)
        if (q.question?.type === 'comprehension' && q.question.comprehensionQuestions) {
          actualMaxScore += q.question.comprehensionQuestions.length;
        } else {
          actualMaxScore += points;
        }
      });
    }

    // Process answers to ensure awardedMarks is set correctly
    const processedAnswers = submission.answers.map((ans) => {
      const questionId = ans.question?._id?.toString() || ans.question?.toString();
      const maxPoints = questionPointsMap.get(questionId) || 1;
      
      // Ensure awardedMarks is set
      let awardedMarks = ans.awardedMarks;
      
      // If awardedMarks is not set but answer is correct, set to max points
      if ((awardedMarks === undefined || awardedMarks === null || awardedMarks === 0) && ans.isCorrect === true) {
        awardedMarks = maxPoints;
      }
      
      // If still undefined, default to 0
      if (awardedMarks === undefined || awardedMarks === null) {
        awardedMarks = 0;
      }

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

    // Calculate total score by summing awardedMarks
    const calculatedTotalScore = processedAnswers.reduce((sum, ans) => sum + (ans.awardedMarks || 0), 0);
    
    // Use the model's virtual fields for correct calculations
    // The model's pre-save hook and virtuals will handle any maxScore inconsistencies
    
    // Determine the correct max score to use
    let correctedMaxScore = submission.maxScore;
    
    // If maxScore is 100 but we have a reasonable number of answers, use answer count
    if (submission.maxScore === 100 && submission.answers.length <= 30 && submission.answers.length > 0) {
      console.log(`📊 Fixing maxScore from ${submission.maxScore} to ${submission.answers.length} for submission ${submission._id}`);
      correctedMaxScore = submission.answers.length;
    } 
    // If we calculated actualMaxScore from questions and it matches answer count, use that
    else if (actualMaxScore > 0 && actualMaxScore === submission.answers.length) {
      correctedMaxScore = actualMaxScore;
    }
    // Fallback to answer count if nothing else makes sense
    else if (submission.answers.length > 0 && (correctedMaxScore === 0 || correctedMaxScore > submission.answers.length * 5)) {
      correctedMaxScore = submission.answers.length;
    }

    // Calculate percentage using corrected max score
    const percentage = correctedMaxScore > 0 ? (calculatedTotalScore / correctedMaxScore) * 100 : 0;

    // Determine grade based on percentage
    let grade = 'F';
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B';
    else if (percentage >= 60) grade = 'C';
    else if (percentage >= 50) grade = 'D';

    // Check if passed based on exam passing marks
    const passingMarks = submission.exam?.passingMarks || 40;
    const passed = percentage >= passingMarks;

    // Create the response object
    const responseData = {
      _id: submission._id,
      exam: {
        _id: submission.exam?._id,
        title: submission.exam?.title || 'Exam',
        subject: submission.exam?.subject || null,
        passingMarks: submission.exam?.passingMarks,
        totalMarks: correctedMaxScore, // This will be 20 instead of 100
        showResults: submission.exam?.showResults
      },
      answers: processedAnswers,
      totalScore: calculatedTotalScore, // This will be 18
      maxScore: correctedMaxScore, // This will be 20
      percentage: Math.round(percentage * 100) / 100, // This will be 90
      displayScore: `${calculatedTotalScore}/${correctedMaxScore}`, // "18/20"
      grade: grade,
      passed: passed,
      status: submission.status,
      startedAt: submission.startTime,
      submittedAt: submission.submittedAt || submission.createdAt,
      gradedAt: submission.gradedAt,
      feedback: submission.feedback,
      timeSpent: submission.timeSpent,
      warnings: submission.warnings,
      reevaluationRequested: submission.reevaluationRequested,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      // Include metadata if available
      metadata: submission.metadata || null,
      // Flag if max score was corrected
      maxScoreCorrected: submission.maxScore !== correctedMaxScore
    };

    // Log the correction for debugging
    if (submission.maxScore !== correctedMaxScore) {
      console.log(`✅ Score corrected: ${submission.maxScore} → ${correctedMaxScore} for submission ${submission._id}`);
    }

    res.json(responseData);
  } catch (error) {
    console.error('Get student exam result error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch result.',
      error: error.message 
    });
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
      createdBy: req.user.id
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
// controllers/exam.controller.js - Update startExam function

// controllers/exam.controller.js - Fixed startExam function
const startExam = async (req, res) => {
  try {
    const { id: examId } = req.params;
    const studentId = req.user.id;

    console.log('=== START EXAM DEBUG ===');
    console.log('Exam ID:', examId);
    console.log('Student ID:', studentId);

    // 1. Validate exam exists and is published
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found.' });
    }
    
    if (exam.status !== 'published') {
      return res.status(400).json({ message: 'Exam not available.' });
    }

    console.log('Exam found:', {
      title: exam.title,
      duration: exam.duration,
      scheduledAt: exam.scheduledAt,
      endsAt: exam.endsAt
    });

    // 2. Validate timing - Check if within the exam window
    const now = new Date();
    const scheduledAt = new Date(exam.scheduledAt);
    const endsAt = new Date(exam.endsAt);

    console.log('Timing check:', {
      now: now.toISOString(),
      scheduledAt: scheduledAt.toISOString(),
      endsAt: endsAt.toISOString()
    });

    if (now < scheduledAt) {
      return res.status(400).json({ message: 'Exam has not started yet.' });
    }
    if (now > endsAt) {
      return res.status(400).json({ message: 'Exam window has closed.' });
    }

    // 3. Check if student already has a submission
    let submission = await Submission.findOne({ exam: examId, student: studentId });

    console.log('Submission check:', submission ? {
      id: submission._id,
      status: submission.status,
      startTime: submission.startTime,
      timeSpent: submission.timeSpent
    } : 'No existing submission');

    // Calculate exam duration in milliseconds
    const examDurationMs = (exam.duration || 10) * 60 * 1000; // minutes → ms
    console.log('Duration in ms:', examDurationMs);

    if (submission) {
      if (submission.status !== 'draft') {
        return res.status(400).json({ message: 'Exam already submitted.' });
      }
      
      // Calculate time left based on startTime + duration
      const examStartTime = new Date(submission.startTime);
      const examEndTime = new Date(examStartTime.getTime() + examDurationMs);
      let timeLeftMs = examEndTime - now;
      
      // Ensure timeLeft is not negative
      timeLeftMs = Math.max(0, timeLeftMs);
      
      console.log('Resuming exam calculation:', {
        examStartTime: examStartTime.toISOString(),
        examEndTime: examEndTime.toISOString(),
        now: now.toISOString(),
        timeLeftMs,
        timeLeftMinutes: Math.floor(timeLeftMs / 60000)
      });
      
      // Get questions
      const fullQuestions = await getExamQuestions(exam);
      
      return res.json({
        submissionId: submission._id,
        timeLeft: timeLeftMs, // in milliseconds
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
          questions: fullQuestions
        }
      });
    } else {
      // Create new draft submission
      submission = new Submission({
        exam: examId,
        student: studentId,
        startTime: now,
        maxScore: exam.totalMarks || 100,
        status: 'draft',
        answers: [],
        timeSpent: 0
      });
      await submission.save();

      // For new exam, time left is the full duration
      const timeLeftMs = examDurationMs;

      console.log('Starting new exam:', {
        startTime: now.toISOString(),
        duration: exam.duration,
        timeLeftMs,
        timeLeftMinutes: exam.duration
      });

      const fullQuestions = await getExamQuestions(exam);

      res.json({
        submissionId: submission._id,
        timeLeft: timeLeftMs, // in milliseconds
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
          questions: fullQuestions
        }
      });
    }
  } catch (error) {
    console.error('Start exam error:', error);
    res.status(500).json({ 
      message: 'Failed to start exam.',
      error: error.message 
    });
  }
};

// Helper function to get exam questions (make sure this is defined)
async function getExamQuestions(exam) {
  try {
    const questionIds = exam.questions.map(q => q.question);
    const fullQuestions = await Question.find({ _id: { $in: questionIds } })
      .select('text type options diagrams imageUrl passage comprehensionQuestions points totalMarks');

    const questionMap = {};
    fullQuestions.forEach(q => {
      questionMap[q._id.toString()] = q;
    });

    return exam.questions.map(eq => {
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
      
      if (q.type === 'comprehension') {
        return {
          _id: q._id,
          type: 'comprehension',
          text: q.text || '',
          marks: eq.points || q.points || 1,
          options: q.options || [],
          diagrams: q.diagrams || [],
          imageUrl: q.imageUrl,
          title: q.passage?.title || '',
          passage: q.passage?.content || q.text || '',
          comprehensionQuestions: q.comprehensionQuestions || [],
          questions: q.comprehensionQuestions || [],
          totalMarks: q.totalMarks || 
            (q.comprehensionQuestions?.reduce((sum, sq) => sum + (sq.marks || 1), 0) || eq.points || 1)
        };
      }
      
      return {
        _id: q._id,
        type: q.type,
        text: q.text,
        marks: eq.points || q.points || 1,
        options: q.options || [],
        diagrams: q.diagrams || [],
        imageUrl: q.imageUrl
      };
    });
  } catch (error) {
    console.error('Error getting exam questions:', error);
    return [];
  }
}

// Make sure to export the function
 
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
