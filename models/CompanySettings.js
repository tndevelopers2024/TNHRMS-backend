const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: 'Techie Nutpam' },
    taxId: { type: String, default: '' },
    address: { type: String, default: 'Tamil Nadu, India' },
    postalCode: { type: String, default: '' },
    phone: { type: String, default: '+91 98765 43210' },
    email: { type: String, default: 'contact@techienutpam.in' },
    logoUrl: { type: String, default: '/logo.png' },
    paymentDetails: {
      primaryHolderName: { type: String, default: 'TECHIENUTPAM (OPC) PRIVATE LIMITED' },
      accountNumber: { type: String, default: '5020 0123 8459 51' },
      accountType: { type: String, default: 'Current Account' },
      bankName: { type: String, default: 'HDFC Bank' },
      ifscCode: { type: String, default: 'HDFC0002050' },
      branch: { type: String, default: 'PALLAVARAM' },
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
