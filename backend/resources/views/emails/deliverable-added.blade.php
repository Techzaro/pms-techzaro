<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!--[if mso]>
    <style type="text/css">
      table, td, th, p, a, h1, h2, h3, span, strong, div { font-family: Arial, Helvetica, sans-serif !important; }
    </style>
    <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    @php
        $cleanText = function ($text) {
            if (empty($text)) return '';
            $decoded = html_entity_decode((string) $text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $decoded = html_entity_decode($decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $decoded = str_replace(['&nbsp;', "\xc2\xa0", "\u{00A0}"], ' ', $decoded);
            $withBreaks = preg_replace('/<br\s*\/?>/i', "\n", $decoded);
            $withBreaks = preg_replace('/<\/p>/i', "\n\n", $withBreaks);
            $withBreaks = preg_replace('/<\/div>/i', "\n", $withBreaks);
            $clean = strip_tags($withBreaks);
            $clean = preg_replace('/[ \t]+/', ' ', $clean);
            $clean = preg_replace('/\n\s*\n\s*\n+/', "\n\n", $clean);
            return trim($clean);
        };

        $cleanDesc = !empty($deliverableDescription) ? $cleanText($deliverableDescription) : null;
        $cleanProjectName = $cleanText($projectName);
        $cleanTaskName = $cleanText($taskName);
        $cleanDeliverableName = $cleanText($deliverableName);
    @endphp

    <!-- Outer Wrapper -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:40px 0;width:100%;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
        <tr>
            <td align="center" style="font-family:Arial,Helvetica,sans-serif;">
                <!--[if mso]>
                <table width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="width:600px;">
                <tr>
                <td width="600" align="center" valign="top">
                <![endif]-->
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.04);mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;margin:0 auto;">

                    <!-- Brand Header -->
                    <tr>
                        <td style="background-color:#ffffff;padding:28px 34px 20px;border-bottom:2px solid #16a34a;font-family:Arial,Helvetica,sans-serif;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                <tr>
                                    <td style="font-family:Arial,Helvetica,sans-serif;">
                                        <h1 style="color:#0f172a;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;font-family:Arial,Helvetica,sans-serif;">TechXaro <span style="color:#16a34a;font-family:Arial,Helvetica,sans-serif;">PMS</span></h1>
                                        <p style="color:#64748b;margin:4px 0 0;font-size:12px;font-weight:500;font-family:Arial,Helvetica,sans-serif;">Project Management System</p>
                                    </td>
                                    <td align="right" style="font-family:Arial,Helvetica,sans-serif;">
                                        <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:5px 12px;border-radius:16px;border:1px solid #16a34a33;font-family:Arial,Helvetica,sans-serif;">New Deliverable</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding:28px 34px 0;font-family:Arial,Helvetica,sans-serif;">
                            <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">Dear <strong style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;">{{ $userName }}</strong>,</p>

                            <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0 20px;font-family:Arial,Helvetica,sans-serif;">A new deliverable has been added to one of your assigned {{ $contextType }}.</p>

                            <!-- Deliverable Details Data Table -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                <tr>
                                    <td style="background-color:#f8fafc;padding:12px 20px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
                                        <span style="color:#16a34a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Deliverable Details</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;">
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                            @if ($cleanProjectName)
                                                <tr>
                                                    <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;width:140px;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">Project</td>
                                                    <td style="padding:6px 0;color:#2563eb;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">
                                                        @if (!empty($projectUrl))
                                                            <a href="{{ $projectUrl }}" style="color:#2563eb;text-decoration:underline;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{ $cleanProjectName }}</a>
                                                        @else
                                                            {{ $cleanProjectName }}
                                                        @endif
                                                    </td>
                                                </tr>
                                            @endif
                                            @if ($cleanTaskName)
                                                <tr>
                                                    <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">Task</td>
                                                    <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">
                                                        @if (!empty($taskUrl))
                                                            <a href="{{ $taskUrl }}" style="color:#2563eb;text-decoration:underline;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{ $cleanTaskName }}</a>
                                                        @else
                                                            {{ $cleanTaskName }}
                                                        @endif
                                                    </td>
                                                </tr>
                                            @endif
                                            <tr>
                                                <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">New Deliverable</td>
                                                <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;">
                                                    @if (!empty($deliverableUrl))
                                                        <a href="{{ $deliverableUrl }}" style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:13px;font-weight:700;padding:3px 12px;border-radius:6px;text-decoration:underline;font-family:Arial,Helvetica,sans-serif;">{{ $cleanDeliverableName }}</a>
                                                    @else
                                                        <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:13px;font-weight:700;padding:3px 12px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">{{ $cleanDeliverableName }}</span>
                                                    @endif
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">Added By</td>
                                                <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{ $addedByName }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">Date &amp; Time</td>
                                                <td style="padding:6px 0;color:#0f172a;font-size:13px;font-family:Arial,Helvetica,sans-serif;">{{ $addedAt }}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            @if (!empty($cleanDesc))
                                <p style="color:#334155;font-size:13px;line-height:1.7;margin:0 0 20px;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">{!! \Illuminate\Support\Str::limit($cleanDesc, 400) !!}</p>
                            @endif

                            @if ($loginUrl)
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                    <tr>
                                        <td align="center" style="font-family:Arial,Helvetica,sans-serif;">
                                            <a href="{{ $loginUrl }}"
                                               style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.3px;font-family:Arial,Helvetica,sans-serif;box-shadow:0 2px 6px rgba(37,99,235,0.25);">
                                                View in PMS &rarr;
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;">This is an automated notification from TechXaro PMS. Please do not reply directly to this email.</p>
                        </td>
                    </tr>

                    <!-- Divider -->
                    <tr>
                        <td style="padding:20px 34px 0;font-family:Arial,Helvetica,sans-serif;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;"><tr><td style="border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;"></td></tr></table>
                        </td>
                    </tr>

                    <!-- Signature & Footer -->
                    <tr>
                        <td style="padding:20px 34px 24px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                <tr>
                                    <td style="font-family:Arial,Helvetica,sans-serif;">
                                        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;font-family:Arial,Helvetica,sans-serif;">With Regards,<br><strong style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;">TechXaro Pvt. Ltd.</strong><br>
                                        <a href="https://www.techxaro.com" style="color:#2563eb;text-decoration:none;font-weight:600;font-family:Arial,Helvetica,sans-serif;">www.techxaro.com</a></p>
                                    </td>
                                    <td align="right" style="vertical-align:bottom;font-family:Arial,Helvetica,sans-serif;">
                                        <p style="color:#94a3b8;font-size:11px;margin:0;font-family:Arial,Helvetica,sans-serif;">&copy; {{ date('Y') }} TechXaro Pvt. Ltd.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
                <!--[if mso]>
                </td>
                </tr>
                </table>
                <![endif]-->
            </td>
        </tr>
    </table>
</body>
</html>
