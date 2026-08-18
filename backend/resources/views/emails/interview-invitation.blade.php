<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interview Schedule Invitation — TechXaro Pvt. Ltd.</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 30px 15px; }
        .container { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #cbd5e1; }
        .brand-header { background: #ffffff; padding: 28px; text-align: center; border-bottom: 3px solid #0082ff; }
        .brand-logo-text { color: #0082ff; font-size: 32px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; margin: 0; font-family: Arial, Helvetica, sans-serif; }
        .brand-sub { color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 6px; }
        .content { padding: 32px 28px; }
        .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        .intro-text { font-size: 14.5px; line-height: 1.6; color: #334155; margin-bottom: 24px; }
        .details-card { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0082ff; border-radius: 12px; padding: 20px; margin: 24px 0; }
        .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
        .details-row:last-child { border-bottom: none; }
        .label { color: #64748b; font-weight: 500; }
        .value { color: #0f172a; font-weight: 700; }
        .msg-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin: 20px 0; font-size: 14px; line-height: 1.6; color: #334155; }
        .signatory-box { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13.5px; color: #475569; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="brand-header">
            <div class="brand-logo-text">TECHXARO</div>
            <div class="brand-sub">Talent Acquisition Operations</div>
        </div>
        <div class="content">
            <div class="greeting">Dear {{ $candidate->name }},</div>
            <p class="intro-text">
                Thank you for applying to <strong>TechXaro Pvt. Ltd.</strong> We are pleased to invite you for an interview as part of our recruitment process. Below are your scheduled interview details:
            </p>

            <div class="details-card">
                <div class="details-row">
                    <span class="label">Candidate Name:</span>
                    <span class="value">{{ $candidate->name }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Scheduled Date:</span>
                    <span class="value">{{ date('F j, Y', strtotime($interviewDate)) }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Scheduled Time:</span>
                    <span class="value">{{ $interviewTime }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Location:</span>
                    <span class="value">Lahore, Pakistan</span>
                </div>
            </div>

            @if($notes)
            <div class="msg-box">
                <strong style="color: #0f172a; display: block; margin-bottom: 8px;">Interview Instructions &amp; Details:</strong>
                <p style="margin: 0; white-space: pre-line;">{{ $notes }}</p>
            </div>
            @endif

            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                Please reply to this email to confirm your attendance. If you need to request a schedule adjustment, feel free to inform us as soon as possible.
            </p>

            <div class="signatory-box">
                <strong>Muhammad Ahsan</strong><br>
                <span>Head of People Operations | TechXaro Pvt. Ltd.</span><br>
                <small>Email: hr@techxaro.com | Phone: +923119121134</small>
            </div>
        </div>

        <div class="footer">
            <p>© {{ date('Y') }} TechXaro Pvt. Ltd. Lahore, Pakistan.</p>
        </div>
    </div>
</body>
</html>
