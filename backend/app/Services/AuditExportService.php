<?php

namespace App\Services;

use Carbon\Carbon;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer;

class AuditExportService
{
    public function exportExcel($logs, string $timezone = 'UTC'): BinaryFileResponse
    {
        if ($logs instanceof \Illuminate\Pagination\AbstractPaginator) {
            $logs = $logs->getCollection();
        }
        $fileName = 'audit-logs-' . now()->setTimezone($timezone)->format('Y-m-d_H-i-s') . '.xlsx';
        $tempPath = tempnam(sys_get_temp_dir(), 'audit_export_') . '.xlsx';

        $writer = new Writer();
        $writer->openToFile($tempPath);

        $metaStyle = (new Style())
            ->setFontBold()
            ->setFontSize(10);

        // Header metadata with explicit Timezone label (SRS Sec 22)
        $metaRow = Row::fromValues([
            'Report: Audit Logs Export',
            'Generated: ' . now()->setTimezone($timezone)->format('Y-m-d H:i:s'),
            'Timezone: ' . $timezone,
        ], $metaStyle);
        $writer->addRow($metaRow);

        $emptyRow = Row::fromValues(['']);
        $writer->addRow($emptyRow);

        $headerStyle = (new Style())
            ->setFontBold()
            ->setFontSize(11);

        $headerRow = Row::fromValues([
            "Date & Time ({$timezone})", 'User', 'Module', 'Action', 'Description',
            'Status', 'IP Address', 'Browser', 'OS', 'Device',
        ], $headerStyle);
        $writer->addRow($headerRow);

        foreach ($logs as $log) {
            $formattedTime = $log->created_at 
                ? Carbon::parse($log->created_at)->setTimezone($timezone)->format('Y-m-d H:i:s')
                : '-';

            $writer->addRow(Row::fromValues([
                $formattedTime,
                $log->user?->name ?? 'System',
                ucfirst($log->module),
                ucfirst(str_replace('_', ' ', $log->action)),
                $log->description,
                ucfirst($log->status),
                $log->ip_address ?? '-',
                $log->browser ?? '-',
                $log->os ?? '-',
                $log->device ?? '-',
            ]));
        }

        $writer->close();

        return response()
            ->download($tempPath, $fileName, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }
}
