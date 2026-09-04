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

        $encodedData = urlencode($data);
        $context = stream_context_create([
            'http' => [
                'timeout' => 5,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        // Primary: qrserver API
        $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size={$size}x{$size}&data={$encodedData}";
        $imageContent = @file_get_contents($qrUrl, false, $context);

        if ($imageContent === false || strlen($imageContent) < 50) {
            // Fallback: QuickChart QR API
            $qrUrlFallback = "https://quickchart.io/qr?size={$size}&text={$encodedData}&format=png";
            $imageContent = @file_get_contents($qrUrlFallback, false, $context);
        }

        if ($imageContent === false || strlen($imageContent) < 50) {
            return redirect($qrUrl);
        }

        return response($imageContent)
            ->header('Content-Type', 'image/png')
            ->header('Cache-Control', 'public, max-age=86400')
            ->header('Access-Control-Allow-Origin', '*');
    }
}
