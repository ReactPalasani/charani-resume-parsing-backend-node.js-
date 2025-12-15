

const mongoose = require('mongoose');

const ResumeSchema = new mongoose.Schema(
  {
    parsedData: {
      type: mongoose.Schema.Types.Mixed, // 👈 FULL JSON
      required: true
    },
    rawText: String,
    workerPid: Number
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resume', ResumeSchema);
