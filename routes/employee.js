const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Notification = require('../models/Notification');
const Attendance = require('../models/Attendance');
const Announcement = require('../models/Announcement');
const Payslip = require('../models/Payslip');
const Holiday = require('../models/Holiday');
const { sendStylishEmail } = require('../utils/emailService');
const upload = require('../utils/upload');

// GET all tasks for the logged-in employee
router.get('/tasks/:userId', async (req, res) => {
  try {
    const tasks = await Task.find({ employee: req.params.userId }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET employee profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT employee profile image
router.put('/update-profile/:userId', upload.single('profileImage'), async (req, res) => {
  let profileImage = req.body.profileImage;
  if (req.file) {
    profileImage = `/uploads/${req.file.filename}`; // Storing relative path is better
  }
  
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { profileImage }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT employee password
router.put('/update-password/:userId', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect current password' });
    
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update multiple task statuses
router.put('/tasks/status', async (req, res) => {
  const { taskUpdates } = req.body;
  // taskUpdates: [{ id: 'task_id', status: 'Completed' }, ...]
  
  try {
    for (let update of taskUpdates) {
      if (update.id && update.status) {
        const updateData = { status: update.status };
        if (update.comment !== undefined) {
          updateData.employeeComment = update.comment;
        }
        await Task.findByIdAndUpdate(update.id, updateData);
      }
    }

    // Emit notification to admin
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('notification', { 
        message: 'An employee updated their task status.', 
        type: 'task_update' 
      });
    }

    res.json({ message: 'Tasks updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET attendance history
router.get('/attendance/:userId', async (req, res) => {
  try {
    const records = await Attendance.find({ employee: req.params.userId }).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST checkin
router.post('/attendance/checkin', async (req, res) => {
  const { userId } = req.body;
  
  // Convert current time to local date string YYYY-MM-DD
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  
  try {
    let attendance = await Attendance.findOne({ employee: userId, date: dateStr });
    if (!attendance) {
      attendance = new Attendance({
        employee: userId,
        date: dateStr,
        checkInTime: new Date()
      });
      await attendance.save();
      
      // Notify Admin via Email
      const user = await User.findById(userId);
      if (user) {
        await sendStylishEmail(
          process.env.EMAIL_USER,
          `Check-In Alert: ${user.name}`,
          `Employee Checked In ⏱️`,
          `${user.name} has just checked in for the day.`,
          `<div style="font-size: 18px; font-weight: bold; color: #4f46e5;">Check-In Time: ${new Date().toLocaleTimeString()}</div>`,
          `You can view the detailed attendance logs in the Admin Dashboard.`
        );
      }
    }
    res.json({ message: 'Checked in successfully', record: attendance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST checkout
router.post('/attendance/checkout', async (req, res) => {
  const { userId, summary } = req.body;
  
  // Convert current time to local date string YYYY-MM-DD
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  
  try {
    const attendance = await Attendance.findOne({ employee: userId, date: dateStr });
    if (!attendance) {
      return res.status(404).json({ message: 'No active check-in found for today' });
    }
    
    attendance.checkOutTime = new Date();
    attendance.summary = summary;
    
    // Calculate total hours
    const msDiff = attendance.checkOutTime - attendance.checkInTime;
    const hours = msDiff / (1000 * 60 * 60);
    attendance.totalHours = parseFloat(hours.toFixed(2));
    
    if (attendance.totalHours < 4) {
      attendance.status = 'Auto-Leave';
    } else if (attendance.totalHours < 8) {
      attendance.status = 'Half-Day Leave';
    } else {
      attendance.status = 'Present';
    }
    
    await attendance.save();
    
    // Notify Admin via Email
    const user = await User.findById(userId);
    if (user) {
      await sendStylishEmail(
        process.env.EMAIL_USER,
        `Check-Out Alert: ${user.name}`,
        `Employee Checked Out 🏁`,
        `${user.name} has checked out.`,
        `<div style="background-color: #f8fafc; padding: 15px; border-radius: 8px;">
           <p style="margin: 0; color: #1e293b;">Total Hours Worked: <strong style="color: #4f46e5;">${attendance.totalHours} hrs</strong></p>
           <p style="margin: 5px 0 0; color: #64748b;">Summary: ${summary || 'No summary provided.'}</p>
         </div>`,
        `You can view the detailed attendance logs in the Admin Dashboard.`
      );
    }
    
    res.json({ message: 'Checked out successfully', record: attendance });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all leaves for a specific employee
router.get('/leaves/:userId', async (req, res) => {
  try {
    const leaves = await Leave.find({ employee: req.params.userId }).sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new leave application
router.post('/leaves', upload.single('attachment'), async (req, res) => {
  const { employee, type, startDate, endDate, days, reason } = req.body;
  let attachment = req.body.attachment;
  
  if (req.file) {
    attachment = `/uploads/${req.file.filename}`;
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);

    if (end < start) {
      return res.status(400).json({ message: "End date cannot be before start date." });
    }

    if (start < today && type !== "Sick Leave") {
      return res.status(400).json({ message: `${type} must be applied in advance. Only Sick Leave can be applied for past dates.` });
    }

    const leaves = await Leave.find({ employee });
    const usedLeaves = leaves
      .filter(l => l.type === type && (l.status === 'Approved' || l.status === 'Pending'))
      .reduce((acc, curr) => acc + (curr.days || 0), 0);

    const balanceConfig = {
      "Casual Leave": 10,
      "Sick Leave": 10,
      "Earned Leave": 15
    };

    let totalUsed = usedLeaves;
    if (type === 'Casual Leave') {
      const Attendance = require('../models/Attendance');
      const autoLeavesCount = await Attendance.countDocuments({ employee, status: 'Auto-Leave' });
      totalUsed += autoLeavesCount;
    }

    const maxDays = balanceConfig[type] || 0;
    if (days > (maxDays - totalUsed)) {
      return res.status(400).json({ message: `You only have ${maxDays - totalUsed} day(s) of ${type} remaining.` });
    }

    const newLeave = new Leave({
      employee,
      type,
      startDate,
      endDate,
      days,
      reason,
      attachment
    });
    const savedLeave = await newLeave.save();

    // Emit notification to admin
    const io = req.app.get('io');
    if (io) {
      io.to('admin').emit('notification', { 
        message: 'A new leave application has been submitted.', 
        type: 'leave_application' 
      });
    }

    // Notify Admin via Email
    const user = await User.findById(employee);
    if (user) {
      await sendStylishEmail(
        process.env.EMAIL_USER,
        `New Leave Application: ${user.name}`,
        `New Leave Request 📝`,
        `${user.name} has submitted a new leave application.`,
        `<div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; text-align: left; display: inline-block;">
           <p style="margin: 5px 0;"><strong>Type:</strong> ${type}</p>
           <p style="margin: 5px 0;"><strong>Duration:</strong> ${days} day(s)</p>
           <p style="margin: 5px 0;"><strong>From:</strong> ${new Date(startDate).toLocaleDateString()} <strong>To:</strong> ${new Date(endDate).toLocaleDateString()}</p>
           <p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>
         </div>`,
        `Please review the request in the Admin Dashboard.`
      );
    }

    res.status(201).json(savedLeave);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE a leave application (Cancel)
router.delete('/leaves/:leaveId', async (req, res) => {
  try {
    const leave = await Leave.findByIdAndDelete(req.params.leaveId);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    res.json({ message: 'Leave cancelled successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all announcements
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ date: -1 }).limit(10);
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET latest payslip for a specific employee
router.get('/payslips/latest/:userId', async (req, res) => {
  try {
    const payslip = await Payslip.findOne({ employee: req.params.userId }).sort({ createdAt: -1 });
    res.json(payslip);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all payslips for a specific employee
router.get('/payslips/:userId', async (req, res) => {
  try {
    const payslips = await Payslip.find({ employee: req.params.userId }).sort({ createdAt: -1 });
    res.json(payslips);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET upcoming holiday
router.get('/holidays/upcoming', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingHoliday = await Holiday.findOne({ date: { $gte: today } }).sort({ date: 1 });
    res.json(upcomingHoliday);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT full employee profile (with documents)
const documentFields = upload.fields([
  { name: 'panCard', maxCount: 1 },
  { name: 'aadhaarCard', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'photograph', maxCount: 1 },
  { name: 'cancelledCheque', maxCount: 1 },
  { name: 'form16', maxCount: 1 },
  { name: 'tenthMarkSheet', maxCount: 1 },
  { name: 'twelfthMarkSheet', maxCount: 1 },
  { name: 'diplomaCertificate', maxCount: 1 },
  { name: 'degreeCertificate', maxCount: 1 },
  { name: 'degreeMarkSheet', maxCount: 1 },
  { name: 'postgraduateCertificate', maxCount: 1 },
  { name: 'relievingLetter', maxCount: 1 },
  { name: 'experienceCertificate', maxCount: 1 },
  { name: 'salarySlip', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 }
]);

router.put('/profile-details/:userId', documentFields, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update text fields
    const {
      name, dob, gender, maritalStatus, address, phone, email, bloodGroup,
      accountHolderName, accountNumber, bankName, ifscCode, uan,
      emergencyContactName, emergencyContactRelationship, emergencyContactPhone,
      professionalReferences // JSON string
    } = req.body;

    const pendingUpdate = {
      name, dob, gender, maritalStatus, address, phone, email, bloodGroup,
      bankingDetails: {
        ...(user.bankingDetails || {}),
        ...(accountHolderName && { accountHolderName }),
        ...(accountNumber && { accountNumber }),
        ...(bankName && { bankName }),
        ...(ifscCode && { ifscCode }),
        ...(uan && { uan }),
      },
      emergencyContact: {
        ...(user.emergencyContact || {}),
        ...(emergencyContactName && { name: emergencyContactName }),
        ...(emergencyContactRelationship && { relationship: emergencyContactRelationship }),
        ...(emergencyContactPhone && { phone: emergencyContactPhone }),
      }
    };

    if (professionalReferences) {
      try {
        pendingUpdate.professionalReferences = JSON.parse(professionalReferences);
      } catch (e) {
        console.error("Failed to parse references:", e);
      }
    }

    // Process uploaded files
    pendingUpdate.documents = { ...(user.documents || {}) };
    if (req.files) {
      for (const [fieldname, files] of Object.entries(req.files)) {
        if (files && files.length > 0) {
          pendingUpdate.documents[fieldname] = '/uploads/' + files[0].filename;
        }
      }
    }

    user.pendingProfileUpdates = pendingUpdate;
    // We must tell mongoose that the mixed type field has changed
    user.markModified('pendingProfileUpdates');
    
    await user.save();

    // Create notification for admin
    const notif = await Notification.create({
      recipient: 'admin',
      title: 'Profile Update Submitted',
      message: `${user.name} has submitted profile updates for review.`,
      type: 'profile_update',
      relatedUser: user._id
    });
    
    const io = req.app.get('io');
    if (io) io.to('admin').emit('notification', notif);

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
