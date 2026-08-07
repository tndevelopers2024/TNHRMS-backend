const cron = require('node-cron');
const Attendance = require('./models/Attendance');
const User = require('./models/User');
const Leave = require('./models/Leave');

// Track dates already processed to avoid double-deductions
const processedDates = new Set();

// Helper: format a Date as YYYY-MM-DD
const toDateStr = (d) =>
  d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

// Helper: check if a Date is a working day (Mon–Sat, excluding 2nd Saturday)
const isWorkingDay = (d) => {
  const day = d.getDay();
  if (day === 0) return false; // Sunday
  if (day === 6 && d.getDate() >= 8 && d.getDate() <= 14) return false; // 2nd Saturday
  return true;
};

// Core processing: creates Auto-Leave records and deducts casual leave
// for any employee who had no check-in or missed checkout on the given dateStr
const processAttendanceForDate = async (dateStr) => {
  if (processedDates.has(dateStr)) {
    console.log(`[Attendance Cron] ${dateStr} already processed this session. Skipping.`);
    return;
  }

  const targetDate = new Date(dateStr);
  if (!isWorkingDay(targetDate)) {
    console.log(`[Attendance Cron] ${dateStr} is a holiday. Skipping.`);
    return;
  }

  console.log(`[Attendance Cron] Processing attendance for: ${dateStr}`);

  // ── PART 1: Employees who checked IN but never checked OUT ──
  const missedCheckouts = await Attendance.find({ date: dateStr, checkOutTime: { $exists: false } });
  const missedCheckouts2 = await Attendance.find({ date: dateStr, checkOutTime: null });

  // Merge & deduplicate
  const allMissed = [...missedCheckouts, ...missedCheckouts2].reduce((acc, curr) => {
    if (!acc.find(item => item._id.toString() === curr._id.toString())) acc.push(curr);
    return acc;
  }, []);

  for (const record of allMissed) {
    record.summary = 'Auto-marked as Leave (Did not check out)';
    record.status = 'Auto-Leave';
    await record.save();

    // Deduct salary by 1/30th (leave balance is tracked dynamically via attendance records)
    const user = await User.findById(record.employee);
    if (user && user.salary) {
      const deduction = Math.round(user.salary / 30);
      user.salary = Math.max(0, user.salary - deduction);
      await user.save();
      console.log(`[Attendance Cron] Missed checkout — deducted salary from ${user._id}`);
    }
  }

  // ── PART 2: Employees who did NOT check in at all ──
  const allEmployees = await User.find({ role: 'employee', isActive: true });
  const existingRecords = await Attendance.find({ date: dateStr });
  const presentIds = new Set(existingRecords.map(r => r.employee.toString()));

  let noCheckinCount = 0;
  for (const emp of allEmployees) {
    if (!presentIds.has(emp._id.toString())) {
      try {
        await Attendance.create({
          employee: emp._id,
          date: dateStr,
          checkInTime: new Date(`${dateStr}T00:00:00`), // placeholder (schema requires checkInTime)
          status: 'Auto-Leave',
          summary: 'Auto-marked as Leave (No check-in)',
        });
        noCheckinCount++;

        // Deduct salary (leave balance is tracked dynamically via attendance records)
        if (emp.salary) {
          const deduction = Math.round(emp.salary / 30);
          emp.salary = Math.max(0, emp.salary - deduction);
          await emp.save();
        }
        console.log(`[Attendance Cron] No check-in — deducted salary from ${emp._id}`);
      } catch (createErr) {
        if (createErr.code !== 11000) {
          console.error(`[Attendance Cron] Failed for ${emp._id}:`, createErr.message);
        }
      }
    }
  }

  processedDates.add(dateStr);
  console.log(`[Attendance Cron] Done for ${dateStr}. Missed checkouts: ${allMissed.length}. No check-ins: ${noCheckinCount}.`);
};

// Called once on server startup — processes yesterday if the cron missed it
const runStartupAttendanceCheck = async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = toDateStr(yesterday);

    if (!isWorkingDay(yesterday)) {
      console.log(`[Startup Check] ${dateStr} is a holiday. No action needed.`);
      return;
    }

    // Check if all employees already have attendance (Auto-Leave or Present) for yesterday
    const existingAutoLeave = await Attendance.countDocuments({ date: dateStr, status: 'Auto-Leave' });
    const totalAttendance = await Attendance.countDocuments({ date: dateStr });
    const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });

    if (totalEmployees === 0) {
      console.log(`[Startup Check] No active employees found. Skipping.`);
      return;
    }

    // If every employee already has an attendance record for yesterday, skip
    if (totalAttendance >= totalEmployees) {
      console.log(`[Startup Check] ${dateStr} already fully processed (${totalAttendance}/${totalEmployees} records). Skipping.`);
      processedDates.add(dateStr);
      return;
    }

    console.log(`[Startup Check] No Auto-Leave records found for ${dateStr}. Running catch-up...`);
    await processAttendanceForDate(dateStr);
  } catch (err) {
    console.error('[Startup Check] Error:', err);
  }
};

const initCronJobs = () => {
  // Run every day at 00:05 AM — processes YESTERDAY's attendance
  cron.schedule('5 0 * * *', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await processAttendanceForDate(toDateStr(yesterday));
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
module.exports.runStartupAttendanceCheck = runStartupAttendanceCheck;
