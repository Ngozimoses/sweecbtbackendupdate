// models/Exam.js
const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Exam title is required'],
    trim: true,
    maxlength: 200
  },
  class: {
    type: mongoose.Schema.ObjectId,
    ref: 'Class',
    required: [true, 'Class is required']
  },
  subject: {
    type: mongoose.Schema.ObjectId,
    ref: 'Subject',
    required: [true, 'Subject is required']
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  duration: {
    type: Number,
    required: [true, 'Duration (in minutes) is required'],
    min: [5, 'Duration must be at least 5 minutes'],
    max: [300, 'Duration cannot exceed 300 minutes']
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  passingMarks: { type: Number, default: 40 },
  totalMarks: { type: Number, default: 100 },
  shuffleQuestions: { type: Boolean, default: true },
  showResults: { type: Boolean, default: false },
  
  // Updated questions array to handle both regular and comprehension
  questions: [{
    question: {
      type: mongoose.Schema.ObjectId,
      ref: 'Question',
      required: true
    },
    points: {
      type: Number,
      min: 0.5,
      default: 1
    },
    // NEW: For comprehension passages, store which sub-questions are included
    includedSubQuestions: [{
      type: mongoose.Schema.ObjectId
    }]
  }],
  
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'completed'],
    default: 'draft'
  },
  scheduledAt: { type: Date },
  endsAt: { type: Date },
  instructions: {
    type: String,
    default: ''
  },
  totalStudents: { type: Number, default: 0 },
  completed: { type: Number, default: 0 },
  publishedAt: { type: Date }
}, {
  timestamps: true
});

ExamSchema.index({ class: 1 });
ExamSchema.index({ subject: 1 });
ExamSchema.index({ status: 1 });
ExamSchema.index({ scheduledAt: 1 });
ExamSchema.index({ endsAt: 1 });
ExamSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Exam', ExamSchema);