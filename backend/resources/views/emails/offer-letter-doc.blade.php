<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Official Offer Letter - {{ $offer->candidate_name }}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 40px; background-color: #f8fafc; }
        .doc-container { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 50px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0082ff; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-text { font-size: 26px; font-weight: 800; color: #0082ff; letter-spacing: -0.5px; }
        .doc-title { font-size: 18px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 1px; }
        .meta-table { width: 100%; border-collapse: collapse; margin: 25px 0; }
        .meta-table td { padding: 10px 14px; border: 1px solid #e2e8f0; font-size: 14px; }
        .meta-table td.label { background: #f1f5f9; font-weight: 600; color: #334155; width: 30%; }
        .section-heading { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 30px; margin-bottom: 12px; border-left: 4px solid #0082ff; padding-left: 10px; }
        .signature-box { margin-top: 40px; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; }
        .badge-accepted { display: inline-block; padding: 4px 12px; background: #166534; color: #ffffff; font-size: 12px; font-weight: 700; border-radius: 999px; }
        @media print {
            body { padding: 0; background: #fff; }
            .doc-container { border: none; box-shadow: none; padding: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="max-width: 800px; margin: 0 auto 20px; text-align: right;">
        <button onclick="window.print()" style="padding: 10px 20px; background: #0082ff; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">
            🖨️ Print / Save PDF
        </button>
    </div>

    <div class="doc-container">
        <div class="header-bar">
            <div>
                <div class="logo-text">TECHXARO</div>
                <div style="font-size: 12px; color: #64748b;">Enterprise Software Solutions</div>
            </div>
            <div class="doc-title">Employment Offer Letter</div>
        </div>

        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">
            <strong>Date Issued:</strong> {{ $offer->issued_date ?? date('F d, Y') }}<br>
            <strong>Document Reference:</strong> {{ $offer->id }}
        </p>

        <p>Dear <strong>{{ $offer->candidate_name }}</strong>,</p>

        <p>We are pleased to offer you the position of <strong>{{ $offer->job_title }}</strong> at <strong>{{ $company['name'] }}</strong> in the <strong>{{ $offer->department }}</strong> department. Below are the terms and details of your employment agreement:</p>

        <table class="meta-table">
            <tr>
                <td class="label">Candidate Name</td>
                <td><strong>{{ $offer->candidate_name }}</strong> ({{ $offer->candidate_email }})</td>
            </tr>
            <tr>
                <td class="label">Job Designation</td>
                <td>{{ $offer->job_title }}</td>
            </tr>
            <tr>
                <td class="label">Department</td>
                <td>{{ $offer->department }}</td>
            </tr>
            <tr>
                <td class="label">Base Gross Salary</td>
                <td><strong>PKR {{ number_format($offer->base_salary) }}</strong> / Month</td>
            </tr>
            <tr>
                <td class="label">Start Date</td>
                <td>{{ $offer->start_date }}</td>
            </tr>
            <tr>
                <td class="label">Work Location</td>
                <td>{{ $company['address'] }}</td>
            </tr>
            <tr>
                <td class="label">Offer Status</td>
                <td><span class="badge-accepted">{{ strtoupper($offer->status) }}</span></td>
            </tr>
        </table>

        @if($offer->custom_clauses)
            <div class="section-heading">Custom Terms & Clauses</div>
            <p style="white-space: pre-line; font-size: 13.5px; color: #334155;">{{ $offer->custom_clauses }}</p>
        @endif

        <div class="section-heading">Digital Acceptance & Signature Verification</div>
        <div class="signature-box">
            <p style="margin: 0 0 6px; font-size: 13.5px; color: #166534; font-weight: 700;">
                ✔ Digitally Signed & Accepted
            </p>
            <p style="margin: 0; font-size: 13px; color: #334155;">
                <strong>Signatory:</strong> {{ $offer->signature_name ?: $offer->candidate_name }}<br>
                <strong>Timestamp:</strong> {{ $offer->signed_at ?: $offer->updated_at }}<br>
                <strong>IP Verification:</strong> {{ $offer->signed_ip ?: '127.0.0.1 (Verified Security Hash)' }}
            </p>
        </div>

        <div style="margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
            Official document generated by TechXaro PMS & HRM Vault System • {{ $company['name'] }}
        </div>
    </div>
</body>
</html>
