const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const Payslip = require('./models/Payslip');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB.");
    
    // Find an employee
    const emp = await User.findOne({ role: 'employee' });
    if (!emp) {
      console.log("No employee found.");
      process.exit(0);
    }
    
    // Check if one already exists
    let exists = await Payslip.findOne({ employee: emp._id, month: '6-2026' });
    if (exists) {
      console.log("Payslip for 6-2026 already exists, updating it.");
      exists.status = 'Paid';
      await exists.save();
    } else {
      // Create a dummy payslip for last month (6-2026)
      const dummyPayslip = new Payslip({
        employee: emp._id,
        month: '6-2026',
        netPay: 45000,
        status: 'Paid',
        lpa: 600000,
        monthlySalary: 50000,
        lopDays: 1,
        totalDeduction: 5000
      });
      await dummyPayslip.save();
    }
    console.log(`Successfully added a dummy Payslip (6-2026) for ${emp.name}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
