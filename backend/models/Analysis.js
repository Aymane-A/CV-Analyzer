const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileName:          String,
  hasJobDescription: Boolean,
  result:            { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Analysis', analysisSchema);