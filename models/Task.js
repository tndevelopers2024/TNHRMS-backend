const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  deadline: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'],
    default: 'Pending',
  },
  employeeComment: {
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
