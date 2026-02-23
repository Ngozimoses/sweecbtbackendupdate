// models/Question.js
const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Question text is required'],
    maxlength: 2000
  },
  type: {
    type: String,
    enum: ['multiple_choice', 'true_false', 'short_answer', 'comprehension'],
    default: 'multiple_choice'
  },
  points: {
    type: Number,
    min: 0.5,
    default: 1
  },
  // For regular questions
  options: [{
    text: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false },
    imageUrl: { type: String, default: null } // NEW: for option images
  }],
  // NEW: For question-level diagrams
  diagrams: [{
    url: { type: String, required: true },
    alt: { type: String, default: 'Diagram' }
  }],
  imageUrl: { type: String, default: null }, // For backward compatibility
  
  // NEW: For comprehension passages
  passage: {
    title: { type: String, default: '' },
    content: { type: String, default: '' }, // The comprehension text
    diagrams: [{ // Diagrams for the passage
      url: { type: String, required: true },
      alt: { type: String, default: 'Passage diagram' }
    }]
  },
  
  // NEW: For comprehension questions (nested)
  comprehensionQuestions: [{
    _id: { type: mongoose.Schema.ObjectId, auto: true },
    type: {
      type: String,
      enum: ['multiple_choice', 'true_false', 'short_answer'],
      required: true
    },
    text: { type: String, required: true },
    marks: { type: Number, default: 1 },
    options: [{
      text: { type: String, default: '' },
      isCorrect: { type: Boolean, default: false },
      imageUrl: { type: String, default: null }
    }],
    diagrams: [{
      url: { type: String },
      alt: { type: String }
    }],
    imageUrl: { type: String, default: null },
    expectedAnswer: { type: String, maxlength: 200 }
  }],
  
  // For short-answer
  expectedAnswer: {
    type: String,
    maxlength: 200
  },
  
  subject: {
    type: mongoose.Schema.ObjectId,
    ref: 'Subject',
    required: [true, 'Subject is required']
  },
  topic: {
    type: String,
    trim: true,
    maxlength: 100
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  sharedWith: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for comprehension total marks
QuestionSchema.virtual('totalMarks').get(function() {
  if (this.type === 'comprehension' && this.comprehensionQuestions) {
    return this.comprehensionQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
  }
  return this.points || 1;
});

QuestionSchema.index({ subject: 1 });
QuestionSchema.index({ createdBy: 1 });
QuestionSchema.index({ difficulty: 1 });
QuestionSchema.index({ 'sharedWith': 1 });
QuestionSchema.index({ type: 1 });

module.exports = mongoose.model('Question', QuestionSchema);