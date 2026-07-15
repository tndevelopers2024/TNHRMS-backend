const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const Announcement = require('../models/Announcement');
const Payslip = require('../models/Payslip');

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
router.put('/update-profile/:userId', async (req, res) => {
  const { profileImage } = req.body;
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
    
    await attendance.save();
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
router.post('/leaves', async (req, res) => {
  const { employee, type, startDate, endDate, days, reason, attachment } = req.body;
  try {
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

module.exports = router;
