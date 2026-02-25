// models/Submission.js
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

// Indexes
SubmissionSchema.index({ exam: 1 });
SubmissionSchema.index({ student: 1 });
SubmissionSchema.index({ status: 1 });
SubmissionSchema.index({ createdAt: 1 });
SubmissionSchema.index({ 'exam': 1, 'student': 1 }, { unique: true });

module.exports = mongoose.model('Submission', SubmissionSchema);
