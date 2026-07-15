const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  lpa: { type: Number },
  monthlySalary: { type: Number },
  lopDays: { type: Number },
  totalDeduction: { type: Number },
  netPay: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
  fileUrl: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Payslip', payslipSchema);
