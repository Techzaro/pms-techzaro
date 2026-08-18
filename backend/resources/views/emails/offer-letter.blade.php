<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Official Job Offer — TechXaro Pvt. Ltd.</title>
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
        .expiry-value { color: #dc2626; font-weight: 700; }
        .btn-box { text-align: center; margin: 32px 0 20px; }
        .btn { display: inline-block; background: #0082ff; color: #ffffff !important; font-weight: 700; font-size: 15px; padding: 15px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 6px 18px rgba(0, 130, 255, 0.3); }
        .warning-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #991b1b; text-align: center; font-weight: 600; margin-top: 20px; }
        .signatory-box { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 13.5px; color: #475569; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="brand-header">
            <div class="brand-logo-text">TECHXARO</div>
            <div class="brand-sub">Talent Acquisition &amp; Human Resources</div>
        </div>
        <div class="content">
            <div class="greeting">Congratulations, {{ $offer->candidate_name }}!</div>
            <p class="intro-text">
                We are delighted to extend an official offer of employment for the position of <strong>{{ $offer->job_title }}</strong> at <strong>TechXaro Pvt. Ltd.</strong> We were extremely impressed by your qualifications and interview performance.
            </p>

            <div class="details-card">
                <div class="details-row">
                    <span class="label">Position Title:</span>
                    <span class="value">{{ $offer->job_title }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Department:</span>
                    <span class="value">{{ $offer->department }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Employment Type:</span>
                    <span class="value">{{ $offer->employment_type }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Location:</span>
                    <span class="value">Lahore, Pakistan</span>
                </div>
                <div class="details-row">
                    <span class="label">Proposed Start Date:</span>
                    <span class="value">{{ date('F j, Y', strtotime($offer->start_date)) }}</span>
                </div>
                <div class="details-row">
                    <span class="label">Offer Expiry Date:</span>
                    <span class="expiry-value">{{ date('F j, Y', strtotime($offer->expiry_date)) }}</span>
                </div>
            </div>

            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                Please click the link below to review your full contract, company policies, benefits, and log your digital signature online.
            </p>

            <div class="btn-box">
                <a href="{{ $portalUrl }}" class="btn" target="_blank">Review &amp; Digitally Sign Offer Letter</a>
            </div>

            <div class="warning-banner">
                ⚠️ Notice: This offer letter expires on {{ date('F j, Y', strtotime($offer->expiry_date)) }}.
            </div>

            <div class="signatory-box">
                <strong>Muhammad Ahsan</strong><br>
                <span>Head of People Operations | TechXaro Pvt. Ltd.</span><br>
                <small>Email: hr@techxaro.com | Phone: +923119121134</small>
            </div>
        </div>

        <div class="footer">
            <p>© {{ date('Y') }} TechXaro Pvt. Ltd. Lahore, Pakistan.</p>
            <p>Confidential Notice: This email is intended solely for {{ $offer->candidate_name }}.</p>
        </div>
    </div>
</body>
</html>
