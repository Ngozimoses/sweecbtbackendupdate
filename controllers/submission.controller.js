// controllers/submission.controller.js
const Submission = require('../models/Submission');

// controllers/submission.controller.js
const autoSave = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    // ✅ ONLY update existing draft — never create new
    const submission = await Submission.findById(id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (submission.student.toString() !== req.user?._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // ✅ Only allow auto-save on drafts
    if (submission.status !== 'draft') {
      return res.status(400).json({ message: 'Cannot auto-save: exam already submitted' });
    }

    // Update answers
    submission.answers = answers.map(a => ({
      question: a.question,
      answer: a.answer,
      isCorrect: null,
      pointsAwarded: null
    }));

    await submission.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Auto-save error:', error);
    res.status(500).json({ message: 'Auto-save failed' });
  }
};
 
module.exports = { 
  autoSave
};
