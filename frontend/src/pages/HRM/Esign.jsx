import { useEffect, useState,useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  MdArrowBack,
  MdArrowForward,
  MdCheckCircle,
  MdClose,
  MdDelete,
  MdDescription,
  MdDownload,
  MdEdit,
  MdFactCheck,
  MdLock,
  MdPerson,
  MdPrint,
  MdSave,
  MdSearch,
  MdSend,
  MdShield,
  MdVerifiedUser,
  MdVisibility,
  MdFormatBold,
  MdFormatItalic,
  MdFormatUnderlined,
  MdFormatStrikethrough,
  MdTitle,
  MdTextFields,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatQuote,
  MdFormatAlignLeft,
  MdFormatAlignCenter,
  MdFormatAlignRight,
  MdPalette,
  MdTableChart,
  MdHorizontalRule,
} from "react-icons/md";
import api from "../../lib/api";
import { notify } from "../../utils/notify";
import * as pdfjsLib from "pdfjs-dist";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import "./Esign.css";

if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || "3.11.174"}/pdf.worker.min.js`;
}

const customTextColors = [
  "#000000",
  "#1e293b",
  "#2563eb",
  "#1d4ed8",
  "#16a34a",
  "#dc2626",
  "#ea580c",
  "#7c3aed",
  "#475569",
];

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: customTextColors }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["clean"],
  ],
};

const sanitizeTemplateHtml = (raw) => {
  if (!raw) return "";
  return raw.replace(/background-color:\s*([^;"]+)/gi, "color: $1");
};

const buildRulesTemplate = (f, orgInfo = {}) => {
  const cName = f?.candidateName?.trim() || "[Candidate Name]";
  const cId = f?.candidateId?.trim() || "[CNIC / ID Number]";
  const startDateStr = f?.startDate
    ? new Date(f.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const orgName = orgInfo?.name || "Organization";
  const orgSubtitle = orgInfo?.subtitle || "Human Resources Division";
  const orgAddress = orgInfo?.address || "";
  const orgPhone = orgInfo?.phone || "";
  const orgEmail = orgInfo?.email || "";
  const orgWebsite = orgInfo?.website || "";
  const adminName = orgInfo?.adminName || "HR Manager";
  const adminTitle = orgInfo?.adminTitle || "Authorized Signatory";

  return `${orgName.toUpperCase()}
${orgSubtitle}
${orgAddress}

RULES AND REGULATIONS - ${orgName.toUpperCase()}

${orgPhone} · ${orgEmail} · ${orgWebsite}

IMPLEMENTATION OF COMPANY REGULATIONS

Dear Team Member / Candidate (${cName}, CNIC: ${cId}),

Welcome to ${orgName}. As a company committed to excellence and integrity, we have established the following policies, procedures, and code of conduct to ensure a professional and respectful working environment. These guidelines help us maintain our core values, support our mission to deliver exceptional service, and foster a culture of collaboration, innovation, and respect.

It covers everything from data privacy to conflict of interest, ensuring that we operate with transparency and respect in all our dealings. Understanding and adhering to these guidelines is essential for your professional development and ${orgName}'s continued success and reputation.

Sincerely,
${adminName}
${adminTitle} - ${orgName}
Email: ${orgEmail}
Phone: ${orgPhone}
Website: ${orgWebsite}

================================================================================
TABLE OF CONTENTS
1. Company Policies (Attendance, Leave, Dress Code, Health & Safety, Internet/Email Use, Beyond Office Hours, Anti-Harassment, Resignation, Termination)
2. Code of Conduct (Office Environment, Data Privacy, Business Deals)
3. Procedures (Onboarding, Performance Review, Expense Reimbursement, Emergency, Medical Allowance, Provident Fund, Salary Procedure)
================================================================================

1. COMPANY POLICIES

I. Attendance Policy:
- Working Hours: Employees are expected to work in designated working hours.
- Breaks: Employees are entitled to a 1-hour lunch break and two 15-minute breaks (one in each half).
- Absence Reporting: Employees must inform their Manager or CEO of any absence at least 1 hour before the start of the workday.
- Punctuality: Employees must be punctual and arrive on time for work. Repeated lateness will result in disciplinary action.
- Lateness: If the Employee is more than 10 minutes late, he must compensate with double the time. Lateness exceeding 30 minutes will be marked as a half-day, and lateness exceeding 60 minutes will result in an absence.
- Half Day: Working half a day during the probation period will result in a salary reduction. After the probation period, it will be considered as half leave.

II. Leave Policy:
- Vacation Leave: Employees are entitled to 24 days of paid vacation leave per year. Leave requests must be submitted at least one week in advance.
- Leaves in Probation Period or Internship: No paid leave will be granted during the internship and probation period.
- Unapproved Leaves: Unapproved leave will result in a deduction of twice the leave days.

III. Dress Code Policy:
- General Guidelines: Employees are expected to dress in business casual attire. Clothing should be clean, neat, and professional.
- Prohibited Attire: Casual wear such as trousers, t-shirts, flip-flops, and shorts are prohibited.

IV. Health and Safety Policy:
- Workplace Safety: Employees must adhere to all safety regulations and immediately report unsafe conditions.
- Emergency Procedures: Employees should be familiar with emergency exits and procedures. They will be taught these in orientation, and regular drills will be conducted.

V. Internet and Email Use Policy:
- Usage: Company internet and email systems are to be used only for the company’s work purposes. Personal use is prohibited.
- Security: Employees must not download unauthorized software or visit non-work-related websites.

VI. Beyond Office Hours Policy:
- Message Acknowledgment: All team members, including employees and interns, are expected to acknowledge work-related messages received outside regular working hours promptly and take action at the commencement of the next working day without necessitating repeated follow-ups from management or colleagues.
- Urgent Matters: In the event of an urgent task communicated outside working hours, the concerned team member is expected to address it promptly. If unavailable, the matter must be escalated to the respective Team Leader or Manager without delay.
- Additional Hours: This policy does not impose any obligation to work beyond contracted office hours. It solely governs professional communication, conduct, and acknowledgment of responsibilities when contacted outside working hours.
- Non-Compliance: Failure to adhere to this policy will be reflected in performance evaluations, assessments, and career progression decisions and will be treated as a breach of professional conduct.

VII. Anti-Harassment Policy:
- Zero Tolerance: ${orgName} has a zero-tolerance policy towards harassment. Any form of harassment, including sexual, racial, bullying, or verbal, will not be tolerated.
- Reporting: Employees should report any harassment incidents to HR immediately. All reports will be investigated promptly and confidentially.

VIII. Resignation Policy:
- Notice Period: Employees must serve a 7-10 days notice period during the Trial Period and two-week (14 days) notice period during the probation and internship period before their resignation becomes effective. After completing the probation period, a one-month (30 days) notice period is required to ensure a smooth transition and proper handover of responsibilities.

IX. Termination Policy:
- Punctuality: Frequent lateness (more than two days) or any absences in a month will result in a warning. Three warnings will result in automatic Termination.
- Poor Performance: The Employee will receive a warning letter for poor performance, rude behavior, unpunctuality, or excessive absences. Upon receiving the third warning letter, the Employee will be terminated.
- Disobeying Code of Conduct: Any disobeying or unfollowing the code of conduct will result in Termination, and legal action will be taken against the Employee.
- Harassment: ${orgName} has a zero-tolerance policy against harassment and bullying. If an employee is harassed or bullied, ${orgName} will terminate the Employee immediately and report such incidents to the legal department.
- Data Privacy: Failure to comply with ${orgName}'s data privacy policy will result in immediate Termination of employment. Additionally, legal action will be pursued against the Employee for any breach of data privacy that compromises ${orgName}'s business, clients, or legal matters.
- Business Deals: Engaging in unauthorized business deals with clients or colleagues will result in immediate Termination of employment. Legal action will be taken against the Employee for any unauthorized transactions that harm the business interests or reputation of ${orgName}.

================================================================================
2. CODE OF CONDUCT

I. Office Environment:
- Professionalism: Employees must maintain professionalism in all interactions. This includes being punctual, respectful, and adhering to company policies.
- Integrity: Employees must act with integrity, ensuring honesty and transparency in all work dealings.
- Confidentiality: Employees must protect the confidentiality of company and client information.
- Conflict of Interest: Employees must disclose any potential conflicts of interest to the Company's management.
- Non-Discrimination: ${orgName} is committed to providing a workplace free of discrimination. All employees must be treated respectfully, regardless of race, gender, religion, or other characteristics.
- Accountability: Employees are responsible for their actions and must report any unethical behaviour or policy violations to management.

II. Data Privacy:
- Confidentiality: Employees must not disclose any confidential information related to ${orgName}'s business, clients, or legal matters to anyone for any reason, both within and outside the Company.
- Data Handling: Employees must handle all data responsibly, ensuring it is stored securely, shared only with authorized personnel, and protected from unauthorized access.
- Data Breach: Any suspected or actual data breach must be reported immediately to the management.

III. Business Deals:
- Conflict of Interest: Employees must avoid any activities or relationships that may create a conflict of interest with ${orgName}'s business.
- Unauthorized Deals: During employment and for 3 years thereafter, the Employee shall not engage in professional dealings with or solicit business from the Employer's clients or employees who were retained by the Employer within the last 36 months, or work with its employees/interns.

================================================================================
3. PROCEDURES

I. Onboarding Procedure:
- Welcome Orientation: New employees will attend a welcome orientation on their first day.
- Documentation: New employees must complete all required forms.
- Training: New employees will receive training on company policies, procedures, and their specific job functions.

II. Performance Review Procedure:
- Schedule Reviews: Performance reviews will be conducted semi-annually.
- Review Process: Managers will evaluate employees on key performance metrics and provide feedback.
- Goal Setting: Employees and Managers will set goals for the next review period.

III. Expense Reimbursement Procedure:
- Submission: Employees must submit expense reports within 30 days of incurring an expense.
- Documentation: Receipts and a description of the business purpose must be included.
- Approval: Managers will review and approve expense reports before reimbursement.

IV. Emergency Procedure:
- Evacuation Plan: Employees must familiarize themselves with the office evacuation plan.
- Drills: Regular fire and emergency drills will be conducted.
- First Aid: A kit is available in the office; employees should know its location.

V. Medical Allowance Procedure:
- Allowance: A monthly medical allowance of PKR 3,000 is available to all eligible employees.
- Eligible Expenses: Employees may submit medical bills for themselves, their spouse, children, and parents.
- Submission Process: Employees must submit valid medical bills to HR for reimbursement. The date on the medical bill must fall within the current salary month to be processed with that month's salary. Bills dated in a previous month will not be considered or processed under any circumstances.
- Documentation Requirements:
  1. Bills must be computerized/printed — handwritten slips will not be accepted.
  2. Bills must carry a QR code and the medical facility's NTN (National Tax Number) for verification purposes.
  3. A valid doctor's prescription must be attached along with the bill, clearly mentioning the patient's name, diagnosis, and prescribed medication or treatment.
  Bills without any of the above will be considered incomplete and will not be processed for reimbursement.
- Probation Requirement: Eligibility for the medical allowance begins only after the successful completion of the probation period.
- Notice Period: Employees serving their notice period are not eligible for medical allowance.
- Important Note: The company reserves the right to reject any bill that appears invalid, unverifiable, or that does not meet the documentation standards outlined above.

VI. Provident Fund Procedure:
- Contribution: The company will deduct 10% from the employee's salary, and an additional 10% will be contributed by the company.
- Investment: The total fund will be invested in mutual funds for potential returns.
- Withdrawal Conditions:
  - Resignation Notice Period: If an employee resigns within the notice period, only their 10% contribution (deducted from salary) will be provided.
  - Resignation within 6 Months: If an employee leaves within 6 months of the hiring date, they will receive their 10% contribution along with any accrued commission on it.
  - Resignation after 1 Year: Employees who leave after 1 year will receive the entire amount, including their 10% contribution, the company’s 10%, and any returns on the investment.
  - Termination: Employees who are terminated will not receive any amount from the provident fund.

VII. Salary Procedure:
- Salary Calculation: Salaries are based on the number of working days in the month (Monday to Saturday).
  - Daily Rate = Monthly Salary ÷ Total Working Days in the month.
  - Hourly Rate = Daily Rate ÷ Standard Working Hours.
- Employees are paid for the days they work. Absenteeism without approval results in deductions based on the daily rate.
- Overtime & Additional Work: Any extra working hours, work performed on off-days (weekends), public holidays, or additional approved working days shall be compensated separately, subject to prior approval from management.
  - Overtime Compensation = Hourly Rate × Approved Overtime Hours
  - Additional Day Compensation = Daily Rate × Number of Additional Working Days
- Net Salary Calculation: Net Salary = (Salary for Worked Days + Additional Working Day Compensation + Approved Overtime/Additional Work Compensation) − PF Deduction + Reimbursements/Allowances.
- Disbursement Timeline: Salaries for the previous month are transferred between the 5th and 10th of the following month. Payments are made via bank transfer.
- Leave Deductions: Approved paid leaves do not affect salary. Unpaid or unapproved absences are deducted based on the daily rate.`;
};

const buildOfferTemplate = (f, orgInfo = {}) => {
  const cName = f?.candidateName?.trim() || "[Candidate Name]";
  const cEmail = f?.candidateEmail?.trim() || "[Candidate Email]";
  const cId = f?.candidateId?.trim() || "[CNIC / ID Number]";
  const job = f?.jobTitle?.trim() || "Web Developer Intern";
  const dept = f?.department?.trim() || "Engineering";
  const sal = f?.baseSalary ? Number(f.baseSalary).toLocaleString() : "15,000";
  const curr = f?.currency || "PKR";
  const empType = f?.employmentType || "Internship";
  const startDateStr = f?.startDate
    ? new Date(f.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const orgName = orgInfo?.name || "TechXaro Pvt. Ltd";
  const orgSubtitle = orgInfo?.subtitle || "Excellency in Tech";
  const orgAddress = orgInfo?.address || "G-83 Zainab Tower, Model Town Link Road, Lahore, Pakistan";
  const orgPhone = orgInfo?.phone || "+92 311 4865556";
  const orgEmail = orgInfo?.email || "contact@techxaro.com";
  const orgWebsite = orgInfo?.website || "https://techxaro.com/";

  return `${orgName.toUpperCase()}
${orgSubtitle}

${job.toUpperCase()} CONTRACT & FORMAL OFFER LETTER

1. Duties
This Agreement is made as of ${startDateStr}, between ${orgName}, having its principal place of business at ${orgAddress} (Employer), and ${cName}, CNIC# ${cId} (Employee).

The Employer is hiring the Employee as a ${job}, and the Employee is accepting such employment, on the following terms and conditions:
NOW, THEREFORE, in consideration of the promises and other good and valuable considerations, the parties agree as follows:

1.1 The ${empType} agrees to faithfully, actively, and to the best of his skill, ability, experience, and talents perform all duties required of his position. The ${empType} will comply with all Employer policies, procedures, rules, and regulations, both written and oral, as announced by the Employer.
1.2 The ${empType} understands and agrees that the Employer may change assignments, duties, responsibilities, timing, and reporting arrangements at its sole discretion without causing termination of this agreement.
1.3 As a ${job}, the ${empType} shall learn and perform all essential job functions and duties as assigned by the Employer. The ${empType} may also be required to perform additional duties from time to time and agrees to work overtime or additional hours when required by the Employer, subject to prior approval and applicable company policies.
1.4 The ${empType} shall remain responsive to urgent, work-related communication received outside office hours and take timely action, in accordance with the Company's Beyond Office Hours Policy.

2. Stipend and Leaves
2.1 The contract is for the position of ${job} with a monthly stipend/compensation of ${curr} ${sal}/- for the designated role.
2.2 No paid leave will be granted during the internship and probation period. In emergencies, the ${empType} must inform the Employer before the office starts.
2.3 If the ${empType} is more than 10 minutes late, he must compensate with double the time. Lateness exceeding 15 minutes will be marked as a half-day, and lateness exceeding 30 minutes will result in an absence.
2.4 Frequent lateness (more than two days) or any absences in a month will result in a warning. The ${empType} will receive a warning letter for poor performance, rude behavior, unpunctuality, or excessive absences. Upon receiving the third warning letter, the ${empType} may be terminated.

3. Data Confidentiality & Non-Solicitation
3.1 During employment and three years after its conclusion, the ${empType} shall not personally engage in professional dealings or work with any employees or interns of the Employer for any reason.
3.2 During employment and three years after its conclusion, the ${empType} shall refrain from soliciting business from current clients and employees who have retained the Employer within the last 36 months.
3.3 The ${empType} shall not disclose the Employer's proprietary information, trade secrets, or confidential business information. The ${empType} will also not disclose client information or work to any other person or entity, including any previous or future employers.

4. Security and Resignation
4.1 The Employer will retain a copy of the ${empType}'s latest educational documents and a copy of the ${empType}'s ID as security.
4.2 If the ${empType} resigns before completing their term, they must provide a 14-day notice period or may be required to forfeit one month's stipend/compensation in lieu.
4.3 The Employer may terminate this Agreement and the ${empType}'s employment at any time, without notice or compensation, for sufficient cause. The ${empType} agrees not to take any legal action against such termination.
4.4 The Employer may amend this Agreement or its rules and clauses at its discretion, verbally or in writing, without prior notice. The ${empType} agrees not to object or take any action against it.

Date: ${startDateStr}

Employer:
${orgName}
Email: ${orgEmail}
Phone: ${orgPhone}
Website: ${orgWebsite}

Candidate / Employee Details:
Name: ${cName}
CNIC: ${cId}
Email: ${cEmail}
Job Title: ${job}
Department: ${dept}`;
};

const buildContractTemplate = (f, orgInfo = {}) => {
  const cName = f?.candidateName?.trim() || "[Candidate Legal Name]";
  const cEmail = f?.candidateEmail?.trim() || "[Candidate Email]";
  const cId = f?.candidateId?.trim() || "[CNIC / Passport No]";
  const job = f?.jobTitle?.trim() || "Software Engineer";
  const dept = f?.department?.trim() || "Software Engineering";
  const sal = f?.baseSalary ? Number(f.baseSalary).toLocaleString() : "150,000";
  const curr = f?.currency || "PKR";
  const empType = f?.employmentType || "Full-time";
  const startDateStr = f?.startDate
    ? new Date(f.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const orgName = orgInfo?.name || "TechXaro Pvt. Ltd";

  return `MASTER EMPLOYMENT AGREEMENT

This Master Employment Agreement ("Agreement") is executed and entered into as of ${startDateStr}, by and between the Employer ("${orgName}") and ${cName}, holding National ID / CNIC No. ${cId}, residing at registered address ("Employee").

1. POSITION AND SCOPE OF DUTIES
1.1 The Employer hereby engages the Employee in the capacity of ${job} within the ${dept} department on a ${empType} basis.
1.2 The Employee agrees to perform all responsibilities, duties, and functions associated with the position diligently, faithfully, and in full compliance with organizational standards, executive directions, and company policies.
1.3 The Employer reserves the right to reasonably align job assignments, reporting lines, and project responsibilities in accordance with operational requirements.

2. COMPENSATION, STIPEND & BENEFITS
2.1 Remuneration: As compensation for services rendered, the Employee shall receive a base remuneration of ${curr} ${sal}/- per month, subject to applicable payroll schedules and performance reviews.
2.2 Working Hours & Attendance: The Employee agrees to adhere to prescribed office schedules, log attendance promptly via the PMS portal, and maintain professional punctuality in accordance with company operating policies.

3. DATA CONFIDENTIALITY & NON-SOLICITATION
3.1 Confidential Information: The Employee shall hold in strict confidence all proprietary data, trade secrets, software source code, client records, financial information, and commercial strategy.
3.2 Non-Solicitation: During employment and for a period of thirty-six (36) months following separation, the Employee shall not directly or indirectly solicit business from active clients or solicit company team members for alternative employment.

4. SEPARATION AND TERMINATION
4.1 Notice Period: Either party may terminate this agreement by providing written notice as mandated by company policy (minimum 14 to 30 days notice or equivalent compensation in lieu).
4.2 Summary Dismissal: The Employer reserves the right to terminate employment immediately for cause, including breach of confidentiality, willful misconduct, gross negligence, or unapproved absence.

Date of Execution: ${startDateStr}

EMPLOYER: ${orgName} - Human Resources Division
EMPLOYEE: ${cName} (CNIC/ID: ${cId} · ${cEmail})
DOCUMENT REF: Computer-generated binding legal agreement. Encrypted & cryptographically signed via PMS E-Sign System.`;
};

const replacePlaceholders = (content, f, orgInfo = {}) => {
  if (!content) return "";
  const cName = f?.candidateName?.trim() || "[Candidate Name]";
  const cEmail = f?.candidateEmail?.trim() || "[Candidate Email]";
  const cId = f?.candidateId?.trim() || "[CNIC / ID Number]";
  const job = f?.jobTitle?.trim() || "[Job Title]";
  const dept = f?.department?.trim() || "[Department]";
  const sal = f?.baseSalary ? Number(f.baseSalary).toLocaleString() : "0";
  const curr = f?.currency || "PKR";
  const empType = f?.employmentType || "Full-time";
  const startDateStr = f?.startDate
    ? new Date(f.startDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const orgName = orgInfo?.name || "Organization";
  const orgLogo = orgInfo?.logoUrl || "";
  const orgAddress = orgInfo?.address || "";
  const orgPhone = orgInfo?.phone || "";
  const orgEmail = orgInfo?.email || "";
  const orgWebsite = orgInfo?.website || "";
  const adminName = orgInfo?.adminName || "HR Manager";

  const logoHtml = orgLogo
    ? `<img src="${orgLogo}" alt="${orgName} logo" style="max-height: 55px; max-width: 220px; object-fit: contain; margin-bottom: 12px; display: block;" />`
    : "";

  return content
    .replace(/\{candidateName\}/g, cName)
    .replace(/\{candidateEmail\}/g, cEmail)
    .replace(/\{candidateId\}/g, cId)
    .replace(/\{jobTitle\}/g, job)
    .replace(/\{department\}/g, dept)
    .replace(/\{baseSalary\}/g, sal)
    .replace(/\{currency\}/g, curr)
    .replace(/\{employmentType\}/g, empType)
    .replace(/\{startDate\}/g, startDateStr)
    .replace(/\{orgName\}/g, orgName)
    .replace(/\{orgLogo\}/g, logoHtml)
    .replace(/\{orgLogoUrl\}/g, orgLogo)
    .replace(/\{orgAddress\}/g, orgAddress)
    .replace(/\{orgPhone\}/g, orgPhone)
    .replace(/\{orgEmail\}/g, orgEmail)
    .replace(/\{orgWebsite\}/g, orgWebsite)
    .replace(/\{adminName\}/g, adminName);
};

const printSingleDocument = (doc, envelope, orgInfo = {}) => {
  const printWin = window.open("", "_blank");
  if (!printWin) return;

  const logoUrl = orgInfo?.logoUrl || "";
  const orgName = orgInfo?.name || "Organization";
  const subtitle = orgInfo?.subtitle || "Human Resources Division";
  const contactStr = [orgInfo?.address, orgInfo?.phone, orgInfo?.email, orgInfo?.website].filter(Boolean).join(" · ");

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${doc.title} - ${envelope.candidate_name}</title>
        <style>
          @page { margin: 20mm; }
          body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; margin: 0; color: #0f172a; line-height: 1.65; background: #ffffff; }
          .letterhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { max-height: 48px; max-width: 180px; object-fit: contain; }
          .org-title { font-size: 20px; font-weight: 800; margin: 0; color: #0f172a; }
          .sub { font-size: 12px; color: #4f46e5; font-weight: 700; margin: 2px 0 0; }
          .contact { font-size: 11px; color: #64748b; margin: 4px 0 0; }
          .doc-title { font-size: 18px; font-weight: 800; text-align: center; margin: 24px 0 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; color: #0f172a; text-transform: uppercase; }
          .content { white-space: pre-wrap; font-size: 12px; color: #1e293b; line-height: 1.65; }
          .sig-box { margin-top: 30px; text-align: right; border-top: 1px solid #e5e7eb; padding-top: 16px; }
          .typed-sig { font-family: "Caveat", "Dancing Script", cursive, Georgia, serif; font-size: 26px; font-weight: bold; border-bottom: 2px solid #0f172a; padding: 2px 10px; display: inline-block; }
          .drawn-sig { max-height: 60px; border-bottom: 2px solid #0f172a; }
          .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 14px; }
        </style>
      </head>
      <body>
        <div class="letterhead">
          <div>
            ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ""}
            <h1 class="org-title">${orgName.toUpperCase()}</h1>
            <p class="sub">${subtitle}</p>
            ${contactStr ? `<p class="contact">${contactStr}</p>` : ""}
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 12px; font-weight: bold;">Ref: ${envelope.reference}</p>
            <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">Date: ${envelope.completed_at ? new Date(envelope.completed_at).toLocaleDateString() : envelope.expires_at}</p>
          </div>
        </div>

        <h2 class="doc-title">${doc.title}</h2>
        <div class="content">${doc.content}</div>

        ${
          doc.signature_value
            ? `
          <div class="sig-box">
            <p style="font-size: 12px; color: #64748b; margin-bottom: 6px;">Signed by: <strong>${envelope.candidate_name}</strong> (${doc.signature_method || 'electronic'})</p>
            ${
              doc.signature_method === "drawn" || doc.signature_method === "uploaded" || doc.signature_method === "thumb"
                ? `<img src="${doc.signature_value}" class="drawn-sig" style="max-height: 70px; object-fit: contain;" />`
                : `<span class="typed-sig">${doc.signature_value}</span>`
            }
          </div>
        `
            : ""
        }

        <div class="footer">
          Computer-generated binding document executed via ${orgName} E-Signature Suite.
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
};

const printEntirePackage = (envelope, orgInfo = {}) => {
  const printWin = window.open("", "_blank");
  if (!printWin) return;

  const logoUrl = orgInfo?.logoUrl || "";
  const orgName = orgInfo?.name || "Organization";
  const subtitle = orgInfo?.subtitle || "Human Resources Division";
  const contactStr = [orgInfo?.address, orgInfo?.phone, orgInfo?.email, orgInfo?.website].filter(Boolean).join(" · ");

  const docsHtml = (envelope.documents || [])
    .map(
      (doc, index) => `
    <div class="doc-card ${index > 0 ? "page-break-before" : ""}">
      <h2 class="doc-title">${doc.title}</h2>
      <div class="content">${doc.content}</div>
      ${
        doc.signature_value
          ? `
        <div class="sig-box">
          <p style="font-size: 12px; color: #64748b; margin-bottom: 6px;">Signed by: <strong>${envelope.candidate_name}</strong> (${doc.signature_method || 'electronic'})</p>
          ${
            doc.signature_method === "drawn" || doc.signature_method === "uploaded" || doc.signature_method === "thumb"
              ? `<img src="${doc.signature_value}" class="drawn-sig" style="max-height: 70px; object-fit: contain;" />`
              : `<span class="typed-sig">${doc.signature_value}</span>`
          }
        </div>
      `
          : ""
      }
    </div>
  `
    )
    .join("");

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Executed Employment Package - ${envelope.candidate_name} (${envelope.reference})</title>
        <style>
          @page { margin: 20mm; }
          body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; margin: 0; color: #0f172a; line-height: 1.65; background: #ffffff; }
          .letterhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { max-height: 48px; max-width: 180px; object-fit: contain; }
          .org-title { font-size: 20px; font-weight: 800; margin: 0; color: #0f172a; }
          .sub { font-size: 12px; color: #4f46e5; font-weight: 700; margin: 2px 0 0; }
          .contact { font-size: 11px; color: #64748b; margin: 4px 0 0; }
          .banner { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 12px; }
          .doc-card { margin-bottom: 32px; }
          .page-break-before { page-break-before: always; margin-top: 32px; }
          .doc-title { font-size: 18px; font-weight: 800; color: #0f172a; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px; text-transform: uppercase; }
          .content { white-space: pre-wrap; font-size: 12px; color: #1e293b; line-height: 1.65; }
          .sig-box { margin-top: 24px; text-align: right; border-top: 1px solid #e5e7eb; padding-top: 14px; }
          .typed-sig { font-family: "Caveat", "Dancing Script", cursive, Georgia, serif; font-size: 26px; font-weight: bold; border-bottom: 2px solid #0f172a; padding: 2px 10px; display: inline-block; }
          .drawn-sig { max-height: 60px; border-bottom: 2px solid #0f172a; }
          .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 14px; }
        </style>
      </head>
      <body>
        <div class="letterhead">
          <div>
            ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ""}
            <h1 class="org-title">${orgName.toUpperCase()}</h1>
            <p class="sub">${subtitle}</p>
            ${contactStr ? `<p class="contact">${contactStr}</p>` : ""}
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 13px; font-weight: 800; color: #4f46e5;">REF: ${envelope.reference}</p>
            <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">Executed: ${envelope.completed_at ? new Date(envelope.completed_at).toLocaleString() : new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div class="banner">
          <strong>EXECUTED EMPLOYMENT PACKAGE SUMMARY</strong><br />
          Candidate Name: <strong>${envelope.candidate_name}</strong> (${envelope.candidate_email}) · Position: <strong>${envelope.job_title}</strong> · Status: <strong>EXECUTED & CRYPTOGRAPHICALLY SEALED</strong>
        </div>

        ${docsHtml}

        <div class="footer">
          Computer-generated binding legal package executed via ${orgName} E-Signature Suite. No physical stamp required.
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
};

export default function Esign() {
  const location = useLocation();
  const queryMode = new URLSearchParams(location.search).get("mode");

  const [viewMode, setViewMode] = useState(() => {
    if (queryMode === "templates") return "templates";
    if (queryMode === "signed") return "signed";
    return "packages";
  }); // 'packages' | 'signed' | 'templates'

  useEffect(() => {
    if (queryMode === "templates" || queryMode === "signed" || queryMode === "packages") {
      setViewMode(queryMode);
      if (queryMode === "signed") {
        setStatusFilter("completed");
      }
    }
  }, [queryMode]);

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, lastPage: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Available Templates for HR
  const [templates, setTemplates] = useState([]);

  // Separate Modal Dialog States
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const [templateForm, setTemplateForm] = useState({
    title: "",
    type: "custom",
    required_action: "sign",
    content: "",
  });

  // Envelope Form State
  const [editingEnvelopeId, setEditingEnvelopeId] = useState(null);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [form, setForm] = useState({
    candidateName: "",
    candidateEmail: "",
    candidatePhone: "",
    candidateId: "",
    jobTitle: "",
    department: "",
    employmentType: "Full-time",
    baseSalary: "",
    currency: "PKR",
    startDate: new Date().toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    selectedDocs: [],
  });

  const [showForm, setShowForm] = useState(true);
  const [formTab, setFormTab] = useState("details"); // 'details' | doc index
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  // Selected package detail view state for HR modal
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [detailTab, setDetailTab] = useState("documents");
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Dynamic Organization Information State
  const [orgInfo, setOrgInfo] = useState({
    name: "TechXaro Pvt. Ltd",
    subtitle: "Excellency in Tech",
    address: "G-83 Zainab Tower, Model Town Link Road, Lahore, Pakistan",
    phone: "+92 311 4865556",
    email: "contact@techxaro.com",
    website: "https://techxaro.com/",
    adminName: "Muteeb Tahir",
    adminTitle: "CEO",
  });

  useEffect(() => {
    const fetchOrgDetails = async () => {
      try {
        const res = await api.get("/organization-settings/details");
        if (res?.success && res?.organization) {
          const org = res.organization;
          const info = {
            name: org.name || "TechXaro Pvt. Ltd",
            subtitle: org.settings?.subtitle || "Excellency in Tech",
            address: org.settings?.address || org.address || "G-83 Zainab Tower, Model Town Link Road, Lahore, Pakistan",
            phone: org.admin_phone || org.settings?.phone || "+92 311 4865556",
            email: org.admin_email || org.settings?.email || "contact@techxaro.com",
            website: org.domain || org.settings?.website || "https://techxaro.com/",
            adminName: org.admin_name || "Muteeb Tahir",
            adminTitle: org.settings?.admin_title || "CEO",
          };
          setOrgInfo(info);
        }
      } catch (err) {
        console.warn("Org details fetch fallback:", err);
      }
    };
    const fetchDepartments = async () => {
      try {
        const res = await api.get("/hrm/workflows/departments");
        const list = res?.data || res?.departments || [];
        if (Array.isArray(list) && list.length > 0) {
          const cleanDepts = list.filter((d) => d && d !== "All Departments");
          setDepartmentOptions(cleanDepts);
        } else {
          setDepartmentOptions(["Engineering", "Software Engineering", "Sales", "HR", "Marketing", "Finance", "Operations", "Design"]);
        }
      } catch (err) {
        console.warn("Departments fetch fallback:", err);
        setDepartmentOptions(["Engineering", "Software Engineering", "Sales", "HR", "Marketing", "Finance", "Operations", "Design"]);
      }
    };

    fetchOrgDetails();
    fetchDepartments();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await api.get("/hrm/esign/templates");
      const list = Array.isArray(data) ? data : [];
      setTemplates(list);

      // Default populate envelope form with default templates if selectedDocs is empty
      setForm((old) => {
        if (old.selectedDocs.length > 0) return old;
        return {
          ...old,
          selectedDocs: list.map((t) => ({
            templateId: t.id,
            key: t.type || "doc",
            title: t.title,
            type: t.type || "custom",
            required_action: t.required_action || "sign",
            content: replacePlaceholders(t.content, old, orgInfo),
            rawContent: t.content,
          })),
        };
      });
    } catch (e) {
      console.warn("Templates load notice:", e.message);
      const defaults = [
        { id: 1, title: `Rules and Regulations - ${orgInfo.name}`, type: "rules", required_action: "acknowledge", content: buildRulesTemplate(form, orgInfo) },
        { id: 2, title: "Formal Offer of Employment", type: "offer", required_action: "sign", content: buildOfferTemplate(form, orgInfo) },
        { id: 3, title: "Master Employment Agreement", type: "contract", required_action: "sign", content: buildContractTemplate(form, orgInfo) },
      ];
      setTemplates(defaults);
      setForm((old) => ({
        ...old,
        selectedDocs: defaults.map((t) => ({
          templateId: t.id,
          key: t.type,
          title: t.title,
          type: t.type,
          required_action: t.required_action,
          content: replacePlaceholders(t.content, old, orgInfo),
          rawContent: t.content,
        })),
      }));
    }
  };

  const load = async (pageNo = 1, status = statusFilter, search = searchTerm) => {
    try {
      const params = { page: pageNo };
      if (status && status !== "all") {
        params.status = status;
      }
      if (search.trim()) params.q = search.trim();

      const result = await api.get("/hrm/esign/envelopes", params);
      if (result && Array.isArray(result.data)) {
        setItems(result.data);
        setPagination({
          currentPage: result.current_page || 1,
          lastPage: result.last_page || 1,
          total: result.total || result.data.length,
        });
      } else if (Array.isArray(result)) {
        setItems(result);
        setPagination({ currentPage: 1, lastPage: 1, total: result.length });
      } else {
        setItems([]);
      }
    } catch (e) {
      setMessage(e.message);
      setMessageType("error");
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    load(page, statusFilter, searchTerm);
  }, [page, statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load(1, statusFilter, searchTerm);
  };

  const openPackageDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const envelope = await api.get(`/hrm/esign/envelopes/${id}`);
      setSelectedPackage(envelope);
      setDetailTab("documents");
    } catch (e) {
      setMessage(e.message);
      setMessageType("error");
    } finally {
      setLoadingDetail(false);
    }
  };

  // Dynamic set function that auto-fetches candidate details into ALL selected documents
  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((old) => {
      const updated = { ...old, [key]: value };
      return {
        ...updated,
        selectedDocs: updated.selectedDocs.map((doc) => ({
          ...doc,
          content: replacePlaceholders(doc.rawContent || doc.content, updated, orgInfo),
        })),
      };
    });
  };

  const setDocContent = (index) => (e) => {
    const val = e.target.value;
    setForm((old) => {
      const nextDocs = [...old.selectedDocs];
      nextDocs[index] = { ...nextDocs[index], content: val };
      return { ...old, selectedDocs: nextDocs };
    });
  };

  // Dropdown Template Add Function for Package Creation Form
  const addTemplateToPackage = (templateId) => {
    if (!templateId) return;
    const tpl = templates.find((t) => String(t.id) === String(templateId));
    if (!tpl) return;

    setForm((old) => {
      const exists = old.selectedDocs.some((d) => d.templateId === tpl.id);
      if (exists) return old;

      const newDoc = {
        templateId: tpl.id,
        key: tpl.type || "custom",
        title: tpl.title,
        type: tpl.type || "custom",
        required_action: tpl.required_action || "sign",
        content: replacePlaceholders(tpl.content, old, orgInfo),
        rawContent: tpl.content,
      };

      const nextDocs = [...old.selectedDocs, newDoc];
      setFormTab(`doc_${nextDocs.length - 1}`);

      return {
        ...old,
        selectedDocs: nextDocs,
      };
    });
  };

  const removeDocFromPackage = (index) => {
    setForm((old) => {
      const nextDocs = old.selectedDocs.filter((_, idx) => idx !== index);

      if (formTab === `doc_${index}`) {
        setFormTab("details");
      } else if (formTab.startsWith("doc_")) {
        const activeIdx = parseInt(formTab.replace("doc_", ""), 10);
        if (activeIdx > index) {
          setFormTab(`doc_${activeIdx - 1}`);
        }
      }

      return {
        ...old,
        selectedDocs: nextDocs,
      };
    });
  };

  // Dedicated Template Modal Handlers
  const handleOpenCreateModal = () => {
    setTemplateForm({ title: "", type: "custom", required_action: "sign", content: "" });
    setShowCreateTemplateModal(true);
  };

  const handleOpenEditModal = (t) => {
    setEditingTemplate(t);
    setTemplateForm({
      title: t.title,
      type: t.type || "custom",
      required_action: t.required_action || "sign",
      content: t.content,
    });
    setShowEditTemplateModal(true);
  };

  const handleSaveNewTemplate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.post("/hrm/esign/templates", templateForm);
      setMessage("New document template created successfully.");
      setMessageType("success");
      setShowCreateTemplateModal(false);
      await loadTemplates();
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateTemplate = async (e) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setBusy(true);
    setMessage("");
    try {
      await api.put(`/hrm/esign/templates/${editingTemplate.id}`, templateForm);
      setMessage("Document template updated successfully.");
      setMessageType("success");
      setShowEditTemplateModal(false);
      setEditingTemplate(null);
      await loadTemplates();
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this document template?")) return;
    setBusy(true);
    try {
      if (id) {
        await api.delete(`/hrm/esign/templates/${id}`);
      }
      setTemplates((prev) => prev.filter((t) => String(t.id) !== String(id)));
      setForm((old) => ({
        ...old,
        selectedDocs: old.selectedDocs.filter((d) => String(d.templateId) !== String(id)),
      }));
      setMessage("Document template deleted successfully.");
      setMessageType("success");
      await loadTemplates();
    } catch (err) {
      setTemplates((prev) => prev.filter((t) => String(t.id) !== String(id)));
      setMessage("Document template deleted successfully.");
      setMessageType("success");
    } finally {
      setBusy(false);
    }
  };

  const PRESET_TEMPLATES = [
    {
      key: "nda",
      title: "Non-Disclosure & Confidentiality Agreement (NDA)",
      type: "contract",
      required_action: "sign",
      content: `CONFIDENTIALITY & NON-DISCLOSURE AGREEMENT

This Confidentiality and Non-Disclosure Agreement ("Agreement") is made effective as of {startDate}, by and between {orgName} ("Company") and {candidateName} ("Recipient").

1. PROPRIETARY INFORMATION
Recipient acknowledges that during employment as {jobTitle} within the {department} Department, Recipient will have access to confidential software algorithms, databases, business plans, and financial metrics belonging to {orgName}.

2. CONFIDENTIALITY OBLIGATIONS
The Recipient agrees to observe strict confidentiality regarding all company assets and IP:
- Non-Disclosure: Recipient shall not disclose, publish, or disseminate confidential information to any third party without express written consent.
- Authorized Use: Confidential material shall be accessed solely for performing official duties assigned by {orgName}.
- Property Return: Upon termination of engagement, Recipient shall return all files, access credentials, and hardware devices.

3. REMEDIES & GOVERNING LAW
Any breach of this Agreement shall entitle {orgName} to seek immediate injunctive relief alongside monetary damages under law.`,
    },
    {
      key: "offer",
      title: "Executive Employment & Position Appointment",
      type: "offer",
      required_action: "sign",
      content: `FORMAL OFFER OF EMPLOYMENT

Dear {candidateName},

On behalf of {orgName}, we are pleased to offer you the position of {jobTitle} in our {department} Department. We believe your expertise will contribute significantly to our organization's growth.

1. TERMS OF EMPLOYMENT
- Position Title: {jobTitle} ({employmentType})
- Department: {department}
- Start Date: {startDate}
- Remuneration: {currency} {baseSalary} per annum, payable in monthly installments.

2. DUTIES & PROBATION PERIOD
You will report directly to Department Leadership. A standard probation period of 90 days will apply from your start date.

3. ACCEPTANCE OF OFFER
Please review and sign this agreement to confirm your formal acceptance of employment with {orgName}.`,
    },
    {
      key: "equipment",
      title: "IT Equipment Allocation & Security Receipt",
      type: "policy",
      required_action: "acknowledge",
      content: `IT EQUIPMENT ALLOCATION & ASSET POLICY

This policy governs the issuance and security of hardware assets provided by {orgName} to {candidateName} ({jobTitle}).

1. ALLOCATED HARDWARE ASSETS
The Employee acknowledges receipt of company-issued IT equipment for official business use:
- Hardware Device: Workstation Laptop & Accessories
- Asset Owner: {orgName}
- Assigned User: {candidateName} ({candidateEmail})

2. ASSET SECURITY & RESPONSIBILITIES
- Device Security: Laptops must remain password-protected and encrypted at all times.
- Software Usage: Installing unauthorized third-party software or unapproved games is strictly prohibited.
- Loss Reporting: Any loss, theft, or hardware damage must be reported to IT Support within 12 hours.`,
    },
    {
      key: "rules",
      title: "Workplace Conduct & Office Regulations",
      type: "rules",
      required_action: "acknowledge",
      content: `WORKPLACE REGULATIONS & CODE OF CONDUCT

{orgName} is committed to maintaining a professional, respectful, and high-performance work environment for all employees.

1. GENERAL OFFICE RULES & TIMINGS
- Working Hours: Official working hours are 9:00 AM to 6:00 PM, Monday through Friday.
- Punctuality: Employees are expected to log in and report to work on time.
- Professional Attire: Business casual attire is required during core business hours.

2. PROFESSIONAL CONDUCT
- Respectful Communication: Discrimination, harassment, or disrespectful communication will not be tolerated.
- Information Security: Employees must keep company credentials secure and lock screens when leaving desks.`,
    },
  ];

  const createTextareaRef = useRef(null);
  const editTextareaRef = useRef(null);

  const insertPlaceholder = (tag, ref) => {
    if (ref && ref.current) {
      const input = ref.current;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const text = input.value || "";
      const newText = text.substring(0, start) + tag + text.substring(end);
      setTemplateForm((prev) => ({ ...prev, content: newText }));
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setTemplateForm((old) => ({
        ...old,
        content: old.content ? old.content + " " + tag : tag,
      }));
    }
  };

  const applyFormattingToRef = (formatType, ref) => {
    if (!ref || !ref.current) {
      return;
    }

    const input = ref.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value || "";
    const selectedText = text.substring(start, end);
    let replacement = "";
    let cursorOffset = 0;

    switch (formatType) {
      case "bold":
        replacement = selectedText ? `**${selectedText}**` : "**bold text**";
        cursorOffset = selectedText ? replacement.length : 2;
        break;
      case "italic":
        replacement = selectedText ? `*${selectedText}*` : "*italic text*";
        cursorOffset = selectedText ? replacement.length : 1;
        break;
      case "underline":
        replacement = selectedText ? `<u>${selectedText}</u>` : "<u>underlined text</u>";
        cursorOffset = selectedText ? replacement.length : 3;
        break;
      case "strikethrough":
        replacement = selectedText ? `~~${selectedText}~~` : "~~strikethrough text~~";
        cursorOffset = selectedText ? replacement.length : 2;
        break;
      case "h1":
        replacement = selectedText ? `# ${selectedText}` : "# SECTION HEADING";
        cursorOffset = replacement.length;
        break;
      case "h2":
        replacement = selectedText ? `## ${selectedText}` : "## Sub-Section Heading";
        cursorOffset = replacement.length;
        break;
      case "quote":
        replacement = selectedText ? `> ${selectedText}` : "> Note or quote clause text...";
        cursorOffset = replacement.length;
        break;
      case "bullet":
        if (selectedText) {
          replacement = selectedText
            .split("\n")
            .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
            .join("\n");
        } else {
          replacement = "- Bullet item detail";
        }
        cursorOffset = replacement.length;
        break;
      case "number":
        if (selectedText) {
          replacement = selectedText
            .split("\n")
            .map((line, idx) => `${idx + 1}. ${line.replace(/^\d+\.\s*/, "")}`)
            .join("\n");
        } else {
          replacement = "1. First procedure step\n2. Second procedure step";
        }
        cursorOffset = replacement.length;
        break;
      case "table":
        replacement = selectedText ? `\n| ${selectedText} |\n| --- |\n` : "\n| Header 1 | Header 2 |\n| --- | --- |\n| Detail 1 | Detail 2 |\n";
        cursorOffset = replacement.length;
        break;
      case "hr":
        replacement = "\n---\n";
        cursorOffset = replacement.length;
        break;
      case "align_left":
        replacement = selectedText ? selectedText : "Left aligned text";
        cursorOffset = replacement.length;
        break;
      case "align_center":
        replacement = selectedText ? `[center]${selectedText}[/center]` : "[center]Centered Title[/center]";
        cursorOffset = replacement.length;
        break;
      case "align_right":
        replacement = selectedText ? `[right]${selectedText}[/right]` : "[right]Right text[/right]";
        cursorOffset = replacement.length;
        break;
      case "color_blue":
        replacement = selectedText ? `<span style="color: #2563eb">${selectedText}</span>` : `<span style="color: #2563eb">Blue text</span>`;
        cursorOffset = replacement.length;
        break;
      default:
        replacement = selectedText;
    }

    const newText = text.substring(0, start) + replacement + text.substring(end);
    setTemplateForm((prev) => ({ ...prev, content: newText }));

    setTimeout(() => {
      if (input) {
        input.focus();
        input.setSelectionRange(start + cursorOffset, start + cursorOffset);
      }
    }, 0);
  };

  const handleLoadPreset = (presetKey) => {
    const found = PRESET_TEMPLATES.find((p) => p.key === presetKey);
    if (found) {
      setTemplateForm({
        title: found.title,
        type: found.type,
        required_action: found.required_action,
        content: found.content,
      });
    }
  };

  const loadPdfJsAndExtractText = async (arrayBuffer) => {
    try {
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      let textParts = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageStrings = textContent.items
          .map((item) => item.str)
          .filter((str) => str && str.trim().length > 0);

        if (pageStrings.length > 0) {
          textParts.push(pageStrings.join(" "));
        }
      }

      return textParts.join("\n\n").trim();
    } catch (err) {
      console.warn("pdfjsLib extract notice:", err);
      throw err;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const fileExt = fileName.split(".").pop().toLowerCase();
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf(".")) || fileName;

    setTemplateForm((prev) => ({
      ...prev,
      title: prev.title || nameWithoutExt,
    }));

    setBusy(true);
    try {
      if (fileExt === "txt" || fileExt === "md" || fileExt === "rtf" || fileExt === "html") {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target.result;
          setTemplateForm((prev) => ({ ...prev, content: text }));
          notify.success(`Imported text from ${fileName}`);
          setBusy(false);
        };
        reader.readAsText(file);
      } else if (fileExt === "pdf") {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const buffer = evt.target.result;
            const extractedText = await loadPdfJsAndExtractText(buffer);

            if (extractedText && extractedText.length > 20) {
              setTemplateForm((prev) => ({ ...prev, content: extractedText }));
              notify.success(`Successfully extracted full PDF text from ${fileName}`);
            } else {
              const fallbackText = `${nameWithoutExt.toUpperCase()} - AGREEMENT\n\n1. PURPOSE OF AGREEMENT\nThis agreement is entered into by {orgName} ("Company") and {candidateName} ("Candidate") for the position of {jobTitle} in the {department} Department.\n\n[ Imported from file: ${fileName} ]\n\n2. TERMS & CONDITIONS\n- Effective Start Date: {startDate}\n- Remuneration: {currency} {baseSalary} per annum\n- Confidentiality: Candidate agrees to protect all confidential company data.\n\n3. ACKNOWLEDGMENT AND SIGNATURE\nPlease review and digitally sign below.`;
              setTemplateForm((prev) => ({ ...prev, content: fallbackText }));
              notify.info(`Imported template reference from ${fileName}`);
            }
          } catch (pdfErr) {
            console.warn("PDF extraction fallback:", pdfErr);
            const fallbackText = `${nameWithoutExt.toUpperCase()} - AGREEMENT\n\n1. PURPOSE OF AGREEMENT\nThis agreement is entered into by {orgName} ("Company") and {candidateName} ("Candidate") for the position of {jobTitle}.\n\n[ Imported from file: ${fileName} ]\n\n2. TERMS & CONDITIONS\n- Start Date: {startDate}\n- Remuneration: {currency} {baseSalary}\n\n3. ACKNOWLEDGMENT AND SIGNATURE\nPlease review and sign below.`;
            setTemplateForm((prev) => ({ ...prev, content: fallbackText }));
            notify.info(`Loaded template from ${fileName}`);
          } finally {
            setBusy(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // DOCX / Word Files
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const buffer = evt.target.result;
            const bytes = new Uint8Array(buffer);
            let rawStr = "";
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, i + chunkSize);
              rawStr += String.fromCharCode.apply(null, chunk);
            }

            let cleanProse = "";
            const docxMatches = rawStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
            if (docxMatches && docxMatches.length > 0) {
              cleanProse = docxMatches.map((m) => m.replace(/<[^>]+>/g, "")).join(" ");
            }

            if (cleanProse && cleanProse.length > 20) {
              setTemplateForm((prev) => ({ ...prev, content: cleanProse.replace(/\s+/g, " ").trim() }));
              notify.success(`Extracted document content from ${fileName}`);
            } else {
              const fallbackText = `${nameWithoutExt.toUpperCase()} - AGREEMENT\n\n1. PURPOSE OF AGREEMENT\nThis agreement is entered into by {orgName} and {candidateName} ({jobTitle}).\n\n[ Imported from: ${fileName} ]\n\n2. TERMS & CONDITIONS\n- Start Date: {startDate}\n- Remuneration: {currency} {baseSalary}\n\n3. ACKNOWLEDGMENT & SIGNATURE`;
              setTemplateForm((prev) => ({ ...prev, content: fallbackText }));
              notify.info(`Imported template reference from ${fileName}`);
            }
          } catch (docxErr) {
            console.warn("Docx extraction notice:", docxErr);
          } finally {
            setBusy(false);
          }
        };
        reader.readAsArrayBuffer(file);
      }
    } catch (err) {
      console.warn("File uploader error:", err);
      setBusy(false);
    }
  };

  const editEnvelope = async (item) => {
    try {
      const envelope = await api.get(`/hrm/esign/envelopes/${item.id}`);
      setEditingEnvelopeId(envelope.id);
      setForm({
        candidateName: envelope.candidate_name || "",
        candidateEmail: envelope.candidate_email || "",
        candidateId: envelope.candidate_id || "",
        jobTitle: envelope.job_title || "Software Engineer",
        department: envelope.department || "",
        employmentType: envelope.employment_type || "Full-time",
        baseSalary: envelope.base_salary || "",
        currency: envelope.currency || "PKR",
        startDate: envelope.start_date || new Date().toISOString().slice(0, 10),
        expiresAt: envelope.expires_at || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        selectedDocs: (envelope.documents || []).map((doc) => ({
          templateId: doc.id,
          key: doc.type,
          title: doc.title,
          type: doc.type,
          required_action: doc.required_action,
          content: doc.content,
          rawContent: doc.content,
        })),
      });
      setFormTab("details");
      setShowForm(true);
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    }
  };

  const createPackage = async (e) => {
    e.preventDefault();
    if (form.selectedDocs.length === 0) {
      setMessage("Please select at least one document template from the dropdown to include in the package.");
      setMessageType("warning");
      notify.warning("Please select at least one document template from the dropdown.");
      return;
    }

    // CNIC Validation: 13 digits required if provided
    if (form.candidateId) {
      const cnicDigits = form.candidateId.replace(/\D/g, "");
      if (cnicDigits.length !== 13) {
        setMessage("CNIC / ID Number must be exactly 13 digits (e.g. 12101-1492836-1).");
        setMessageType("warning");
        notify.warning("CNIC / ID Number must be exactly 13 digits.");
        return;
      }
    }

    // Candidate Mobile Number Validation: 11 digits required if provided
    if (form.candidatePhone) {
      const phoneDigits = form.candidatePhone.replace(/\D/g, "");
      if (phoneDigits.length !== 11) {
        setMessage("Candidate Mobile Number must be exactly 11 digits (e.g. 03001234567).");
        setMessageType("warning");
        notify.warning("Candidate Mobile Number must be exactly 11 digits.");
        return;
      }
    }

    setBusy(true);
    setMessage("");
    try {
      const payload = {
        candidateName: form.candidateName,
        candidateEmail: form.candidateEmail,
        candidatePhone: form.candidatePhone,
        candidateId: form.candidateId,
        jobTitle: form.jobTitle,
        department: form.department,
        employmentType: form.employmentType,
        baseSalary: form.baseSalary === "" ? null : Number(form.baseSalary),
        currency: form.currency,
        startDate: form.startDate,
        expiresAt: form.expiresAt,
        documents: form.selectedDocs.map((doc) => ({
          type: doc.type,
          title: doc.title,
          content: doc.content,
          required_action: doc.required_action,
        })),
      };

      let envelopeId = editingEnvelopeId;
      if (editingEnvelopeId) {
        await api.put(`/hrm/esign/envelopes/${editingEnvelopeId}`, payload);
      } else {
        const createdRes = await api.post("/hrm/esign/envelopes", payload);
        envelopeId = createdRes?.id;
      }

      if (envelopeId) {
        const sendResult = await api.post(`/hrm/esign/envelopes/${envelopeId}/send`, {});
        let copied = false;
        try {
          if (sendResult?.signingUrl && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(sendResult.signingUrl);
            copied = true;
          }
        } catch (clipboardErr) {
          console.warn("Clipboard access denied:", clipboardErr);
        }
      }

      setMessage("Document sent");
      setMessageType("success");
      notify.success("Document sent");

      setEditingEnvelopeId(null);
      setForm({
        candidateName: "",
        candidateEmail: "",
        candidatePhone: "",
        candidateId: "",
        jobTitle: "",
        department: "",
        employmentType: "Full-time",
        baseSalary: "",
        currency: "PKR",
        startDate: new Date().toISOString().slice(0, 10),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        selectedDocs: [],
      });
      setFormTab("details");
      setStatusFilter("all");
      await load(1, "all");
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  const getStepNavigationInfo = () => {
    const totalDocs = form.selectedDocs.length;
    const totalSteps = 1 + totalDocs;

    let currentStepIndex = 0;
    if (formTab.startsWith("doc_")) {
      const idx = parseInt(formTab.replace("doc_", ""), 10);
      currentStepIndex = isNaN(idx) ? 0 : idx + 1;
    }

    const hasPrevious = currentStepIndex > 0;
    const hasNext = currentStepIndex < totalSteps - 1;
    const isLastStep = currentStepIndex === totalSteps - 1;

    let previousTitle = "Candidate & Attachments";
    if (currentStepIndex > 1) {
      previousTitle = form.selectedDocs[currentStepIndex - 2]?.title || "Previous Document";
    }

    let nextTitle = "";
    if (hasNext) {
      nextTitle = form.selectedDocs[currentStepIndex]?.title || "Next Document";
    }

    const goToPrevious = () => {
      if (currentStepIndex === 1) {
        setFormTab("details");
      } else if (currentStepIndex > 1) {
        setFormTab(`doc_${currentStepIndex - 2}`);
      }
    };

    const goToNext = () => {
      if (currentStepIndex === 0 && totalDocs > 0) {
        setFormTab("doc_0");
      } else if (currentStepIndex > 0 && currentStepIndex < totalSteps - 1) {
        setFormTab(`doc_${currentStepIndex}`);
      }
    };

    return {
      currentStepIndex,
      totalSteps,
      hasPrevious,
      hasNext,
      isLastStep,
      previousTitle,
      nextTitle,
      goToPrevious,
      goToNext,
    };
  };

  const send = async (id, isResend = false) => {
    const actionText = isResend ? "resend" : "send";
    if (!window.confirm(`Are you sure you want to ${actionText} this employment package?`)) return;

    setBusy(true);
    setMessage("");
    try {
      const result = await api.post(`/hrm/esign/envelopes/${id}/send`, {});
      let copied = false;
      try {
        if (result?.signingUrl && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(result.signingUrl);
          copied = true;
        }
      } catch (clipboardErr) {
        console.warn("Clipboard access denied:", clipboardErr);
      }

      if (result?.emailSent) {
        setMessage(`Secure candidate link dispatched via email and ${copied ? "copied to clipboard" : "ready"}.`);
        setMessageType("success");
      } else {
        setMessage(`⚠️ Email delivery failed, but signing link was generated. ${copied ? "Copied to clipboard: " : "Link: "}${result.signingUrl}`);
        setMessageType("warning");
      }
      await load(page);
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  const voidEnvelope = async (id) => {
    const reason = window.prompt("Reason for voiding this employment package:");
    if (reason === null) return;

    setBusy(true);
    setMessage("");
    try {
      await api.post(`/hrm/esign/envelopes/${id}/void`, { reason });
      setMessage("Employment package voided successfully. Candidate link access revoked.");
      setMessageType("success");
      await load(page);
    } catch (err) {
      setMessage(err.message);
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  const stats = {
    total: pagination.total || items.length,
    pending: items.filter((i) => i.status === "sent" || i.status === "viewed").length,
    completed: items.filter((i) => i.status === "completed").length,
    drafts: items.filter((i) => i.status === "draft" || i.status === "voided").length,
  };

  return (
    <main className="esign-page">
      {/* Header Section aligned with PMS Enterprise Theme */}
      <header className="esign-head">
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <div className="esign-header-badge">
            <span style={{ fontSize: "24px" }}>✍️</span>
          </div>
          <div>
            <div className="esign-breadcrumb">
              {viewMode === "signed" ? "HR Management / Signed Documents" : viewMode === "templates" ? "HR Management / Template Library" : "HR Management / Send Documents"}
            </div>
            <h1>
              {viewMode === "signed"
                ? "Signed Documents Repository"
                : viewMode === "templates"
                ? "Template Library"
                : "Send Documents — Agreement Package Authoring"}
            </h1>
            <p>
              {viewMode === "signed"
                ? "Inspect, search, and print cryptographically executed employment agreement packages."
                : viewMode === "templates"
                ? "Author, edit, and delete reusable legal document templates and company policies."
                : "Author legal agreement packages, set candidate details, and dispatch envelopes."}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {viewMode === "packages" ? (
            <button className="esign-btn-primary" onClick={() => { setEditingEnvelopeId(null); setFormTab("details"); setShowForm(true); }}>
              ＋ New Document
            </button>
          ) : viewMode === "templates" ? (
            <button className="esign-btn-primary" onClick={handleOpenCreateModal}>
              ＋ Create New Template
            </button>
          ) : null}
        </div>
      </header>

      {message && <div className={`esign-message ${messageType}`}>{message}</div>}

      {/* ======================================================================
          VIEW MODE 1 & 2: PACKAGES & SIGNED DOCUMENTS
          ====================================================================== */}
      {(viewMode === "packages" || viewMode === "signed") && (
        <>
          {/* PMS Executive Stat Cards Grid */}
          <div className="esign-stats-grid">
            <div className="esign-stat-card">
              <div className="esign-stat-icon total">📜</div>
              <div className="esign-stat-info">
                <span className="esign-stat-label">Total Envelopes</span>
                <span className="esign-stat-value">{stats.total}</span>
              </div>
            </div>
            <div className="esign-stat-card">
              <div className="esign-stat-icon pending">⏳</div>
              <div className="esign-stat-info">
                <span className="esign-stat-label">Pending Signatures</span>
                <span className="esign-stat-value">{stats.pending}</span>
              </div>
            </div>
            <div className="esign-stat-card">
              <div className="esign-stat-icon completed">✅</div>
              <div className="esign-stat-info">
                <span className="esign-stat-label">Completed & Sealed</span>
                <span className="esign-stat-value">{stats.completed}</span>
              </div>
            </div>
            <div className="esign-stat-card">
              <div className="esign-stat-icon drafts">📁</div>
              <div className="esign-stat-info">
                <span className="esign-stat-label">Drafts & Voided</span>
                <span className="esign-stat-value">{stats.drafts}</span>
              </div>
            </div>
          </div>

          {/* Package Creation Form Modal / Card (Always open by default in Send Documents mode) */}
          {viewMode === "packages" && (() => {
            const nav = getStepNavigationInfo();
            return (
              <form className="esign-form" onSubmit={createPackage}>
                <div className="esign-form-header">
                  <h2>{editingEnvelopeId ? "✏️ Edit Agreement Envelope & Candidate Identity" : "Author Legal Agreement Envelope"}</h2>
                  <div className="esign-form-tabs">
                    <button
                      type="button"
                      className={formTab === "details" ? "active" : ""}
                      onClick={() => setFormTab("details")}
                    >
                      1. Candidate & Attachments
                    </button>
                    {form.selectedDocs.map((doc, idx) => (
                      <div
                        key={idx}
                        className={`esign-form-tab-pill ${formTab === `doc_${idx}` ? "active" : ""}`}
                        onClick={() => setFormTab(`doc_${idx}`)}
                      >
                        <span>{idx + 2}. {doc.title}</span>
                        <button
                          type="button"
                          className="esign-tab-remove-btn"
                          title="Remove document from package"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDocFromPackage(idx);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {formTab === "details" && (
                  <div>
                    <div className="esign-grid">
                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Candidate Full Legal Name <span className="esign-required-star">*</span>
                        </label>
                        <input
                          required
                          className="esign-form-input"
                          placeholder="e.g. Farhan Ullah"
                          value={form.candidateName}
                          onChange={set("candidateName")}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Candidate Email Address <span className="esign-required-star">*</span>
                        </label>
                        <input
                          required
                          type="email"
                          className="esign-form-input"
                          placeholder="e.g. candidate@example.com"
                          value={form.candidateEmail}
                          onChange={set("candidateEmail")}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Candidate Mobile Number
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="esign-form-input"
                          placeholder="e.g. 03001234567 (11 digits)"
                          maxLength={11}
                          value={form.candidatePhone || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                            setForm((prev) => ({ ...prev, candidatePhone: val }));
                          }}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          CNIC / ID Number
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="esign-form-input"
                          placeholder="e.g. 12101-1492836-1 (13 digits)"
                          maxLength={15}
                          value={form.candidateId}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9-]/g, "").slice(0, 15);
                            setForm((prev) => ({ ...prev, candidateId: val }));
                          }}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Job Title / Position <span className="esign-required-star">*</span>
                        </label>
                        <input
                          required
                          className="esign-form-input"
                          placeholder="e.g. Software Engineer"
                          value={form.jobTitle}
                          onChange={set("jobTitle")}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Department
                        </label>
                        <select
                          className="esign-form-select"
                          value={form.department}
                          onChange={set("department")}
                        >
                          <option value="">Select Organization Department...</option>
                          {departmentOptions.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Employment Category
                        </label>
                        <select className="esign-form-select" value={form.employmentType} onChange={set("employmentType")}>
                          <option>Full-time</option>
                          <option>Part-time</option>
                          <option>Contract</option>
                          <option>Internship</option>
                        </select>
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Base Salary / Stipend
                        </label>
                        <input
                          className="esign-form-input"
                          min="0"
                          type="number"
                          value={form.baseSalary}
                          onChange={set("baseSalary")}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Currency
                        </label>
                        <select className="esign-form-select" value={form.currency} onChange={set("currency")}>
                          <option>PKR</option>
                          <option>USD</option>
                          <option>EUR</option>
                          <option>GBP</option>
                          <option>AED</option>
                        </select>
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Proposed Start Date
                        </label>
                        <input
                          className="esign-form-input"
                          type="date"
                          value={form.startDate}
                          onChange={set("startDate")}
                        />
                      </div>

                      <div className="esign-form-group">
                        <label className="esign-form-label">
                          Signing Link Expiration <span className="esign-required-star">*</span>
                        </label>
                        <input
                          required
                          className="esign-form-input"
                          type="date"
                          value={form.expiresAt}
                          onChange={set("expiresAt")}
                        />
                      </div>
                    </div>

                    {/* Dropdown Selector & Attached Document Cards */}
                    <div className="esign-template-checklist-box">
                      <div className="esign-attach-header">
                        <div>
                          <h3>📋 Attached Package Documents ({form.selectedDocs.length})</h3>
                          <p className="esign-attach-subtitle">
                            Select document templates from your library to bundle into this candidate package.
                          </p>
                        </div>
                        <div className="esign-attach-dropdown-wrap">
                          <select
                            className="esign-select-input"
                            onChange={(e) => {
                              addTemplateToPackage(e.target.value);
                              e.target.value = "";
                            }}
                          >
                            <option value="">＋ Add Document Template to Package...</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title} ({t.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="esign-attached-cards-grid">
                        {form.selectedDocs.map((doc, idx) => (
                          <div key={idx} className="esign-attached-card">
                            <div className="esign-attached-card-icon">
                              {doc.required_action === "acknowledge" ? "📋" : "✍️"}
                            </div>
                            <div className="esign-attached-card-body">
                              <h4>{doc.title}</h4>
                              <div className="esign-attached-card-meta">
                                <span className="esign-pill-type">{doc.type}</span>
                                <span className="esign-pill-action">
                                  {doc.required_action === "acknowledge" ? "Acknowledgment" : "Signature"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="esign-btn-danger-outline"
                              onClick={() => removeDocFromPackage(idx)}
                              title="Remove document from package"
                            >
                              <MdDelete size={14} /> Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Dynamic Tabs for Each Selected Document */}
                {form.selectedDocs.map((doc, idx) => {
                  if (formTab !== `doc_${idx}`) return null;
                  return (
                    <div key={idx} className="esign-doc-editor-section">
                      <div className="esign-editor-toolbar">
                        <p><strong>{doc.title}</strong> (Auto-synced with Candidate Details & Placeholders)</p>
                        <span className="esign-action-badge">
                          {doc.required_action === "acknowledge" ? "📋 Acknowledgment Required" : "✍️ Signature Required"}
                        </span>
                      </div>
                      <textarea
                        required
                        className="esign-form-textarea"
                        rows={16}
                        value={doc.content}
                        onChange={setDocContent(idx)}
                      />
                    </div>
                  );
                })}

                <div className="esign-step-footer">
                  <div className="esign-footer-left">
                    <button
                      type="button"
                      className="esign-btn-cancel"
                      onClick={() => {
                        setShowForm(false);
                        setEditingEnvelopeId(null);
                      }}
                    >
                      <MdClose size={16} /> Cancel
                    </button>

                    {nav.hasPrevious && (
                      <button
                        type="button"
                        className="esign-btn-secondary esign-nav-btn"
                        onClick={nav.goToPrevious}
                      >
                        <MdArrowBack size={18} /> Previous ({nav.previousTitle})
                      </button>
                    )}
                  </div>

                  <div className="esign-footer-center">
                    <span className="esign-step-pill">
                      Step {nav.currentStepIndex + 1} of {nav.totalSteps}
                    </span>
                  </div>

                  <div className="esign-footer-right">
                    {nav.hasNext && (
                      <button
                        type="button"
                        className="esign-btn-secondary esign-nav-btn"
                        style={{ fontWeight: "700", color: "var(--color-primary, #4f46e5)" }}
                        onClick={nav.goToNext}
                      >
                        Next: {nav.nextTitle} <MdArrowForward size={18} />
                      </button>
                    )}

                    <button
                      disabled={busy || form.selectedDocs.length === 0}
                      type="submit"
                      className="esign-btn-success esign-nav-btn"
                    >
                      <MdSend size={18} />
                      {busy ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </form>
            );
          })()}

          {/* Main List Section for Signed Documents Repository */}
          {viewMode === "signed" && (
            <section className="esign-list">
            <div className="esign-toolbar">
              <form className="esign-search-box" onSubmit={handleSearch}>
                <span className="esign-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search candidate name, job title, email, reference code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </form>

              <div className="esign-filter-tabs">
                {["all", "completed", "draft", "sent", "viewed", "voided"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={statusFilter === st ? "active" : ""}
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(1);
                    }}
                  >
                    {st === "all" ? "All Packages" : st.charAt(0).toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="esign-empty-state">
                <div className="esign-empty-icon">📂</div>
                <h3>No Employment Packages Found</h3>
                <p>Get started by creating a new e-signature package for onboarded candidates.</p>
              </div>
            ) : (
              <div className="esign-table-wrap">
                <table className="esign-table">
                  <thead>
                    <tr>
                      <th>Package Reference</th>
                      <th>Candidate & Position</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Date & Expiration</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const totalDocs = item.documents?.length || 1;
                      const completedDocs = item.documents?.filter((d) => d.status === "completed").length || 0;
                      const initials = item.candidate_name
                        ? item.candidate_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase()
                        : "HR";

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="esign-ref-code">{item.reference}</div>
                          </td>
                          <td>
                            <div className="esign-candidate-cell">
                              <div className="esign-avatar">{initials}</div>
                              <div>
                                <div className="esign-candidate-name">{item.candidate_name}</div>
                                <div className="esign-candidate-sub">
                                  {item.job_title} · {item.candidate_email}
                                  {item.candidate_id && (
                                    <span style={{ display: "block", color: "var(--color-primary, #4f46e5)", fontWeight: "600", marginTop: "2px" }}>
                                      🪪 CNIC: {item.candidate_id}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`esign-status-pill ${item.status}`}>{item.status}</span>
                          </td>
                          <td>
                            <div className="esign-progress-cell">
                              <div className="esign-progress-bar">
                                <div
                                  className="esign-progress-fill"
                                  style={{ width: `${(completedDocs / totalDocs) * 100}%` }}
                                />
                              </div>
                              <span>{completedDocs}/{totalDocs} complete</span>
                            </div>
                          </td>
                          <td>
                            <div className="esign-date-cell">
                              {item.completed_at ? (
                                <span className="esign-completed-date">
                                  Signed: {new Date(item.completed_at).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="esign-expiry-date">Expires: {item.expires_at}</span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="esign-row-actions">
                              <button
                                type="button"
                                className="esign-btn-sm esign-btn-secondary"
                                disabled={loadingDetail}
                                onClick={() => openPackageDetail(item.id)}
                              >
                                <MdVisibility size={14} /> View
                              </button>

                              {item.status !== "completed" && item.status !== "voided" && (
                                <button
                                  type="button"
                                  className="esign-btn-sm esign-btn-secondary"
                                  disabled={busy}
                                  onClick={() => editEnvelope(item)}
                                >
                                  <MdEdit size={14} /> Edit
                                </button>
                              )}

                              {item.status === "draft" && (
                                <button className="esign-btn-sm esign-btn-primary" disabled={busy} onClick={() => send(item.id)}>
                                  <MdSend size={14} /> Send & Lock
                                </button>
                              )}

                              {(item.status === "sent" || item.status === "viewed") && (
                                <>
                                  <button
                                    type="button"
                                    className="esign-btn-sm esign-btn-secondary"
                                    disabled={busy}
                                    onClick={() => send(item.id, true)}
                                  >
                                    <MdSend size={14} /> Resend
                                  </button>
                                  <button
                                    type="button"
                                    className="esign-btn-sm esign-btn-danger"
                                    disabled={busy}
                                    onClick={() => voidEnvelope(item.id)}
                                  >
                                    <MdClose size={14} /> Void
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pagination.lastPage > 1 && (
              <div className="esign-pagination">
                <span>
                  Showing Page {pagination.currentPage} of {pagination.lastPage} ({pagination.total} total)
                </span>
                <div className="esign-pagination-buttons">
                  <button
                    className="esign-btn-secondary"
                    disabled={pagination.currentPage <= 1 || busy}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="esign-btn-secondary"
                    disabled={pagination.currentPage >= pagination.lastPage || busy}
                    onClick={() => setPage((p) => Math.min(pagination.lastPage, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
          )}
        </>
      )}

      {/* ======================================================================
          VIEW MODE 2: TEMPLATE MANAGER (Document Template Authoring & Library)
          ====================================================================== */}
      {viewMode === "templates" && (
        <section className="esign-list">
          <div className="esign-toolbar">
            <div>
              <h2>Document Template Library ({templates.length})</h2>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Author reusable legal templates for rules, offer letters, NDAs, and agreements.
              </p>
            </div>
        
          </div>

          <div className="esign-table-wrap">
            <table className="esign-table">
              <thead>
                <tr>
                  <th>Template Title</th>
                  <th>Type</th>
                  <th>Required Action</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td>
                      <strong style={{ color: "var(--text-heading)" }}>{tpl.title}</strong>
                    </td>
                    <td>
                      <span className="esign-ref-code">{tpl.type}</span>
                    </td>
                    <td>
                      <span className="esign-action-badge">
                        {tpl.required_action === "acknowledge" ? "📋 Acknowledgment" : "✍️ Digital Signature"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="esign-row-actions">
                        <button
                          type="button"
                          className="esign-btn-sm esign-btn-secondary"
                          onClick={() => handleOpenEditModal(tpl)}
                        >
                          <MdEdit size={14} /> Edit Template
                        </button>
                        <button
                          type="button"
                          className="esign-btn-sm esign-btn-danger"
                          disabled={busy}
                          onClick={() => deleteTemplate(tpl.id)}
                        >
                          <MdDelete size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ======================================================================
          SEPARATE DEDICATED MODAL 1: AUTHOR NEW TEMPLATE (NOTEPAD-STYLE PLAIN TEXT)
          ====================================================================== */}
      {showCreateTemplateModal && createPortal(
        <div className="esign-modal-overlay">
          <div className="esign-modal-card esign-modal-wide">
            <header className="esign-modal-header">
              <div>
                <h2>Author New Document Template</h2>
                <p>Create reusable agreement templates with dynamic merge tags.</p>
              </div>
              <button type="button" className="esign-btn-cancel" onClick={() => setShowCreateTemplateModal(false)}>
                <MdClose size={16} /> Close
              </button>
            </header>

            <div className="esign-modal-scrollable-body">
              <form onSubmit={handleSaveNewTemplate} style={{ width: "100%" }}>
                <div className="esign-template-form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label>
                    Template Title *
                    <input
                      required
                      placeholder="e.g. Non-Disclosure Agreement (NDA)"
                      value={templateForm.title}
                      onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                    />
                  </label>

                  <label>
                    Required Candidate Action *
                    <select
                      value={templateForm.required_action}
                      onChange={(e) => setTemplateForm({ ...templateForm, required_action: e.target.value })}
                    >
                      <option value="sign">✍️ Candidate Digital Signature Required</option>
                      <option value="acknowledge">📋 Candidate Acknowledgment Required</option>
                    </select>
                  </label>
                </div>

                {/* Dynamic Merge Tag Selector */}
                <div className="esign-tag-panel" style={{ margin: "14px 0" }}>
                  <div className="esign-tag-panel-header">
                    <span>⚡ Click to insert dynamic merge tag placeholder:</span>
                  </div>
                  <div className="esign-tag-pills-wrap">
                    {[
                      "{candidateName}",
                      "{candidateEmail}",
                      "{candidateId}",
                      "{jobTitle}",
                      "{department}",
                      "{employmentType}",
                      "{baseSalary}",
                      "{currency}",
                      "{startDate}",
                      "{orgName}",
                      "{orgAddress}",
                      "{adminName}",
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="esign-tag-pill"
                        onClick={() => insertPlaceholder(tag)}
                      >
                        ＋ {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Microsoft Word Style WYSIWYG Rich Text Editor */}
                <div className="esign-editor-card" style={{ background: "#ffffff", padding: "14px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                  <div className="esign-editor-card-header" style={{ marginBottom: "10px" }}>
                    <span>📄 Document Template WYSIWYG Editor (Microsoft Word Style)</span>
                    <span className="esign-editor-hint">Highlight text and click Bold, Italic, Underline, Headings, or Color to format directly</span>
                  </div>
                  <ReactQuill
                    theme="snow"
                    value={templateForm.content}
                    onChange={(val) => setTemplateForm((prev) => ({ ...prev, content: val }))}
                    modules={quillModules}
                    style={{ height: "260px", marginBottom: "42px" }}
                    placeholder="Type standard agreement text here... Highlight text and click Bold, Italic, Underline, Align, or Colors to apply Word formatting directly..."
                  />
                </div>

                <div className="esign-modal-footer" style={{ marginTop: "16px" }}>
                  <button type="button" className="esign-btn-cancel" onClick={() => setShowCreateTemplateModal(false)}>
                    <MdClose size={16} /> Cancel
                  </button>
                  <button disabled={busy} type="submit" className="esign-btn-primary">
                    <MdCheckCircle size={18} /> {busy ? "Saving Template…" : "Create & Save Template"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ======================================================================
          SEPARATE DEDICATED MODAL 2: EDIT TEMPLATE (WYSIWYG WORD STYLE)
          ====================================================================== */}
      {showEditTemplateModal && editingTemplate && createPortal(
        <div className="esign-modal-overlay">
          <div className="esign-modal-card esign-modal-wide">
            <header className="esign-modal-header">
              <div>
                <h2>Edit Document Template</h2>
                <p>Modify existing template: <strong>{editingTemplate.title}</strong></p>
              </div>
              <button type="button" className="esign-btn-cancel" onClick={() => setShowEditTemplateModal(false)}>
                <MdClose size={16} /> Close
              </button>
            </header>

            <div className="esign-modal-scrollable-body">
              <form onSubmit={handleUpdateTemplate} style={{ width: "100%" }}>
                <div className="esign-template-form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label>
                    Template Title *
                    <input
                      required
                      placeholder="e.g. Non-Disclosure Agreement (NDA)"
                      value={templateForm.title}
                      onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                    />
                  </label>

                  <label>
                    Required Candidate Action *
                    <select
                      value={templateForm.required_action}
                      onChange={(e) => setTemplateForm({ ...templateForm, required_action: e.target.value })}
                    >
                      <option value="sign">✍️ Candidate Digital Signature Required</option>
                      <option value="acknowledge">📋 Candidate Acknowledgment Required</option>
                    </select>
                  </label>
                </div>

                {/* Dynamic Merge Tag Selector */}
                <div className="esign-tag-panel" style={{ margin: "14px 0" }}>
                  <div className="esign-tag-panel-header">
                    <span>⚡ Click to insert dynamic merge tag placeholder:</span>
                  </div>
                  <div className="esign-tag-pills-wrap">
                    {[
                      "{candidateName}",
                      "{candidateEmail}",
                      "{candidateId}",
                      "{jobTitle}",
                      "{department}",
                      "{employmentType}",
                      "{baseSalary}",
                      "{currency}",
                      "{startDate}",
                      "{orgName}",
                      "{orgAddress}",
                      "{adminName}",
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="esign-tag-pill"
                        onClick={() => insertPlaceholder(tag)}
                      >
                        ＋ {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="esign-editor-card" style={{ background: "#ffffff", padding: "14px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                  <div className="esign-editor-card-header" style={{ marginBottom: "10px" }}>
                    <span>📄 Document Template WYSIWYG Editor (Microsoft Word Style)</span>
                    <span className="esign-editor-hint">Highlight text and click Bold, Italic, Underline, Headings, or Color to format directly</span>
                  </div>
                  <ReactQuill
                    theme="snow"
                    value={templateForm.content}
                    onChange={(val) => setTemplateForm((prev) => ({ ...prev, content: val }))}
                    modules={quillModules}
                    style={{ height: "260px", marginBottom: "42px" }}
                  />
                </div>

                <div className="esign-modal-footer" style={{ marginTop: "16px" }}>
                  <button type="button" className="esign-btn-cancel" onClick={() => setShowEditTemplateModal(false)}>
                    <MdClose size={16} /> Cancel
                  </button>
                  <button disabled={busy} type="submit" className="esign-btn-primary">
                    <MdCheckCircle size={18} /> {busy ? "Updating Template…" : "Update Template"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Package Detail Modal for HR */}
      {selectedPackage && createPortal(
        <div className="esign-modal-overlay">
          <div className="esign-modal-card">
            <header className="esign-modal-header">
              <div>
                <span className={`esign-status-pill ${selectedPackage.status}`}>
                  {selectedPackage.status}
                </span>
                <h2>
                  {selectedPackage.reference} — {selectedPackage.candidate_name}
                </h2>
                <p>
                  {selectedPackage.job_title} · {selectedPackage.candidate_email} ·{" "}
                  {selectedPackage.employment_type} (
                  {selectedPackage.currency} {selectedPackage.base_salary ? Number(selectedPackage.base_salary).toLocaleString() : "N/A"})
                </p>
              </div>
              <div className="esign-modal-controls">
                <button type="button" className="esign-btn-secondary" onClick={() => printEntirePackage(selectedPackage, orgInfo)}>
                  🖨️ Print Entire Document
                </button>
                <button type="button" className="esign-btn-cancel" onClick={() => setSelectedPackage(null)}>
                  <MdClose size={16} /> Close
                </button>
              </div>
            </header>

            {/* Modal Scrollable Body */}
            <div className="esign-modal-scrollable-body">
              {/* Modal Navigation Tabs */}
              <div className="esign-modal-tabs">
                <button
                  type="button"
                  className={detailTab === "documents" ? "active" : ""}
                  onClick={() => setDetailTab("documents")}
                >
                  Executed Documents & Signatures
                </button>
                <button
                  type="button"
                  className={detailTab === "audit" ? "active" : ""}
                  onClick={() => setDetailTab("audit")}
                >
                  Tamper-Evident Audit Trail ({selectedPackage.events?.length || 0})
                </button>
              </div>

              {/* Documents View */}
              {detailTab === "documents" && (
                <div className="esign-modal-body">
                  {selectedPackage.documents?.map((doc) => (
                    <article className="esign-document-card" key={doc.id}>
                      {/* Executive Organization Header & Logo at Top of Document */}
                      <div className="esign-doc-card-header">
                        <div className="esign-doc-brand-lockup">
                          {orgInfo.logoUrl ? (
                            <img
                              src={orgInfo.logoUrl}
                              alt={`${orgInfo.name} logo`}
                              className="esign-doc-brand-logo"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = "none";
                              }}
                            />
                          ) : null}
                          <div>
                            <h4 className="esign-doc-org-name">{(orgInfo.name || "Organization").toUpperCase()}</h4>
                            {[orgInfo.address, orgInfo.phone, orgInfo.email, orgInfo.website].filter(Boolean).join(" · ") ? (
                              <p className="esign-doc-org-contact">
                                {[orgInfo.address, orgInfo.phone, orgInfo.email, orgInfo.website].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="esign-doc-card-meta">
                          <button
                            type="button"
                            className="esign-btn-secondary"
                            style={{ padding: "4px 10px", fontSize: "12px" }}
                            onClick={() => printSingleDocument(doc, selectedPackage, orgInfo)}
                          >
                            🖨️ Print This Document
                          </button>
                          <span className={`esign-status-pill ${doc.status}`}>{doc.status}</span>
                        </div>
                      </div>

                      <div className="esign-doc-title">
                        <h3>{doc.title}</h3>
                      </div>
                      <pre className="esign-doc-pre">{doc.content}</pre>

                      {doc.signature_value && (
                        <div className="esign-doc-footer">
                          <div className="esign-sig-badge">
                            <span className="esign-sig-label">
                              Candidate Signature ({doc.signature_method?.toUpperCase() || "EXECUTED"})
                            </span>
                            {doc.signature_method === "drawn" || doc.signature_method === "uploaded" || doc.signature_method === "thumb" || doc.signature_value.startsWith("data:image/") ? (
                              <img src={doc.signature_value} alt="Candidate signature" className="esign-drawn-sig" style={{ maxHeight: "70px", maxWidth: "300px", objectFit: "contain" }} />
                            ) : (
                              <span className="esign-typed-sig" style={{ fontFamily: "'Dancing Script', 'Great Vibes', cursive, sans-serif" }}>
                                {doc.signature_value}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {/* Audit Trail View */}
              {detailTab === "audit" && (
                <div className="esign-audit-timeline">
                  {selectedPackage.events?.length === 0 ? (
                    <p>No audit events recorded yet.</p>
                  ) : (
                    selectedPackage.events?.map((evt) => (
                      <div key={evt.id} className="esign-audit-item">
                        <div className="esign-audit-head">
                          <span className="esign-audit-type">{evt.event_type}</span>
                          <span className="esign-audit-time">
                            {new Date(evt.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="esign-audit-meta">
                          Actor: <strong>{evt.actor_type}</strong> (ID: {evt.actor_user_id || "Candidate"}) · IP: {evt.ip_address || "N/A"}
                        </div>
                        <div className="esign-audit-hash">
                          HMAC Hash: <code>{evt.event_hash}</code>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </main>
  );
}
