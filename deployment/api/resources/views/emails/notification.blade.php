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

                    <!-- Notification Badge -->
                    <tr>
                        <td style="padding:28px 34px 0;">
                            @php
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
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background-color:{{ $badge[0] }};border:1px solid {{ $badge[1] }}22;border-radius:20px;padding:5px 14px;">
                                        <span style="color:{{ $badge[1] }};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">{{ $badge[2] }} Notification</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{{ $notification->user->name }}</strong>,</p>

                            @if ($notification->title)
                                <h2 style="color:#111827;font-size:18px;font-weight:700;margin:16px 0 12px;padding:0;">{{ $notification->title }}</h2>
                            @endif

                            <!-- Message Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-left:4px solid {{ $badge[1] }};border-radius:0 8px 8px 0;margin:16px 0 20px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">{{ $notification->message }}</p>
                                    </td>
                                </tr>
                            </table>

                            {{-- Updated Changes Table --}}
                            @if ($notification->changes && count($notification->changes) > 0)
                                @php
                                    $isFieldChanges = isset($notification->changes[0]) && (is_array($notification->changes[0])) && (isset($notification->changes[0]['field']) || isset($notification->changes[0]['field_name']));
                                @endphp
                                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                    <tr>
                                        <td style="background-color:{{ $badge[0] }};padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                            <span style="color:{{ $badge[1] }};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">
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
                                        <td style="padding:16px 20px;">
                                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                @if ($isFieldChanges)
                                                    <tr>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Field</th>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Previous Value</th>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">New Value</th>
                                                    </tr>
                                                    @foreach ($notification->changes as $change)
                                                        <tr>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;font-weight:600;">{{ $change['field'] ?? ucwords(str_replace('_', ' ', $change['field_name'] ?? '')) }}</td>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
                                                                @if (!empty($change['old']))
                                                                    <span style="display:inline-block;background-color:#fef2f2;color:#dc2626;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;text-decoration:line-through;">{{ $change['old'] }}</span>
                                                                @else
                                                                    <span style="color:#9ca3af;font-size:12px;font-style:italic;">—</span>
                                                                @endif
                                                            </td>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
                                                                @if (!empty($change['new']))
                                                                    <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;">{{ $change['new'] }}</span>
                                                                @else
                                                                    <span style="color:#9ca3af;font-size:12px;font-style:italic;">—</span>
                                                                @endif
                                                            </td>
                                                        </tr>
                                                    @endforeach
                                                @else
                                                    <tr>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Detail</th>
                                                        <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Value</th>
                                                    </tr>
                                                    @foreach ($notification->changes as $key => $value)
                                                        <tr>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;font-weight:600;">{{ ucwords(str_replace('_', ' ', $key)) }}</td>
                                                            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#111827;font-size:13px;">
                                                                @if (is_array($value))
                                                                    {{ implode(', ', array_map(fn($v) => is_array($v) ? ($v['name'] ?? json_encode($v)) : $v, $value)) }}
                                                                @else
                                                                    {{ $value }}
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

                            {{-- Entity Details Card --}}
                            @if ($entity)
                                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                    <tr>
                                        <td style="background-color:{{ $badge[0] }};padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                            <span style="color:{{ $badge[1] }};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">
                                                @if ($module === 'task') Task Details
                                                @elseif ($module === 'project') Project Details
                                                @elseif ($module === 'deliverable') Deliverable Details
                                                @elseif ($module === 'team') Team Details
                                                @endif
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:16px 20px;">
                                            <table width="100%" cellpadding="0" cellspacing="0">
                                                {{-- Title / Name --}}
                                                <tr>
                                                    <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;width:130px;vertical-align:top;">Name</td>
                                                    <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">{{ $entity->title ?? $entity->name ?? '' }}</td>
                                                </tr>

                                                {{-- Business Code --}}
                                                @if ($module === 'task' && $entity->business_id)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Task ID</td>
                                                        <td style="padding:5px 0;">
                                                            <span style="display:inline-block;background-color:#eff6ff;color:#2563eb;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;">{{ $entity->business_id }}</span>
                                                        </td>
                                                    </tr>
                                                @endif
                                                @if ($module === 'project' && $entity->business_id)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Project ID</td>
                                                        <td style="padding:5px 0;">
                                                            <span style="display:inline-block;background-color:#fefce8;color:#ca8a04;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;">{{ $entity->business_id }}</span>
                                                        </td>
                                                    </tr>
                                                @endif
                                                @if ($module === 'deliverable' && $entity->business_id)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Subtask ID</td>
                                                        <td style="padding:5px 0;">
                                                            <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;">{{ $entity->business_id }}</span>
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Description --}}
                                                @if ($entity->description)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Description</td>
                                                        <td style="padding:5px 0;color:#374151;font-size:13px;line-height:1.5;">{{ \Illuminate\Support\Str::limit(strip_tags($entity->description), 200) }}</td>
                                                    </tr>
                                                @endif

                                                {{-- Team Lead (for team module) --}}
                                                @if ($module === 'team' && $entity->leader)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Team Lead</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">{{ $entity->leader->name }}</td>
                                                    </tr>
                                                @endif

                                                {{-- Team Members (for team module) --}}
                                                @if ($module === 'team' && $entity->members && $entity->members->count())
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Members</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;">{{ $entity->members->pluck('name')->implode(', ') }}</td>
                                                    </tr>
                                                @endif

                                                {{-- Status --}}
                                                @if ($entity->status)
                                                    @php
                                                        $sc = $statusColors[$entity->status] ?? ['#f3f4f6', '#6b7280'];
                                                    @endphp
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Status</td>
                                                        <td style="padding:5px 0;">
                                                            <span style="display:inline-block;background-color:{{ $sc[0] }};color:{{ $sc[1] }};font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;text-transform:capitalize;">{{ str_replace('_', ' ', $entity->status) }}</span>
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Priority --}}
                                                @if ($entity->priority)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Priority</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;text-transform:capitalize;">{{ $entity->priority }}</td>
                                                    </tr>
                                                @endif

                                                {{-- Project (for task/deliverable) --}}
                                                @if ($entity->project)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Project</td>
                                                        <td style="padding:5px 0;color:#2563eb;font-size:13px;font-weight:600;">{{ $entity->project->title }}</td>
                                                    </tr>
                                                @endif

                                                {{-- Start Date / Deadline --}}
                                                @if ($entity->start_date || $entity->end_date || $entity->due_date)
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Timeline</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;">
                                                            @if ($entity->start_date)
                                                                {{ \Carbon\Carbon::parse($entity->start_date)->format('d M Y') }}
                                                            @endif
                                                            @if ($entity->start_date && ($entity->end_date || $entity->due_date))
                                                                &rarr;
                                                            @endif
                                                            @if ($entity->end_date)
                                                                {{ \Carbon\Carbon::parse($entity->end_date)->format('d M Y') }}
                                                            @elseif ($entity->due_date)
                                                                {{ \Carbon\Carbon::parse($entity->due_date)->format('d M Y') }}
                                                            @endif
                                                        </td>
                                                    </tr>
                                                @endif

                                                {{-- Assigned To (for task) --}}
                                                @if ($module === 'task' && $entity->assignees && $entity->assignees->count())
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Assigned To</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;">{{ $entity->assignees->pluck('name')->implode(', ') }}</td>
                                                    </tr>
                                                @endif
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            @if ($notification->link)
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{{ $frontendUrl }}{{ $notification->link }}"
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
