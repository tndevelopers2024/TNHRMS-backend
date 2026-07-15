const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'employee'],
    default: 'employee',
  },
  department: {
    type: String,
  },
  designation: {
    type: String,
  },
  phone: {
    type: String,
  },
  address: {
    type: String,
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
  },
  dob: {
    type: Date,
  },
  joiningDate: {
    type: Date,
  },
  salary: {
    type: Number,
  },
  salaryHistory: [{
    salary: Number,
    date: { type: Date, default: Date.now }
  }],
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  profileImage: {
    type: String, // Store base64 encoded image string
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  resetPasswordOTP: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
