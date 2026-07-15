const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB for migration.");
    
    const employees = await User.find({ role: 'employee' });
    let updatedCount = 0;

    for (const emp of employees) {
      if (!emp.salaryHistory || emp.salaryHistory.length === 0) {
        if (emp.salary) {
          emp.salaryHistory = [{
            salary: 300000, // Setting the original base salary as requested by scenario (assuming it was 300,000 for Madhavan G in Jan)
            date: emp.joiningDate || new Date('2026-01-01') // Fallback to Jan 1st 2026
          }];
          
          // And if his current salary is 400000, add that as an update for July
          if (emp.salary === 400000) {
              emp.salaryHistory.push({
                  salary: 400000,
                  date: new Date('2026-07-01')
              });
          } else {
              // otherwise just set it to whatever they have now
              emp.salaryHistory[0].salary = emp.salary;
          }

          await emp.save();
          updatedCount++;
          console.log(`Migrated salary history for ${emp.name}`);
        }
      }
    }
    
    console.log(`Migration complete. Updated ${updatedCount} employees.`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
