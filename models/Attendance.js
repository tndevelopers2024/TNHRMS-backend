const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: String, // Format: YYYY-MM-DD for easy querying
    required: true,
  },
  checkInTime: {
    type: Date,
    required: true,
  },
  checkOutTime: {
    type: Date,
  },
  summary: {
    type: String,
  },
  totalHours: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['Present', 'Auto-Leave'],
    default: 'Present',
  }
}, { timestamps: true });

// Prevent multiple attendance records for the same employee on the same date
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
