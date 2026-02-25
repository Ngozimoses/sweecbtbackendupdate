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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for corrected max score (handles the 100 vs 20 issue)
SubmissionSchema.virtual('correctedMaxScore').get(function() {
  // If maxScore is 100 but we have a reasonable number of answers (like 20)
  if (this.maxScore === 100 && this.answers && this.answers.length > 0 && this.answers.length <= 30) {
    return this.answers.length;
  }
  return this.maxScore;
});

// Virtual for correct percentage calculation
SubmissionSchema.virtual('correctPercentage').get(function() {
  const maxScoreToUse = this.correctedMaxScore;
  return maxScoreToUse > 0 ? (this.totalScore / maxScoreToUse) * 100 : 0;
});

// Virtual for display score (e.g., "18/20")
SubmissionSchema.virtual('displayScore').get(function() {
  return `${this.totalScore}/${this.correctedMaxScore}`;
});

// Virtual to check if maxScore needs correction
SubmissionSchema.virtual('maxScoreNeedsCorrection').get(function() {
  return this.maxScore === 100 && this.answers && this.answers.length > 0 && this.answers.length <= 30;
});

// Indexes
SubmissionSchema.index({ exam: 1 });
SubmissionSchema.index({ student: 1 });
SubmissionSchema.index({ status: 1 });
SubmissionSchema.index({ createdAt: 1 });
SubmissionSchema.index({ 'exam': 1, 'student': 1 }, { unique: true });

module.exports = mongoose.model('Submission', SubmissionSchema);
