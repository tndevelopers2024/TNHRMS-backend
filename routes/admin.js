const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../models/User');
const Task = require('../models/Task');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const Department = require('../models/Department');
const Payslip = require('../models/Payslip');

// GET all employees
router.get('/employees', async (req, res) => {
  try {
    const employees = await User.find({ role: 'employee' }).select('-password');
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new employee
router.post('/employees', async (req, res) => {
  const { name, email, department, designation, phone, address, gender, dob, joiningDate, salary, emergencyContact } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate random 8 character password
    const generatedPassword = crypto.randomBytes(4).toString('hex');

    const newEmployee = new User({
      name,
      email,
      password: generatedPassword, // Password will be hashed in pre-save hook
      role: 'employee',
      department: department || 'General',
      designation: designation || 'Employee',
      phone,
      address,
      gender,
      dob,
      joiningDate,
      salary,
      salaryHistory: salary ? [{ salary, date: joiningDate ? new Date(joiningDate) : new Date() }] : [],
      emergencyContact
    });

    await newEmployee.save();

    // Send email with password
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Welcome to TN HRMS - Your Account Details',
        text: `Hello ${name},\n\nYour account has been created successfully.\n\nYour login details are:\nEmail: ${email}\nPassword: ${generatedPassword}\n\nPlease log in and change your password as soon as possible.\n\nBest regards,\nAdmin Team`
      };

      await transporter.sendMail(mailOptions);
    } catch (emailErr) {
      console.error('Error sending email:', emailErr);
    }

    res.status(201).json({ message: 'Employee created successfully. Email sent.', employee: {
      _id: newEmployee._id,
      name: newEmployee.name,
      email: newEmployee.email,
      department: newEmployee.department,
      designation: newEmployee.designation
    }});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE an employee
router.delete('/employees/:id', async (req, res) => {
  try {
    const employee = await User.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    
    // Also delete tasks and leaves associated with the employee
    await Task.deleteMany({ employee: req.params.id });
    await Leave.deleteMany({ employee: req.params.id });
    
    res.json({ message: 'Employee removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update an employee
router.put('/employees/:id', async (req, res) => {
  const { name, email, department, designation, phone, address, gender, dob, joiningDate, salary, emergencyContact } = req.body;
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Check if the new email is already used by another user
    if (email !== employee.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email is already in use by another user' });
      }
    }

    employee.name = name || employee.name;
    employee.email = email || employee.email;
    employee.department = department || employee.department;
    employee.designation = designation || employee.designation;
    employee.phone = phone !== undefined ? phone : employee.phone;
    employee.address = address !== undefined ? address : employee.address;
    employee.gender = gender !== undefined ? gender : employee.gender;
    employee.dob = dob !== undefined ? dob : employee.dob;
    employee.joiningDate = joiningDate !== undefined ? joiningDate : employee.joiningDate;
    
    if (salary !== undefined && salary !== employee.salary) {
      employee.salaryHistory.push({ salary, date: new Date() });
    }
    employee.salary = salary !== undefined ? salary : employee.salary;
    
    employee.emergencyContact = emergencyContact !== undefined ? emergencyContact : employee.emergencyContact;

    await employee.save();

    res.json({ message: 'Employee updated successfully', employee: {
      _id: employee._id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      designation: employee.designation
    }});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET employee details (with tasks)
router.get('/employees/:id/details', async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const tasks = await Task.find({ employee: req.params.id }).sort({ createdAt: -1 });
    const attendance = await require('../models/Attendance').find({ employee: req.params.id }).sort({ date: -1 }).limit(5);
    const leaves = await Leave.find({ employee: req.params.id }).sort({ createdAt: -1 });
    const payslips = await require('../models/Payslip').find({ employee: req.params.id }).sort({ createdAt: -1 });
    res.json({ employee, tasks, attendance, leaves, payslips });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all tasks (populated with employee info)
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await Task.find().populate('employee', 'name role');
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new task
router.post('/tasks', async (req, res) => {
  const { employee, description } = req.body;
  try {
    const newTask = new Task({
      employee,
      description,
      status: 'Pending'
    });
    await newTask.save();

    // Emit notification to employee
    const io = req.app.get('io');
    if (io) {
      io.to(employee.toString()).emit('notification', { 
        message: 'A new task has been assigned to you.', 
        type: 'task' 
      });
    }

    res.status(201).json({ message: 'Task assigned successfully', task: newTask });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update a task
router.put('/tasks/:taskId', async (req, res) => {
  const { description } = req.body;
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.taskId,
      { description },
      { new: true }
    );
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task updated successfully', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE a task
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all leaves (populated with employee info)
router.get('/leaves', async (req, res) => {
  try {
    const leaves = await Leave.find().populate('employee', 'name role').sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update a leave status
router.put('/leaves/:leaveId', async (req, res) => {
  const { status } = req.body;
  try {
    const leave = await Leave.findByIdAndUpdate(
      req.params.leaveId,
      { status },
      { new: true }
    );
    if (!leave) return res.status(404).json({ message: 'Leave not found' });

    // Emit notification to employee
    const io = req.app.get('io');
    if (io) {
      io.to(leave.employee.toString()).emit('notification', { 
        message: `Your leave request has been ${status.toLowerCase()}.`, 
        type: 'leave' 
      });
    }

    res.json({ message: 'Leave status updated successfully', leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all holidays
router.get('/holidays', async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new holiday
router.post('/holidays', async (req, res) => {
  const { name, date, type } = req.body;
  try {
    const newHoliday = new Holiday({ name, date, type });
    await newHoliday.save();
    res.status(201).json({ message: 'Holiday created successfully', holiday: newHoliday });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT update a holiday
router.put('/holidays/:id', async (req, res) => {
  const { name, date, type } = req.body;
  try {
    const holiday = await Holiday.findByIdAndUpdate(
      req.params.id,
      { name, date, type },
      { new: true }
    );
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ message: 'Holiday updated successfully', holiday });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE a holiday
router.delete('/holidays/:id', async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ message: 'Holiday removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET all departments
router.get('/departments', async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new department
router.post('/departments', async (req, res) => {
  const { name } = req.body;
  try {
    const existing = await Department.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Department already exists' });
    }
    const newDepartment = new Department({ name });
    await newDepartment.save();
    res.status(201).json({ message: 'Department created successfully', department: newDepartment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE a department and reassign employees
router.delete('/departments/:id', async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ message: 'Department not found' });
    
    // Find all users in this department and reassign them to "General"
    await User.updateMany(
      { department: department.name },
      { $set: { department: 'General' } }
    );

    await Department.findByIdAndDelete(req.params.id);
    res.json({ message: 'Department removed successfully and employees reassigned' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT to update a department and reassign employees
router.put('/departments/:id', async (req, res) => {
  const { name } = req.body;
  try {
    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ message: 'Department not found' });
    
    const existing = await Department.findOne({ name });
    if (existing && existing._id.toString() !== req.params.id) {
      return res.status(400).json({ message: 'Department name already exists' });
    }

    const oldName = department.name;
    department.name = name;
    await department.save();

    // Reassign all employees with the old department name to the new one
    await User.updateMany(
      { department: oldName },
      { $set: { department: name } }
    );

    res.json({ message: 'Department updated successfully', department });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET payroll calculations for specific month or current month
router.get('/payroll', async (req, res) => {
  try {
    const employees = await User.find({ role: 'employee' }).select('-password');
    const reqMonth = req.query.month;
    const reqYear = req.query.year;
    
    const targetMonth = reqMonth !== undefined ? parseInt(reqMonth, 10) : new Date().getMonth();
    const targetYear = reqYear !== undefined ? parseInt(reqYear, 10) : new Date().getFullYear();
    const monthString = `${targetMonth + 1}-${targetYear}`;
    
    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const leaves = await Leave.find({
      type: 'Loss of Pay',
      status: 'Approved',
      startDate: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const payslips = await Payslip.find({ month: monthString });

    const payrollData = employees.map(emp => {
      const payslip = payslips.find(p => p.employee.toString() === emp._id.toString());
      const status = payslip ? payslip.status : 'Pending';
      const monthStr = monthString;
      
      let finalLpa, finalMonthly, finalLopDays, finalDeduction, finalNetPay;

      if (payslip && payslip.lpa !== undefined) {
        // Use frozen values if a payslip was already generated/saved
        finalLpa = payslip.lpa;
        finalMonthly = payslip.monthlySalary;
        finalLopDays = payslip.lopDays;
        finalDeduction = payslip.totalDeduction;
        finalNetPay = payslip.netPay;
      } else {
        // Find the applicable salary for this historical month from salaryHistory
        const endOfMonthTarget = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
        let applicableSalary = emp.salary || 0;
        
        if (emp.salaryHistory && emp.salaryHistory.length > 0) {
          const sortedHistory = [...emp.salaryHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
          let foundSalary = null;
          for (const hist of sortedHistory) {
            if (new Date(hist.date) <= endOfMonthTarget) {
              foundSalary = hist.salary;
            }
          }
          if (foundSalary !== null) {
            applicableSalary = foundSalary;
          }
        }

        // Calculate dynamically based on the applicable salary
        const empLeaves = leaves.filter(l => l.employee.toString() === emp._id.toString());
        finalLopDays = empLeaves.reduce((acc, curr) => acc + curr.days, 0);
        finalLpa = applicableSalary;
        finalMonthly = finalLpa ? Math.round(finalLpa / 12) : 0;
        const perDayLopRate = finalMonthly ? Math.round(finalMonthly / 30) : 0;
        finalDeduction = finalLopDays * perDayLopRate;
        finalNetPay = finalMonthly - finalDeduction;
      }

      return {
        _id: emp._id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        designation: emp.designation,
        lpa: finalLpa,
        monthlySalary: finalMonthly,
        perDayLopRate: finalMonthly ? Math.round(finalMonthly / 30) : 0,
        lopDays: finalLopDays,
        totalDeduction: finalDeduction,
        netPay: finalNetPay,
        status,
        monthStr
      };
    });

    res.json(payrollData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /payroll/status - Update payslip status and freeze values
router.post('/payroll/status', async (req, res) => {
  const { employeeId, month, netPay, status, lpa, monthlySalary, lopDays, totalDeduction } = req.body;
  try {
    let payslip = await Payslip.findOne({ employee: employeeId, month });
    
    if (payslip) {
      payslip.status = status;
      payslip.netPay = netPay;
      payslip.lpa = lpa;
      payslip.monthlySalary = monthlySalary;
      payslip.lopDays = lopDays;
      payslip.totalDeduction = totalDeduction;
      await payslip.save();
    } else {
      payslip = new Payslip({
        employee: employeeId,
        month,
        netPay,
        status,
        lpa,
        monthlySalary,
        lopDays,
        totalDeduction
      });
      await payslip.save();
    }
    
    res.json({ message: 'Payroll status and values frozen successfully', payslip });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
