<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 30px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">TechXaro PMS</h1>
                            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Project Management System</p>
                        </td>
                    </tr>

                    <!-- Badge -->
                    <tr>
                        <td style="padding:28px 34px 0;">
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background-color:#f0fdf4;border:1px solid #16a34a22;border-radius:20px;padding:5px 14px;">
                                        <span style="color:#16a34a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">New Deliverable Added</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{{ $userName }}</strong>,</p>

                            <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0 20px;">A new deliverable has been added to one of your assigned {{ $contextType }}.</p>

                            <!-- Details Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                <tr>
                                    <td style="background-color:#f0fdf4;padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                        <span style="color:#16a34a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">Deliverable Details</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 20px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            @if ($projectName)
                                                <tr>
                                                    <td style="padding:6px 0;color:#6b7280;font-size:12px;font-weight:600;width:140px;vertical-align:top;">Project</td>
                                                    <td style="padding:6px 0;color:#2563eb;font-size:13px;font-weight:600;">{{ $projectName }}</td>
                                                </tr>
                                            @endif
                                            @if ($taskName)
                                                <tr>
                                                    <td style="padding:6px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Task</td>
                                                    <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">{{ $taskName }}</td>
                                                </tr>
                                            @endif
                                            <tr>
                                                <td style="padding:6px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">New Deliverable</td>
                                                <td style="padding:6px 0;">
                                                    <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:13px;font-weight:700;padding:3px 12px;border-radius:6px;">{{ $deliverableName }}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Added By</td>
                                                <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">{{ $addedByName }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Date &amp; Time</td>
                                                <td style="padding:6px 0;color:#111827;font-size:13px;">{{ $addedAt }}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            @if ($deliverableDescription)
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;margin:0 0 20px;">
                                    <tr>
                                        <td style="padding:14px 18px;">
                                            <p style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Description</p>
                                            <p style="color:#374151;font-size:13px;line-height:1.6;margin:0;">{{ \Illuminate\Support\Str::limit(strip_tags($deliverableDescription), 300) }}</p>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px;">Please log in to the PMS to view the complete details.</p>

                            @if ($loginUrl)
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{{ $loginUrl }}"
                                               style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                                                View in PMS &rarr;
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px;">This is an automated notification from TechXaro PMS. Please do not reply to this email.</p>
                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="padding:24px 34px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e5e7eb;"></td></tr></table>
                        </td>
                    </tr>

                    <!-- Signature -->
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">With Regards,<br><strong style="color:#111827;">TechXaro Pvt. Ltd.</strong><br>
                            <a href="https://www.techxaro.com" style="color:#2563eb;text-decoration:none;">www.techxaro.com</a></p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#f9fafb;padding:18px 34px;text-align:center;border-top:1px solid #e5e7eb;margin-top:20px;">
                            <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; {{ date('Y') }} TechXaro Pvt. Ltd. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
