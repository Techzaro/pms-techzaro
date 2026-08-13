<?php

namespace App\Services;

use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer;

class AuditExportService
{
    public function exportExcel(Collection $logs): Response
    {
        $fileName = 'audit-logs-' . now()->format('Y-m-d_H-i-s') . '.xlsx';
        $tempPath = tempnam(sys_get_temp_dir(), 'audit_export_') . '.xlsx';

        $writer = new Writer();
        $writer->openToFile($tempPath);

        $headerStyle = (new Style())
            ->setFontBold()
            ->setFontSize(11);

        $headerRow = Row::fromValues([
            'Date & Time', 'User', 'Module', 'Action', 'Description',
            'Status', 'IP Address', 'Browser', 'OS', 'Device',
        ], $headerStyle);
        $writer->addRow($headerRow);

        foreach ($logs as $log) {
            $writer->addRow(Row::fromValues([
                $log->created_at?->format('Y-m-d H:i:s') ?? '-',
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
