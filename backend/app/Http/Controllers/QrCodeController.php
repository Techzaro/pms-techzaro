<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * QrCodeController
 *
 * Generates QR codes server-side to avoid CORS issues.
 */
class QrCodeController extends Controller
{
    /**
     * GET /api/qr-code?data=...&size=200
     * Returns a QR code PNG image.
     */
    public function generate()
    {
        $data = request()->query('data', '');
        $size = (int) request()->query('size', 200);

        if (empty($data)) {
            return response()->json(['error' => 'data parameter is required'], 400);
        }

        // Use Google Charts API (no CORS, works server-side)
        $encodedData = urlencode($data);
        $qrUrl = "https://chart.googleapis.com/chart?chs={$size}x{$size}&cht=qr&chl={$encodedData}";

        $imageContent = @file_get_contents($qrUrl);

        if ($imageContent === false) {
            // Fallback: try qrserver API
            $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size={$size}x{$size}&data={$encodedData}";
            $imageContent = @file_get_contents($qrUrl);
        }

        if ($imageContent === false) {
            return response()->json(['error' => 'Failed to generate QR code'], 500);
        }

        return response($imageContent)
            ->header('Content-Type', 'image/png')
            ->header('Cache-Control', 'public, max-age=86400')
            ->header('Access-Control-Allow-Origin', '*');
    }
}
