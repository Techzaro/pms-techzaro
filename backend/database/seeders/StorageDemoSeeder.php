<?php

namespace Database\Seeders;

use App\Models\Master\OrganizationStorageUsage;
use App\Models\Master\OrganizationSubscription;
use Illuminate\Database\Seeder;

class StorageDemoSeeder extends Seeder
{
    public function run(): void
    {
        $orgIds = [2, 3, 4, 59];

        foreach ($orgIds as $orgId) {
            OrganizationStorageUsage::on('mysql_master')->where('organization_id', $orgId)->delete();

            $subscription = OrganizationSubscription::on('mysql_master')
                ->where('organization_id', $orgId)
                ->with('plan')
                ->latest()
                ->first();

            $maxStorageGb = $subscription?->getEffectiveMaxStorageGb() ?? 10;
            $maxBytes = (int) ($maxStorageGb * 1024 * 1024 * 1024);
            $targetUsagePercent = 0.65 + (mt_rand(0, 20) / 100);
            $targetBytes = (int) ($maxBytes * $targetUsagePercent);

            $uploaders = [
                ['name' => 'Ahmed Khan', 'id' => 1],
                ['name' => 'Sarah Malik', 'id' => 2],
                ['name' => 'John Smith', 'id' => 3],
                ['name' => 'Fatima Ali', 'id' => 4],
                ['name' => 'Mike Johnson', 'id' => 5],
            ];

            $mimeTypes = [
                'attachments' => ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                'documents'   => ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel'],
                'images'      => ['image/jpeg', 'image/png', 'image/svg+xml'],
                'avatars'     => ['image/jpeg', 'image/png'],
                'reports'     => ['application/pdf', 'application/vnd.ms-excel'],
                'other'       => ['application/sql', 'application/json', 'text/plain', 'text/csv'],
            ];

            $fileTemplates = [
                'attachments' => [
                    'project-wireframe-v2.fig', 'client-meeting-notes.docx', 'brand-guidelines-2024.pdf',
                    'ui-mockup-homepage.psd', 'logo-final.ai', 'sprint-review-slides.pptx',
                    'database-schema.png', 'api-documentation.pdf', 'requirements-gathering.xlsx',
                    'competitor-analysis.pdf', 'technical-architecture.drawio', 'user-persona-research.pdf',
                    'design-system-tokens.json', 'icon-library-v3.zip', 'video-tutorial-raw.mp4',
                    'audio-interview-clip.mp3', 'presentation-deck-final.pptx', 'wireframe-mobile.fig',
                ],
                'documents' => [
                    'project-proposal.pdf', 'contract-agreement.docx', 'invoice-march-2024.pdf',
                    'quarterly-report-Q1.xlsx', 'employee-handbook.pdf', 'meeting-minutes-jan.docx',
                    'budget-forecast-2024.xlsx', 'compliance-checklist.pdf', 'onboarding-guide.pdf',
                    'scope-of-work.docx', 'nda-agreement.pdf', 'change-request-form.pdf',
                    'risk-assessment.xlsx', 'vendor-evaluation.pdf', 'process-documentation.docx',
                ],
                'images' => [
                    'hero-banner-website.jpg', 'product-photo-main.png', 'team-photo-2024.jpg',
                    'office-interior-shot.jpg', 'social-media-cover.png', 'email-template-header.png',
                    'infographic-q1-results.png', 'blog-featured-image.jpg', 'app-screenshot-dashboard.png',
                    'thumbnail-video-tutorial.jpg', 'icon-set-custom.svg', 'background-pattern.png',
                ],
                'avatars' => [
                    'profile-photo-admin.jpg', 'profile-photo-john.jpg', 'profile-photo-sarah.jpg',
                    'profile-photo-mike.jpg', 'profile-photo-lisa.jpg', 'avatar-default.png',
                    'team-member-ahmed.jpg', 'team-member-fatima.jpg', 'team-member-ali.jpg',
                ],
                'reports' => [
                    'monthly-analytics-report.pdf', 'sales-performance-march.xlsx',
                    'customer-feedback-summary.pdf', 'financial-statement-Q1.pdf',
                    'marketing-campaign-results.xlsx', 'project-timelines-report.pdf',
                    'resource-utilization-report.xlsx', 'quality-assurance-report.pdf',
                    'inventory-status-report.xlsx', 'vendor-evaluation-scorecard.xlsx',
                ],
                'other' => [
                    'backup-database-2024.sql', 'server-config-backup.json', 'ssl-certificate.pem',
                    'deployment-script.sh', 'docker-compose.yml', 'environment-variables.env',
                    'test-data-export.csv', 'raw-logs-march.txt',
                ],
            ];

            $records = [];
            $currentBytes = 0;

            $distributions = [
                ['cat' => 'attachments', 'count' => 15, 'minMb' => 50, 'maxMb' => 500],
                ['cat' => 'documents',   'count' => 18, 'minMb' => 20, 'maxMb' => 300],
                ['cat' => 'images',      'count' => 12, 'minMb' => 30, 'maxMb' => 400],
                ['cat' => 'avatars',     'count' => 8,  'minMb' => 5,  'maxMb' => 50],
                ['cat' => 'reports',     'count' => 10, 'minMb' => 40, 'maxMb' => 600],
                ['cat' => 'other',       'count' => 7,  'minMb' => 10, 'maxMb' => 200],
            ];

            foreach ($distributions as $dist) {
                $cat = $dist['cat'];
                $names = $fileTemplates[$cat];

                for ($i = 0; $i < $dist['count']; $i++) {
                    if ($currentBytes >= $targetBytes) break 2;

                    $sizeMb = mt_rand($dist['minMb'], $dist['maxMb']);
                    $sizeBytes = (int) ($sizeMb * 1024 * 1024);

                    if ($currentBytes + $sizeBytes > $maxBytes) {
                        $sizeBytes = $maxBytes - $currentBytes;
                        if ($sizeBytes <= 0) break 2;
                    }

                    $currentBytes += $sizeBytes;
                    $uploader = $uploaders[array_rand($uploaders)];
                    $name = $names[$i % count($names)];
                    $daysAgo = mt_rand(0, 90);

                    $records[] = [
                        'organization_id'  => $orgId,
                        'category'         => $cat,
                        'file_path'        => "/storage/tenants/{$this->getSlug($orgId)}/{$cat}/{$name}",
                        'file_name'        => $name,
                        'mime_type'        => $mimeTypes[$cat][array_rand($mimeTypes[$cat])],
                        'file_size_bytes'  => $sizeBytes,
                        'uploaded_by_name' => $uploader['name'],
                        'uploaded_by_id'   => $uploader['id'],
                        'created_at'       => now()->subDays($daysAgo)->subHours(mt_rand(0, 23)),
                        'updated_at'       => now()->subDays($daysAgo)->subHours(mt_rand(0, 23)),
                    ];
                }
            }

            foreach (array_chunk($records, 50) as $chunk) {
                OrganizationStorageUsage::on('mysql_master')->insert($chunk);
            }

            $total = OrganizationStorageUsage::on('mysql_master')->where('organization_id', $orgId)->count();
            $totalBytesActual = OrganizationStorageUsage::on('mysql_master')->where('organization_id', $orgId)->sum('file_size_bytes');
            $totalGb = round($totalBytesActual / (1024 * 1024 * 1024), 2);
            $usagePercent = round(($totalGb / $maxStorageGb) * 100, 1);

            $this->command->info("  Org #{$orgId}: {$total} files, {$totalGb} GB / {$maxStorageGb} GB ({$usagePercent}%)");
        }
    }

    private function getSlug(int $orgId): string
    {
        return match($orgId) {
            2  => 'mughal-furnitures',
            3  => 'mughal-organization',
            4  => 'mughal-e-azam',
            59 => 'techxaro-5',
            default => 'org-' . $orgId,
        };
    }
}
