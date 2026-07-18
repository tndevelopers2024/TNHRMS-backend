const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');

// Auth middleware
const protect = (req, res, next) => {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey_tn_hrms_2026');
    req.user = decoded; // has id and role
    next();
  } catch (error) {
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// GET all notifications for a user (or admin)
router.get('/', protect, async (req, res) => {
  try {
    const query = {
      $or: [
        { recipient: req.user.id }
      ]
    };
    // If admin, they also get notifications directed to 'admin'
    if (req.user.role === 'admin') {
      query.$or.push({ recipient: 'admin' });
    }

    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /:id/read - Mark notification as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Check ownership
    const isOwner = notification.recipient.toString() === req.user.id.toString();
    const isAdminNotification = notification.recipient === 'admin' && req.user.role === 'admin';
    
    if (!isOwner && !isAdminNotification) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    notification.read = true;
    await notification.save();
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /read-all - Mark all as read
router.put('/read-all', protect, async (req, res) => {
  try {
    const query = {
      $or: [
        { recipient: req.user.id }
      ]
    };
    if (req.user.role === 'admin') {
      query.$or.push({ recipient: 'admin' });
    }

    await Notification.updateMany(query, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
