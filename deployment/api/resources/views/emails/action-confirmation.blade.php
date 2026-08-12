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

                    <!-- Success Badge -->
                    <tr>
                        <td style="padding:28px 34px 0;">
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background-color:#f0fdf4;border:1px solid #16a34a22;border-radius:20px;padding:5px 14px;">
                                        <span style="color:#16a34a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">&#10003; Action Confirmed</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{{ $performerName }}</strong>,</p>

                            @php
                                $actionMap = [
                                    'Created' => 'You have successfully created',
                                    'Created & Assigned' => 'You have successfully created and assigned',
                                    'Updated' => 'You have successfully updated',
                                    'Updated Visibility' => 'You have successfully updated visibility for',
                                    'Deleted' => 'You have successfully deleted',
                                    'Assigned' => 'You have successfully assigned',
                                    'Submitted' => 'You have successfully submitted',
                                    'Resubmitted' => 'You have successfully resubmitted',
                                    'Approved' => 'You have successfully approved',
                                    'Rejected' => 'You have successfully rejected',
                                    'Reopened' => 'You have successfully reopened',
                                    'Completed' => 'You have successfully completed',
                                    'Cancelled' => 'You have successfully cancelled',
                                ];
                                $verb = $actionMap[$actionVerb] ?? 'You have successfully ' . strtolower($actionVerb);
                            @endphp

                            <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0 20px;">{{ $verb }} {{ $entityType }}: <strong style="color:#111827;">{{ $entityName }}</strong></p>

                            <!-- Action Summary Card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:20px;">
                                <tr>
                                    <td style="padding:18px 24px;">
                                        <p style="color:#166534;font-size:15px;font-weight:700;margin:0 0 4px;">&#10003; {{ $actionVerb }}</p>
                                        <p style="color:#166534;font-size:14px;margin:0;">{{ $entityType }}: <strong>{{ $entityName }}</strong></p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Details Table -->
                            @if (count($details) > 0)
                                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                    <tr>
                                        <td style="background-color:#f9fafb;padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                            <span style="color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">Action Details</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:16px 20px;">
                                            <table width="100%" cellpadding="0" cellspacing="0">
                                                @foreach ($details as $label => $value)
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:12px;font-weight:600;width:140px;vertical-align:top;">{{ $label }}</td>
                                                        <td style="padding:6px 0;color:#111827;font-size:13px;">{{ $value }}</td>
                                                    </tr>
                                                @endforeach
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 24px;">This is a confirmation email from TechXaro PMS for the action you performed.</p>

                            @if ($loginUrl)
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{{ $loginUrl }}"
                                               style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                                                Open PMS &rarr;
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px;">This is an automated confirmation email from TechXaro PMS. Please do not reply to this email.</p>
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
