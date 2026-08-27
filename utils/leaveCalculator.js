/**
 * Calculate the cascading leave balances for an employee.
 * Auto-Leaves consume available balances in the order:
 * Casual Leave -> Sick Leave -> Earned Leave -> Loss of Pay (LOP)
 * 
 * @param {Object} user - The employee user document
 * @param {Array} leaves - Array of Leave documents for this employee (Pending/Approved)
 * @param {Array} attendances - Array of Attendance documents for this employee
 * @returns {Object} - The computed used leaves and totals
 */
const calculateCascadingLeaves = (user, leaves, attendances) => {
  const totalCasual = user.casualLeaves !== undefined ? user.casualLeaves : 3;
  const totalSick = user.sickLeaves !== undefined ? user.sickLeaves : 6;
  const totalEarned = user.earnedLeaves || 0;

  // 1. Calculate manual applied leaves
  const manualCasualUsed = leaves
    .filter(l => l.type === 'Casual Leave')
    .reduce((acc, curr) => acc + (curr.days || 0), 0);

  const manualSickUsed = leaves
    .filter(l => l.type === 'Sick Leave')
    .reduce((acc, curr) => acc + (curr.days || 0), 0);

  const manualEarnedUsed = leaves
    .filter(l => l.type === 'Earned Leave')
    .reduce((acc, curr) => acc + (curr.days || 0), 0);

  const manualLopUsed = leaves
    .filter(l => l.type === 'Loss of Pay')
    .reduce((acc, curr) => acc + (curr.days || 0), 0);

  // 2. Calculate auto leaves
  const autoLeavesCount = attendances.filter(a => a.status === 'Auto-Leave').length;
  const halfLeavesCount = attendances.filter(a => a.status === 'Half-Day Leave').length;
  let remainingAuto = autoLeavesCount + (halfLeavesCount * 0.5);

  // 3. Cascade Auto Leaves
  // Casual
  const casualAvailable = Math.max(0, totalCasual - manualCasualUsed);
  const autoCasual = Math.min(remainingAuto, casualAvailable);
  remainingAuto -= autoCasual;
  const finalCasualUsed = manualCasualUsed + autoCasual;

  // Sick
  const sickAvailable = Math.max(0, totalSick - manualSickUsed);
  const autoSick = Math.min(remainingAuto, sickAvailable);
  remainingAuto -= autoSick;
  const finalSickUsed = manualSickUsed + autoSick;

  // Earned
  const earnedAvailable = Math.max(0, totalEarned - manualEarnedUsed);
  const autoEarned = Math.min(remainingAuto, earnedAvailable);
  remainingAuto -= autoEarned;
  const finalEarnedUsed = manualEarnedUsed + autoEarned;

  // Loss of Pay
  const autoLopDays = remainingAuto;
  const finalLopUsed = manualLopUsed + autoLopDays;

  return {
    casual: {
      total: totalCasual,
      used: finalCasualUsed,
      remaining: Math.max(0, totalCasual - finalCasualUsed),
      manualUsed: manualCasualUsed,
      autoUsed: autoCasual
    },
    sick: {
      total: totalSick,
      used: finalSickUsed,
      remaining: Math.max(0, totalSick - finalSickUsed),
      manualUsed: manualSickUsed,
      autoUsed: autoSick
    },
    earned: {
      total: totalEarned,
      used: finalEarnedUsed,
      remaining: Math.max(0, totalEarned - finalEarnedUsed),
      manualUsed: manualEarnedUsed,
      autoUsed: autoEarned
    },
    lop: {
      total: finalLopUsed, // Total Loss of Pay days
      manualUsed: manualLopUsed,
      autoUsed: autoLopDays
    }
  };
};

module.exports = { calculateCascadingLeaves };
