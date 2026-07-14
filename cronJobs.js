const cron = require('node-cron');
const Attendance = require('./models/Attendance');
const User = require('./models/User');

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
};

module.exports = initCronJobs;
