const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.ObjectId,
    ref: 'Question',
    required: true
  },
  // NEW: For comprehension sub-questions
  subQuestionId: {
    type: mongoose.Schema.ObjectId,
    default: null
  },
  answer: mongoose.Schema.Types.Mixed,
  isCorrect: {
    type: Boolean,
    default: null
  },
  awardedMarks: {
    type: Number,
    default: 0
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  // NEW: Store the actual answer text/choice for reference
  answerText: {
    type: String,
    default: ''
  }
});

const SubmissionSchema = new mongoose.Schema({
  exam: {
    type: mongoose.Schema.ObjectId,
    ref: 'Exam',
    required: true
  },
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  answers: [answerSchema],
  timeSpent: {
    type: Number,
    required: true
  },
  warnings: [{
    type: String,
    enum: ['switched-tab', 'idle-time', 'screenshot-detected']
  }],
  status: {
    type: String,
    enum: ['draft', 'submitted', 'graded', 'published', 'reeval-requested'],
    default: 'draft'
  },
  totalScore: {
    type: Number,
    default: 0
  },
  maxScore: {
    type: Number,
    required: true
  },
  feedback: {
    type: String,
    default: ''
  },
  gradedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  reevaluationRequested: {
    type: Boolean,
    default: false
  },
  // NEW: Store metadata about the submission
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceInfo: String
  }
}, {
  timestamps: true
});

// Pre-save hook to validate and correct maxScore
SubmissionSchema.pre('save', async function(next) {
  try {
    // Only run this check if we have answers and we're not in the middle of grading
    if (this.answers && this.answers.length > 0) {
      
      // If maxScore is suspiciously high (like 100) but we have a reasonable number of answers
      if (this.maxScore === 100 && this.answers.length <= 30) {
        console.log(`⚠️ Fixing maxScore from ${this.maxScore} to ${this.answers.length} based on answer count`);
        this.maxScore = this.answers.length;
      }
      
      // More accurate: Try to get the exam and calculate real max score
      if (!this.populated('exam')) {
        const Exam = mongoose.model('Exam');
        const exam = await Exam.findById(this.exam).populate('questions.question');
        
        if (exam) {
          let calculatedMaxScore = 0;
          
          // Calculate based on exam structure
          exam.questions.forEach(eq => {
            if (eq.question && eq.question.type === 'comprehension' && eq.question.comprehensionQuestions) {
              // Each comprehension sub-question is worth 1 mark
              calculatedMaxScore += eq.question.comprehensionQuestions.length;
            } else {
              // Regular question is worth 1 mark
              calculatedMaxScore += 1;
            }
          });
          
          // If calculated max score matches answer count, use it
          if (calculatedMaxScore === this.answers.length && this.maxScore !== calculatedMaxScore) {
            console.log(`✅ Correcting maxScore from ${this.maxScore} to ${calculatedMaxScore}`);
            this.maxScore = calculatedMaxScore;
          }
        }
      }
    }
    next();
  } catch (error) {
    console.error('Error in Submission pre-save hook:', error);
    next(); // Continue even if error occurs
  }
});

// Post-find middleware to ensure correct maxScore when retrieving
SubmissionSchema.post('init', function(doc) {
  // If this is a new document or being fetched
  if (doc.answers && doc.answers.length > 0) {
    // If maxScore is 100 but we have a reasonable number of answers, flag for frontend
    if (doc.maxScore === 100 && doc.answers.length <= 30) {
      doc._maxScoreNeedsFixing = true;
      doc._correctMaxScore = doc.answers.length;
    }
  }
});

// Virtual for percentage that uses correct calculation
SubmissionSchema.virtual('correctPercentage').get(function() {
  const maxScoreToUse = (this.maxScore === 100 && this.answers?.length <= 30) 
    ? this.answers.length 
    : this.maxScore;
  
  return maxScoreToUse > 0 ? (this.totalScore / maxScoreToUse) * 100 : 0;
});

// Virtual for display score (e.g., "18/20")
SubmissionSchema.virtual('displayScore').get(function() {
  const maxScoreToUse = (this.maxScore === 100 && this.answers?.length <= 30) 
    ? this.answers.length 
    : this.maxScore;
  
  return `${this.totalScore}/${maxScoreToUse}`;
});

// Indexes
SubmissionSchema.index({ exam: 1 });
SubmissionSchema.index({ student: 1 });
SubmissionSchema.index({ status: 1 });
SubmissionSchema.index({ createdAt: 1 });
SubmissionSchema.index({ 'exam': 1, 'student': 1 }, { unique: true });

// Ensure virtuals are included in JSON responses
SubmissionSchema.set('toJSON', { virtuals: true });
SubmissionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Submission', SubmissionSchema);
