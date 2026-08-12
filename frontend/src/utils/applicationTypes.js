export const categoryMapping = {
  "Attendance Requests": [
    "Attendance Correction", "Missing Punch", "Late Arrival Justification", 
    "Overtime Request", "Overtime Approval", "Shift Swap", "Shift Change", "Work From Home Request"
  ],
  "Leave Requests": [
    "Full Day Leave", "Half Day Leave", "Leave Encashment"
  ],
  "Payroll Requests": [
    "Salary Advance", "Loan Request", "Increment Request", "Expense Reimbursement", 
    "Allowance Request", "Performance Bonus Claim", "Commission Request", 
    "Salary Correction", "Bank Account Change", "Final Settlement Request", "Health Insurance Enrollment"
  ],
  "HR Requests": [
    "Promotion Request", "Issue Of Document", "Change/Transfer Request", 
    "Resignation", "Resignation Withdrawal", "Retirement Request"
  ],
  "Asset Requests": [
    "Company Assets Issue", "Asset Replacement"
  ],
  "IT Requests": [
    "Password Reset", "Email Creation", "Email Access", "Software Installation", 
    "Shared Folder Access", "Network Access", "Internet Issue", "New User Setup", "Computer Repair", "Hardware Upgrade"
  ],
  "Finance Requests": [
    "Purchase Request", "Vendor Payment", "Budget Approval", "Cash Advance", "Expense Claim", "Refund Request"
  ],
  "Travel Requests": [
    "Business Trip", "Flight Booking", "Hotel Booking", "Visa Request", "Airport Pickup", "Travel Insurance", "Travel Extension", "Travel Expense Claim"
  ],
  "Training Requests": [
    "Course Registration", "Certification Request", "Mentorship Request", "Seminar Attendance"
  ],
  "Facilities Requests": [
    "Meeting Room Booking", "Cleaning Request", "Stationery Request"
  ],
  "Compliance Requests": [
    "Harassment Complaint"
  ],
  "Miscellaneous / Custom Request": [
    "Miscellaneous Request"
  ]
};

export const getAllApplicationTypes = () => {
  let types = [];
  Object.values(categoryMapping).forEach(arr => {
    types = [...types, ...arr];
  });
  return types;
};
