<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CompanyDocumentController extends Controller
{
    private function resolveDisk(Request $request): string
    {
        $org = $request->attributes->get('currentOrganization');
        return $org ? \App\Services\StorageDiskResolver::getDisk($org) : config('company.disk', 'public');
    }

    private function findExistingFile(string $type, ?string $disk = null): ?string
    {
        $disk = $disk ?? config('company.disk', 'public');
        $uploadDir = config('company.upload_dir', 'company_docs');
        $validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

        $files = Storage::disk($disk)->files($uploadDir);
        foreach ($files as $file) {
            $basename = basename($file);
            foreach ($validExtensions as $ext) {
                if ($basename === $type.'.'.$ext) {
                    return $file;
                }
            }
        }

        return null;
    }

    private function findOtherDocumentFiles(): array
    {
        $disk = config('company.disk', 'public');
        $uploadDir = config('company.upload_dir', 'company_docs');
        $validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
        $prefix = 'other_document_';

        $result = [];
        $files = Storage::disk($disk)->files($uploadDir);
        foreach ($files as $file) {
            $basename = basename($file);
            if (str_starts_with($basename, $prefix)) {
                foreach ($validExtensions as $ext) {
                    if (str_ends_with($basename, '.'.$ext)) {
                        $result[] = [
                            'path' => $file,
                            'url' => Storage::disk($disk)->url($file),
                            'filename' => $basename,
                        ];
                        break;
                    }
                }
            }
        }

        return $result;
    }

    public function index(Request $request)
    {
        $labels = config('company.document_labels', []);
        $singleTypes = ['company_logo', 'qr_code'];
        $disk = $this->resolveDisk($request);

        $result = [];
        foreach ($singleTypes as $key) {
            $path = $this->findExistingFile($key, $disk);
            $exists = $path !== null;
            $result[$key] = [
                'label' => $labels[$key] ?? ucfirst(str_replace('_', ' ', $key)),
                'path' => $path,
                'exists' => $exists,
                'url' => $exists ? Storage::disk($disk)->url($path) : null,
            ];
        }

        $otherDocs = $this->findOtherDocumentFiles();
        $result['other_documents'] = [
            'label' => $labels['other_documents'] ?? 'Other Documents',
            'files' => $otherDocs,
            'exists' => count($otherDocs) > 0,
        ];

        return response()->json([
            'success' => true,
            'documents' => $result,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'type' => 'required|string|in:company_logo,qr_code,other_documents',
            'file' => 'required|file|mimes:pdf,jpg,jpeg,png,webp|max:10240',
        ]);

        $disk = $this->resolveDisk($request);
        $uploadDir = config('company.upload_dir', 'company_docs');
        $type = $request->input('type');
        $file = $request->file('file');

        if ($type === 'other_documents') {
            $extension = $file->getClientOriginalExtension();
            $filename = 'other_document_'.time().'_'.mt_rand(1000, 9999).'.'.$extension;
            $file->storeAs($uploadDir, $filename, $disk);
            $path = $uploadDir.'/'.$filename;

            return response()->json([
                'success' => true,
                'message' => 'Other document uploaded successfully',
                'document' => [
                    'type' => $type,
                    'path' => $path,
                    'url' => Storage::disk($disk)->url($path),
                    'filename' => $filename,
                ],
            ]);
        }

        $existing = $this->findExistingFile($type);
        if ($existing) {
            Storage::disk($disk)->delete($existing);
        }

        $extension = $file->getClientOriginalExtension();
        $filename = $type.'.'.$extension;
        $file->storeAs($uploadDir, $filename, $disk);
        $path = $uploadDir.'/'.$filename;

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $type)).' uploaded successfully',
            'document' => [
                'type' => $type,
                'path' => $path,
                'url' => Storage::disk($disk)->url($path),
            ],
        ]);
    }

    public function destroy(Request $request, string $type)
    {
        $disk = $this->resolveDisk($request);

        if ($type === 'other_documents') {
            $filename = $request->query('filename');
            if (! $filename) {
                return response()->json(['success' => false, 'message' => 'Filename is required to delete other document'], 422);
            }

            $filename = basename($filename);
            if (str_contains($filename, '..') || str_contains($filename, '/') || str_contains($filename, '\\')) {
                return response()->json(['success' => false, 'message' => 'Invalid filename'], 422);
            }

            $uploadDir = config('company.upload_dir', 'company_docs');
            $path = $uploadDir.'/'.$filename;

            if (Storage::disk($disk)->exists($path)) {
                Storage::disk($disk)->delete($path);
            }

            return response()->json([
                'success' => true,
                'message' => 'Other document deleted successfully',
            ]);
        }

        $validTypes = ['company_logo', 'qr_code'];
        if (! in_array($type, $validTypes)) {
            return response()->json(['success' => false, 'message' => 'Invalid document type'], 422);
        }

        $existing = $this->findExistingFile($type, $this->resolveDisk($request));
        if ($existing) {
            Storage::disk($this->resolveDisk($request))->delete($existing);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $type)).' deleted successfully',
        ]);
    }
}
