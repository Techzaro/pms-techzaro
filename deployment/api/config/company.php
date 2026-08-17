<?php

/**
 * Company Documents Configuration.
 *
 * Defines paths for standard company documents that are attached to
 * user onboarding/registration emails. These documents are stored
 * in storage/app/public/company_docs/ and are uploaded via the
 * admin settings panel.
 *
 * @see \App\Http\Controllers\CompanyDocumentController
 */

return [

    /*
    |--------------------------------------------------------------------------
    | Standard Company Documents
    |--------------------------------------------------------------------------
    |
    | These documents are always attached to onboarding emails.
    | User personal email: receives only these 5 standard documents.
    | Admin/Manager email: receives these 5 + all uploaded user documents.
    |
    | Paths are relative to the 'public' storage disk (storage/app/public/).
    |
    */

    'documents' => [
        'company_logo' => env('COMPANY_LOGO_PATH', 'company_docs/company_logo.png'),
        'qr_code' => env('COMPANY_QR_CODE_PATH', 'company_docs/qr_code.png'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Document Labels (for email attachment listing)
    |--------------------------------------------------------------------------
    */

    'document_labels' => [
        'company_logo' => 'TechXaro Company Logo',
        'qr_code' => 'Company QR Code',
        'other_documents' => 'Other Documents',
    ],

    /*
    |--------------------------------------------------------------------------
    | Upload Disk
    |--------------------------------------------------------------------------
    |
    | The filesystem disk used for storing company documents.
    |
    */

    'disk' => 'public',

    /*
    |--------------------------------------------------------------------------
    | Upload Directory
    |--------------------------------------------------------------------------
    |
    | The directory within the disk where company documents are stored.
    |
    */

    'upload_dir' => 'company_docs',

];
