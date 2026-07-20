const cron = require('node-cron');
const Attendance = require('./models/Attendance');
const User = require('./models/User');
const Leave = require('./models/Leave');

const initCronJobs = () => {
  // Run every night at 23:59 (11:59 PM)
  cron.schedule('59 23 * * *', async () => {
    console.log('Running daily cron job for missed checkouts...');
    try {
      const now = new Date();
      // Format YYYY-MM-DD
      const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

      // Find attendances for today where checkOutTime is not set
      const missedCheckouts = await Attendance.find({ date: dateStr, checkOutTime: { $exists: false } });
      const missedCheckouts2 = await Attendance.find({ date: dateStr, checkOutTime: null });
      
      // Merge results
      const allMissed = [...missedCheckouts, ...missedCheckouts2].reduce((acc, curr) => {
        if (!acc.find(item => item._id.toString() === curr._id.toString())) {
          acc.push(curr);
        }
        return acc;
      }, []);

      for (const record of allMissed) {
        // Mark as Leave
        record.summary = 'Auto-marked as Leave (Did not check out)';
        record.status = 'Auto-Leave';
        await record.save();

        // Reduce salary by 1/30th
        const user = await User.findById(record.employee);
        if (user && user.salary) {
          const deduction = Math.round(user.salary / 30);
          user.salary = Math.max(0, user.salary - deduction);
          await user.save();
          console.log(`Deducted ${deduction} from user ${user._id} for missed checkout.`);
        }
      }
      console.log(`Cron job completed. Processed ${allMissed.length} records.`);
    } catch (err) {
      console.error('Error in daily cron job:', err);
    }
  });

  // Run on the 1st of every month at 00:00 (Midnight)
  cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly cron job for earned leaves...');
    try {
      const now = new Date();
      // Calculate first and last day of the PREVIOUS month
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      // Find all active employees
      const employees = await User.find({ role: 'employee', isActive: true });

      let awardedCount = 0;
      for (const emp of employees) {
        // Check for any approved leaves in the previous month
        // A leave counts if it overlaps with the previous month
        const leavesTaken = await Leave.countDocuments({
          employee: emp._id,
          status: { $in: ['Approved', 'Auto-Leave'] },
          $or: [
            { startDate: { $gte: firstDayPrevMonth, $lte: lastDayPrevMonth } },
            { endDate: { $gte: firstDayPrevMonth, $lte: lastDayPrevMonth } },
            { startDate: { $lt: firstDayPrevMonth }, endDate: { $gt: lastDayPrevMonth } }
          ]
        });

        // If no leaves taken, add 1 Earned Leave
        if (leavesTaken === 0) {
          emp.earnedLeaves = (emp.earnedLeaves || 0) + 1;
          await emp.save();
          awardedCount++;
        }
      }
      
      console.log(`Monthly cron job completed. Awarded 1 Earned Leave to ${awardedCount} employees.`);
    } catch (err) {
      console.error('Error in monthly cron job:', err);
    }
  });
};

module.exports = initCronJobs;
