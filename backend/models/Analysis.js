const mongoose = require('mongoose');

const PIPELINE_STATUSES = ['new', 'shortlisted', 'interview', 'rejected'];

const analysisSchema = new mongoose.Schema({
  user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileName:          String,
  hasJobDescription: Boolean,
  result:            { type: mongoose.Schema.Types.Mixed, required: true },

  // Hash of the CV content: the same CV under different file names is one candidate
  cvHash:            { type: String, index: true },

  // Kept so "Improve my CV" works from History. Never returned unless explicitly selected.
  cvText:            { type: String, select: false },
  jobDescription:    { type: String, select: false },

  // Recruiter pipeline
  status:            { type: String, enum: PIPELINE_STATUSES, default: 'new' },
  note:              { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });

module.exports = mongoose.model('Analysis', analysisSchema);