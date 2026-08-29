<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;

class FileStorageService
{
    /**
     * Resolves a raw file path or URL into a valid storage disk and path.
     *
     * @param string|null $rawPath
     * @return array{disk: string, path: string}|null
     */
    public static function resolveFile(?string $rawPath): ?array
    {
        if (empty($rawPath)) {
            return null;
        }

        // 1. Remove scheme and domain if full URL is passed
        if (preg_match('#^https?://[^/]+(/.*)$#i', $rawPath, $m)) {
            $path = $m[1];
        } else {
            $path = $rawPath;
        }

        $path = urldecode($path);
        $path = str_replace('\\', '/', $path);

        // Strip query string parameters (e.g. S3 presigned URL params)
        $path = strtok($path, '?');

        $path = ltrim($path, '/');

        // Candidate paths to check
        $candidates = [
            $path,
            preg_replace('#^storage/#i', '', $path),
            preg_replace('#^public/#i', '', $path),
            preg_replace('#^app/public/#i', '', $path),
        ];

        // Trim leading slashes from all candidates
        $cleanCandidates = [];
        foreach ($candidates as $c) {
            $trimmed = ltrim($c, '/');
            if ($trimmed !== '') {
                $cleanCandidates[] = $trimmed;
            }
        }
        $cleanCandidates = array_unique($cleanCandidates);

        // Check if path looks like an S3 key (org-{id}/...) and try S3 disk
        $org = request()->attributes->get('currentOrganization');
        if ($org && \App\Services\StorageDiskResolver::isS3($org)) {
            \App\Services\StorageDiskResolver::getDisk($org);
            foreach ($cleanCandidates as $cand) {
                if (Storage::disk('s3')->exists($cand)) {
                    return ['disk' => 's3', 'path' => $cand];
                }
            }
        }

        // Check on public disk
        foreach ($cleanCandidates as $cand) {
            if (Storage::disk('public')->exists($cand)) {
                return ['disk' => 'public', 'path' => $cand];
            }
        }

        // Check on local disk
        foreach ($cleanCandidates as $cand) {
            if (Storage::disk('local')->exists($cand)) {
                return ['disk' => 'local', 'path' => $cand];
            }
        }

        // Check absolute paths
        foreach ($cleanCandidates as $cand) {
            if (file_exists(storage_path('app/public/'.$cand))) {
                return ['disk' => 'public', 'path' => $cand];
            }
            if (file_exists(storage_path('app/'.$cand))) {
                return ['disk' => 'local', 'path' => $cand];
            }
            if (file_exists(public_path('storage/'.$cand))) {
                return ['disk' => 'public', 'path' => $cand];
            }
        }

        return null;
    }
}
