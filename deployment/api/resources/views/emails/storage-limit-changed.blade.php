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
                    <tr>
                        <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 30px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">TechXaro PMS</h1>
                            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Project Management System</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 34px 0;">
                            @php
                                $color = $action === 'increased' ? ['#f0fdf4', '#16a34a'] : ['#fef2f2', '#dc2626'];
                            @endphp
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background-color:{{ $color[0] }};border:1px solid {{ $color[1] }}22;border-radius:20px;padding:5px 14px;">
                                        <span style="color:{{ $color[1] }};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Storage {{ ucfirst($action) }}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">Organization Admin</strong>,</p>

                            <h2 style="color:#111827;font-size:18px;font-weight:700;margin:16px 0 12px;padding:0;">Your Storage Limit Has Been {{ ucfirst($action) }}</h2>

                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:{{ $color[0] }};border-left:4px solid {{ $color[1] }};border-radius:0 8px 8px 0;margin:16px 0 20px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">
                                            Your organization <strong>{{ $org_name }}</strong> storage limit has been {{ $action }} by <strong>{{ $admin_name }}</strong>.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                <tr>
                                    <td style="background-color:#f9fafb;padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                        <span style="color:#2563eb;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">Storage Update</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 20px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;width:150px;">Organization</td>
                                                <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">{{ $org_name }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Previous Limit</td>
                                                <td style="padding:5px 0;color:#dc2626;font-size:13px;font-weight:600;text-decoration:line-through;">{{ $old_limit }} GB</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">New Limit</td>
                                                <td style="padding:5px 0;color:#16a34a;font-size:13px;font-weight:700;">{{ $new_limit }} GB</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Changed By</td>
                                                <td style="padding:5px 0;color:#111827;font-size:13px;">{{ $admin_name }}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                    <td align="center">
                                        <a href="{{ $frontend_url }}/{{ $super_admin_tenant ?? 'techxaro' }}/storage"
                                           style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                                            View Storage &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px;">This is an automated notification from TechXaro PMS.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 34px 0;">
                            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e5e7eb;"></td></tr></table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">With Regards,<br><strong style="color:#111827;">TechXaro Pvt. Ltd.</strong></p>
                        </td>
                    </tr>
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
