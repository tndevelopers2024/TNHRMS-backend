require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Task = require('./models/Task');
const Leave = require('./models/Leave');
const Holiday = require('./models/Holiday');

const seedData = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    // Clear existing data (optional, but good for a fresh seed)
    await User.deleteMany({ role: 'employee' });
    await Task.deleteMany({});
    await Leave.deleteMany({});
    await Holiday.deleteMany({});
    console.log('Cleared existing employee, task, leave, and holiday data.');

    // Seed Admin (if not exists)
    const adminEmail = 'admin@techienutpam.in';
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const adminUser = new User({
        name: 'Techie Admin',
        email: adminEmail,
        password: 'admin_techie@2k26',
        role: 'admin',
        designation: 'System Administrator',
      });
      await adminUser.save();
      console.log('Admin user created.');
    }

    // Seed Employees
    const emp1 = new User({
      name: 'John Doe',
      email: 'john@techienutpam.in',
      password: 'password123',
      role: 'employee',
      department: 'Engineering',
      designation: 'Software Engineer',
    });
    
    const emp2 = new User({
      name: 'Jane Smith',
      email: 'jane@techienutpam.in',
      password: 'password123',
      role: 'employee',
      department: 'Design',
      designation: 'UI/UX Designer',
    });
    
    await emp1.save();
    await emp2.save();
    console.log('Employees seeded.');

    // Seed Tasks
    await Task.create([
      { employee: emp1._id, description: 'Complete API integration for Leave module', deadline: new Date(), status: 'Pending' },
      { employee: emp2._id, description: 'Design Admin Dashboard', deadline: new Date(new Date().setDate(new Date().getDate() - 1)), status: 'Completed' },
    ]);
    console.log('Tasks seeded.');

    // Seed Leaves
    await Leave.create([
      { employee: emp1._id, type: 'Sick Leave', duration: 'Aug 10 - Aug 11 (2 days)', reason: 'Fever and cold', status: 'Pending' },
      { employee: emp2._id, type: 'Casual Leave', duration: 'Aug 15 (1 day)', reason: 'Personal work', status: 'Pending' },
      { employee: emp1._id, type: 'Earned Leave', duration: 'Sep 01 - Sep 05 (5 days)', reason: 'Family vacation', status: 'Approved' },
    ]);
    console.log('Leaves seeded.');

    // Seed Holidays
    await Holiday.create([
      { name: "New Year's Day", date: new Date('2026-01-01'), type: 'National' },
      { name: "Independence Day", date: new Date('2026-08-15'), type: 'National' },
      { name: "Christmas", date: new Date('2026-12-25'), type: 'National' },
    ]);
    console.log('Holidays seeded.');

    console.log('Seeding process finished.');
    process.exit(0);
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  }
};

seedData();
