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
            $withBreaks = preg_replace('/<\/li>/i', "\n", $withBreaks);
            $clean = strip_tags($withBreaks);
            $clean = preg_replace('/[ \t]+/', ' ', $clean);
            $clean = preg_replace('/\n\s*\n\s*\n+/', "\n\n", $clean);
            return trim($clean);
        };

        $cleanMessage = $cleanText($notification->message);
        $cleanComment = !empty($notification->changes['comment_text']) ? $cleanText($notification->changes['comment_text']) : null;
        $cleanEntityDesc = ($entity && !empty($entity->description)) ? $cleanText($entity->description) : null;

        $colors = [
            'task' => ['#eff6ff', '#2563eb', 'Task'],
            'deliverable' => ['#f0fdf4', '#16a34a', 'Deliverable'],
            'project' => ['#fefce8', '#ca8a04', 'Project'],
            'team' => ['#f0f9ff', '#0284c7', 'Team'],
            'system' => ['#f5f3ff', '#7c3aed', 'System'],
        ];
        $module = $notification->related_module ?? 'system';
        $badge = $colors[$module] ?? $colors['system'];

        $statusColors = [
            'pending' => ['#fefce8', '#ca8a04'],
            'in_progress' => ['#eff6ff', '#2563eb'],
            'submitted' => ['#f5f3ff', '#7c3aed'],
            'completed' => ['#f0fdf4', '#16a34a'],
            'approved' => ['#f0fdf4', '#16a34a'],
            'rejected' => ['#fef2f2', '#dc2626'],
            'reopened' => ['#fff7ed', '#ea580c'],
            'active' => ['#f0fdf4', '#16a34a'],
            'overdue' => ['#fef2f2', '#dc2626'],
        ];
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
                        <td style="background-color:#ffffff;padding:28px 34px 20px;border-bottom:2px solid #2563eb;font-family:Arial,Helvetica,sans-serif;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                <tr>
                                    <td style="font-family:Arial,Helvetica,sans-serif;">
                                        <h1 style="color:#0f172a;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;font-family:Arial,Helvetica,sans-serif;">TechXaro <span style="color:#2563eb;font-family:Arial,Helvetica,sans-serif;">PMS</span></h1>
                                        <p style="color:#64748b;margin:4px 0 0;font-size:12px;font-weight:500;font-family:Arial,Helvetica,sans-serif;">Project Management System</p>
                                    </td>
                                    <td align="right" style="font-family:Arial,Helvetica,sans-serif;">
                                        <span style="display:inline-block;background-color:{{ $badge[0] }};color:{{ $badge[1] }};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:5px 12px;border-radius:16px;border:1px solid {{ $badge[1] }}33;font-family:Arial,Helvetica,sans-serif;">{{ $badge[2] }}</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding:28px 34px 0;font-family:Arial,Helvetica,sans-serif;">
                            <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;">Dear <strong style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;">{{ $notification->user->name }}</strong>,</p>

                            @if ($notification->title)
                                <h2 style="color:#0f172a;font-size:18px;font-weight:700;margin:12px 0 16px;padding:0;font-family:Arial,Helvetica,sans-serif;">{{ $notification->title }}</h2>
                            @endif

                            <!-- Natural Description Text (No Container Box) -->
                            @if (!empty($cleanMessage))
                                <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0 20px;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">{!! $cleanMessage !!}</p>
                            @endif

                            <!-- Comment Block (Styled Card - Uniform Borders) -->
                            @if (!empty($cleanComment))
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:16px 0 20px;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                    <tr>
                                        <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;">
                                            <p style="color:#2563eb;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;">
                                                💬 Comment from {{ $notification->changes['comment_by'] ?? ($notification->sender->name ?? 'User') }}:
                                            </p>
                                            <p style="color:#1e293b;font-size:14px;line-height:1.6;font-style:italic;margin:0;font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;">"{!! $cleanComment !!}"</p>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            {{-- Changes Table --}}
                            @if ($notification->changes && count($notification->changes) > 0 && empty($notification->changes['comment_text']))
                                @php
                                    $isFieldChanges = isset($notification->changes[0]) && (is_array($notification->changes[0])) && (isset($notification->changes[0]['field']) || isset($notification->changes[0]['field_name']));
                                @endphp
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                    <tr>
                                        <td style="background-color:#f8fafc;padding:12px 20px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
                                            <span style="color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">
                                                @if ($module === 'task') Task Changes
                                                @elseif ($module === 'project') Project Changes
                                                @elseif ($module === 'deliverable') Deliverable Changes
                                                @elseif ($module === 'team') Team Details
                                                @else Changes Made
                                                @endif
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;">
                                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                                                @if ($isFieldChanges)
                                                    <tr>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f8fafc;border-bottom:2px solid #e5e7eb;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Field</th>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f8fafc;border-bottom:2px solid #e5e7eb;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Previous Value</th>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f8fafc;border-bottom:2px solid #e5e7eb;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">New Value</th>
                                                    </tr>
                                                    @foreach ($notification->changes as $change)
                                                        <tr>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{ $change['field'] ?? ucwords(str_replace('_', ' ', $change['field_name'] ?? '')) }}</td>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-family:Arial,Helvetica,sans-serif;">
                                                                @if (!empty($change['old']))
                                                                    <span style="display:inline-block;background-color:#fef2f2;color:#dc2626;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;text-decoration:line-through;font-family:Arial,Helvetica,sans-serif;">{{ $cleanText($change['old']) }}</span>
                                                                @else
                                                                    <span style="color:#94a3b8;font-size:12px;font-style:italic;font-family:Arial,Helvetica,sans-serif;">—</span>
                                                                @endif
                                                            </td>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-family:Arial,Helvetica,sans-serif;">
                                                                @if (!empty($change['new']))
                                                                    <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;font-family:Arial,Helvetica,sans-serif;">{{ $cleanText($change['new']) }}</span>
                                                                @else
                                                                    <span style="color:#94a3b8;font-size:12px;font-style:italic;font-family:Arial,Helvetica,sans-serif;">—</span>
                                                                @endif
                                                            </td>
                                                        </tr>
                                                    @endforeach
                                                @else
                                                    <tr>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f8fafc;border-bottom:2px solid #e5e7eb;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Detail</th>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f8fafc;border-bottom:2px solid #e5e7eb;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">Value</th>
                                                    </tr>
                                                    @foreach ($notification->changes as $key => $value)
                                                        <tr>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#334155;font-size:13px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{ ucwords(str_replace('_', ' ', $key)) }}</td>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:13px;font-family:Arial,Helvetica,sans-serif;">
                                                                @if (is_array($value))
                                                                    {{ implode(', ', array_map(fn($v) => is_array($v) ? ($v['name'] ?? json_encode($v)) : $cleanText($v), $value)) }}
                                                                @else
                                                                    {{ $cleanText($value) }}
                                                                @endif
                                                            </td>
                                                        </tr>
                                                    @endforeach
                                                @endif
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            {{-- Entity Details Card (Light Theme Data Table) --}}
                            @if ($entity)
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                    <tr>
                                        <td style="background-color:#f8fafc;padding:12px 20px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">
                                            <span style="color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;">
                                                @if ($module === 'task') Task Details
                                                @elseif ($module === 'project') Project Details
                                                @elseif ($module === 'deliverable') Deliverable Details
                                                @elseif ($module === 'team') Team Details
                                                @endif
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;">
                                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                                {{-- Title / Name --}}
                                                <tr>
                                                    <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;width:140px;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">Name</td>
                                                    <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">
                                                        @if (!empty($entityUrl))
                                                            <a href="{{ $entityUrl }}" style="color:#2563eb;text-decoration:underline;font-weight:700;font-family:Arial,Helvetica,sans-serif;">{{ $entity->title ?? $entity->name ?? '' }}</a>
                                                        @else
                                                            {{ $entity->title ?? $entity->name ?? '' }}
                                                        @endif
                                                    </td>
                                                </tr>

                                                {{-- Business Code --}}
                                                @if ($module === 'task' && $entity->business_id)
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Task ID</td>
                                                        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;">
                                                            <span style="display:inline-block;background-color:#eff6ff;color:#2563eb;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">{{ $entity->business_id }}</span>
                                                        </td>
                                                    </tr>
                                                @endif
                                                @if ($module === 'project' && $entity->business_id)
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Project ID</td>
                                                        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;">
                                                            <span style="display:inline-block;background-color:#fefce8;color:#ca8a04;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">{{ $entity->business_id }}</span>
                                                        </td>
                                                    </tr>
                                                @endif
                                                @if ($module === 'deliverable' && $entity->business_id)
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Subtask ID</td>
                                                        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;">
                                                            <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">{{ $entity->business_id }}</span>
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Description --}}
                                                @if (!empty($cleanEntityDesc))
                                                    <tr>
                                                        <td style="padding:8px 0;color:#64748b;font-size:12px;font-weight:700;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">Description</td>
                                                        <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;">
                                                            <p style="color:#334155;font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">{!! \Illuminate\Support\Str::limit($cleanEntityDesc, 400) !!}</p>
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Project --}}
                                                @if ($entity->project)
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Project</td>
                                                        <td style="padding:6px 0;color:#2563eb;font-size:13px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">
                                                            @if (!empty($projectUrl))
                                                                <a href="{{ $projectUrl }}" style="color:#2563eb;text-decoration:underline;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{{ $entity->project->title }}</a>
                                                            @else
                                                                {{ $entity->project->title }}
                                                            @endif
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Status --}}
                                                @if ($entity->status)
                                                    @php
                                                        $sc = $statusColors[$entity->status] ?? ['#f1f5f9', '#475569'];
                                                    @endphp
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Status</td>
                                                        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;">
                                                            <span style="display:inline-block;background-color:{{ $sc[0] }};color:{{ $sc[1] }};font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;text-transform:capitalize;font-family:Arial,Helvetica,sans-serif;">{{ str_replace('_', ' ', $entity->status) }}</span>
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Priority --}}
                                                @if ($entity->priority)
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Priority</td>
                                                        <td style="padding:6px 0;color:#0f172a;font-size:13px;text-transform:capitalize;font-family:Arial,Helvetica,sans-serif;">{{ $entity->priority }}</td>
                                                    </tr>
                                                @endif

                                                {{-- Timeline --}}
                                                @if ($entity->start_date || $entity->end_date || $entity->due_date)
                                                    @php
                                                        $tz = $recipientTimezone ?? ($notification->user?->timezone ?: 'UTC');
                                                    @endphp
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Timeline</td>
                                                        <td style="padding:6px 0;color:#0f172a;font-size:13px;font-family:Arial,Helvetica,sans-serif;">
                                                            @if ($entity->start_date)
                                                                {{ \Carbon\Carbon::parse($entity->start_date)->setTimezone($tz)->format('d M Y, g:i A') }}
                                                            @endif
                                                            @if ($entity->start_date && ($entity->end_date || $entity->due_date))
                                                                &rarr;
                                                            @endif
                                                            @if ($entity->end_date)
                                                                {{ \Carbon\Carbon::parse($entity->end_date)->setTimezone($tz)->format('d M Y, g:i A') }}
                                                            @elseif ($entity->due_date)
                                                                {{ \Carbon\Carbon::parse($entity->due_date)->setTimezone($tz)->format('d M Y, g:i A') }}
                                                            @endif
                                                            <span style="font-size:11px;color:#64748b;margin-left:4px;">({{ $tz }})</span>
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Assigned To --}}
                                                @if ($module === 'task' && $entity->assignees && $entity->assignees->count())
                                                    <tr>
                                                        <td style="padding:6px 0;color:#64748b;font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">Assigned To</td>
                                                        <td style="padding:6px 0;color:#0f172a;font-size:13px;font-family:Arial,Helvetica,sans-serif;">{{ $entity->assignees->pluck('name')->implode(', ') }}</td>
                                                    </tr>
                                                @endif
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            {{-- CTA Button --}}
                            @if (!empty($entityUrl))
                                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;">
                                    <tr>
                                        <td align="center" style="font-family:Arial,Helvetica,sans-serif;">
                                            <a href="{{ $entityUrl }}"
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
