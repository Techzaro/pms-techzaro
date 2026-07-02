<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CompanyDocumentController extends Controller
{
    private function findExistingFile(string $type): ?string
    {
        $disk = config('company.disk', 'public');
        $uploadDir = config('company.upload_dir', 'company_docs');
        $validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

        $files = Storage::disk($disk)->files($uploadDir);
        foreach ($files as $file) {
            $basename = basename($file);
            foreach ($validExtensions as $ext) {
                if ($basename === $type . '.' . $ext) {
                    return $file;
                }
            }
        }
        return null;
    }

    public function index()
    {
        $labels = config('company.document_labels', []);
        $types = ['company_logo', 'qr_code', 'employment_contract', 'offer_letter', 'techxaro_regulations'];

        $result = [];
        foreach ($types as $key) {
            $path = $this->findExistingFile($key);
            $exists = $path !== null;
            $result[$key] = [
                'label' => $labels[$key] ?? ucfirst(str_replace('_', ' ', $key)),
                'path' => $path,
                'exists' => $exists,
                'url' => $exists ? Storage::disk('public')->url($path) : null,
            ];
        }

        return response()->json([
            'success' => true,
            'documents' => $result,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'type' => 'required|string|in:company_logo,qr_code,employment_contract,offer_letter,techxaro_regulations',
            'file' => 'required|file|mimes:pdf,jpg,jpeg,png,webp|max:10240',
        ]);

        $disk = config('company.disk', 'public');
        $uploadDir = config('company.upload_dir', 'company_docs');
        $type = $request->input('type');
        $file = $request->file('file');

        $existing = $this->findExistingFile($type);
        if ($existing) {
            Storage::disk($disk)->delete($existing);
        }

        $extension = $file->getClientOriginalExtension();
        $filename = $type . '.' . $extension;
        $file->storeAs($uploadDir, $filename, $disk);
        $path = $uploadDir . '/' . $filename;

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $type)) . ' uploaded successfully',
            'document' => [
                'type' => $type,
                'path' => $path,
                'url' => Storage::disk($disk)->url($path),
            ],
        ]);
    }

    public function destroy(Request $request, string $type)
    {
        $validTypes = ['company_logo', 'qr_code', 'employment_contract', 'offer_letter', 'techxaro_regulations'];
        if (!in_array($type, $validTypes)) {
            return response()->json(['success' => false, 'message' => 'Invalid document type'], 422);
        }

        $existing = $this->findExistingFile($type);
        if ($existing) {
            Storage::disk('public')->delete($existing);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $type)) . ' deleted successfully',
        ]);
    }
}
