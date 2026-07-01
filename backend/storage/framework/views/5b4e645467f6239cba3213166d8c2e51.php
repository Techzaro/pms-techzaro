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
                            <?php
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
                            ?>
                            <table cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="background-color:<?php echo e($badge[0]); ?>;border:1px solid <?php echo e($badge[1]); ?>22;border-radius:20px;padding:5px 14px;">
                                        <span style="color:<?php echo e($badge[1]); ?>;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;"><?php echo e($badge[2]); ?> Notification</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:20px 34px 0;">
                            <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;"><?php echo e($notification->user->name); ?></strong>,</p>

                            <?php if($notification->title): ?>
                                <h2 style="color:#111827;font-size:18px;font-weight:700;margin:16px 0 12px;padding:0;"><?php echo e($notification->title); ?></h2>
                            <?php endif; ?>

                            <!-- Message Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-left:4px solid <?php echo e($badge[1]); ?>;border-radius:0 8px 8px 0;margin:16px 0 20px;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;"><?php echo e($notification->message); ?></p>
                                    </td>
                                </tr>
                            </table>

                            
                            <?php if($notification->changes && count($notification->changes) > 0): ?>
                                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                    <tr>
                                        <td style="background-color:<?php echo e($badge[0]); ?>;padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                            <span style="color:<?php echo e($badge[1]); ?>;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">
                                                <?php if($module === 'task'): ?> Task Changes
                                                <?php elseif($module === 'project'): ?> Project Changes
                                                <?php elseif($module === 'deliverable'): ?> Deliverable Changes
                                                <?php else: ?> Changes Made
                                                <?php endif; ?>
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:16px 20px;">
                                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                <tr>
                                                    <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Field</th>
                                                    <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Previous Value</th>
                                                    <th style="text-align:left;padding:8px 12px;background-color:#f9fafb;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">New Value</th>
                                                </tr>
                                                <?php $__currentLoopData = $notification->changes; $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $change): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); ?>
                                                    <tr>
                                                        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;font-weight:600;"><?php echo e($change['field'] ?? ucwords(str_replace('_', ' ', $change['field_name'] ?? ''))); ?></td>
                                                        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
                                                            <?php if(!empty($change['old'])): ?>
                                                                <span style="display:inline-block;background-color:#fef2f2;color:#dc2626;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;text-decoration:line-through;"><?php echo e($change['old']); ?></span>
                                                            <?php else: ?>
                                                                <span style="color:#9ca3af;font-size:12px;font-style:italic;">—</span>
                                                            <?php endif; ?>
                                                        </td>
                                                        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
                                                            <?php if(!empty($change['new'])): ?>
                                                                <span style="display:inline-block;background-color:#f0fdf4;color:#16a34a;font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;"><?php echo e($change['new']); ?></span>
                                                            <?php else: ?>
                                                                <span style="color:#9ca3af;font-size:12px;font-style:italic;">—</span>
                                                            <?php endif; ?>
                                                        </td>
                                                    </tr>
                                                <?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); ?>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            <?php endif; ?>

                            
                            <?php if($entity): ?>
                                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                    <tr>
                                        <td style="background-color:<?php echo e($badge[0]); ?>;padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                                            <span style="color:<?php echo e($badge[1]); ?>;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;">
                                                <?php if($module === 'task'): ?> Task Details
                                                <?php elseif($module === 'project'): ?> Project Details
                                                <?php elseif($module === 'deliverable'): ?> Deliverable Details
                                                <?php elseif($module === 'team'): ?> Team Details
                                                <?php endif; ?>
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:16px 20px;">
                                            <table width="100%" cellpadding="0" cellspacing="0">
                                                
                                                <tr>
                                                    <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;width:130px;vertical-align:top;">Name</td>
                                                    <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;"><?php echo e($entity->title ?? $entity->name ?? ''); ?></td>
                                                </tr>

                                                
                                                <?php if($entity->description): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Description</td>
                                                        <td style="padding:5px 0;color:#374151;font-size:13px;line-height:1.5;"><?php echo e(\Illuminate\Support\Str::limit(strip_tags($entity->description), 200)); ?></td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($module === 'team' && $entity->leader): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Team Lead</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;"><?php echo e($entity->leader->name); ?></td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($module === 'team' && $entity->members && $entity->members->count()): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;vertical-align:top;">Members</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;"><?php echo e($entity->members->pluck('name')->implode(', ')); ?></td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($entity->status): ?>
                                                    <?php
                                                        $sc = $statusColors[$entity->status] ?? ['#f3f4f6', '#6b7280'];
                                                    ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Status</td>
                                                        <td style="padding:5px 0;">
                                                            <span style="display:inline-block;background-color:<?php echo e($sc[0]); ?>;color:<?php echo e($sc[1]); ?>;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;text-transform:capitalize;"><?php echo e(str_replace('_', ' ', $entity->status)); ?></span>
                                                        </td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($entity->priority): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Priority</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;text-transform:capitalize;"><?php echo e($entity->priority); ?></td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($entity->project): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Project</td>
                                                        <td style="padding:5px 0;color:#2563eb;font-size:13px;font-weight:600;"><?php echo e($entity->project->title); ?></td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($entity->start_date || $entity->end_date || $entity->due_date): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Timeline</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;">
                                                            <?php if($entity->start_date): ?>
                                                                <?php echo e(\Carbon\Carbon::parse($entity->start_date)->format('d M Y')); ?>

                                                            <?php endif; ?>
                                                            <?php if($entity->start_date && ($entity->end_date || $entity->due_date)): ?>
                                                                &rarr;
                                                            <?php endif; ?>
                                                            <?php if($entity->end_date): ?>
                                                                <?php echo e(\Carbon\Carbon::parse($entity->end_date)->format('d M Y')); ?>

                                                            <?php elseif($entity->due_date): ?>
                                                                <?php echo e(\Carbon\Carbon::parse($entity->due_date)->format('d M Y')); ?>

                                                            <?php endif; ?>
                                                        </td>
                                                    </tr>
                                                <?php endif; ?>

                                                
                                                <?php if($module === 'task' && $entity->assignees && $entity->assignees->count()): ?>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:12px;font-weight:600;">Assigned To</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:13px;"><?php echo e($entity->assignees->pluck('name')->implode(', ')); ?></td>
                                                    </tr>
                                                <?php endif; ?>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            <?php endif; ?>

                            <?php if($notification->link): ?>
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                    <tr>
                                        <td align="center">
                                            <a href="<?php echo e($frontendUrl); ?><?php echo e($notification->link); ?>"
                                               style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                                                View in PMS &rarr;
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            <?php endif; ?>

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
                            <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; <?php echo e(date('Y')); ?> TechXaro Pvt. Ltd. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
<?php /**PATH C:\xampp\htdocs\PMS-project\backend\resources\views/emails/notification.blade.php ENDPATH**/ ?>