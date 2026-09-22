const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  rate: { type: Number, required: true, default: 0 }, // Price
  tax: { type: Number, default: 0 }, // Tax percentage or amount on item
  amount: { type: Number, required: true, default: 0 }, // Subtotal
});

const invoiceSchema = new mongoose.Schema(
  {
    invoiceType: {
      type: String,
      enum: ['Invoice', 'Tax Invoice', 'Proforma Invoice'],
      default: 'Invoice',
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    orderNumber: {
      type: String,
      default: '',
    },
    format: {
      type: String,
      default: 'Standard',
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled'],
      default: 'Pending',
    },
    // Issuer details
    sender: {
      name: { type: String, required: true, default: 'Techie Nutpam' },
      companyName: { type: String, default: 'Techie Nutpam' },
      taxId: { type: String, default: '' },
      gstin: { type: String, default: '' },
      address: { type: String, default: 'Tamil Nadu, India' },
      postalCode: { type: String, default: '' },
      email: { type: String, default: 'contact@techienutpam.in' },
      phone: { type: String, default: '+91 98765 43210' },
      logoUrl: { type: String, default: '/logo.png' },
      website: { type: String, default: 'https://techienutpam.in' },
    },
    // Recipient details
    client: {
      name: { type: String, required: true },
      companyName: { type: String, default: '' },
      taxId: { type: String, default: '' },
      gstin: { type: String, default: '' },
      address: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    items: [invoiceItemSchema],
    subtotal: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    // Signature
    signature: {
      signatureType: { type: String, default: 'typed' }, // 'typed' | 'drawn' | 'uploaded'
      data: { type: String, default: '' },
      signatoryName: { type: String, default: '' },
    },
    paymentDetails: {
      primaryHolderName: { type: String, default: 'TECHIENUTPAM (OPC) PRIVATE LIMITED' },
      accountName: { type: String, default: 'TECHIENUTPAM (OPC) PRIVATE LIMITED' },
      accountNumber: { type: String, default: '5020 0123 8459 51' },
      accountType: { type: String, default: 'Current Account' },
      bankName: { type: String, default: 'HDFC Bank' },
      ifscCode: { type: String, default: 'HDFC0002050' },
      branch: { type: String, default: 'PALLAVARAM' },
      upiId: { type: String, default: '' },
      notes: { type: String, default: '' },
    },
    notes: { type: String, default: 'Thank you for your business!' },
    terms: { type: String, default: 'Payment is due within the stipulated date. Goods/services once provided are subject to our standard terms.' },
    extraFields: [
      {
        label: { type: String },
        value: { type: String }
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
