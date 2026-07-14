const mongoose = require('mongoose');

const payslipSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  netPay: { type: Number, required: true },
  fileUrl: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Payslip', payslipSchema);
