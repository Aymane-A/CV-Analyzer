const mongoose = require('mongoose');

const jobOfferSchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  text:  { type: String, required: true, maxlength: 4000 }
}, { timestamps: true });

module.exports = mongoose.model('JobOffer', jobOfferSchema);
