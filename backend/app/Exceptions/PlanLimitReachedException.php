<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when a plan limit is reached during resource creation.
 *
 * Caught by the DraftController to return a proper JSON response.
 */
class PlanLimitReachedException extends Exception
{
    protected string $resource;
    protected int $limit;
    protected int $current;

    public function __construct(string $message, string $resource, int $limit, int $current)
    {
        parent::__construct($message);
        $this->resource = $resource;
        $this->limit = $limit;
        $this->current = $current;
    }

    public function getResource(): string
    {
        return $this->resource;
    }

    public function getLimit(): int
    {
        return $this->limit;
    }

    public function getCurrent(): int
    {
        return $this->current;
    }

    public function render($request)
    {
        return response()->json([
            'success'      => false,
            'code'         => 'LIMIT_REACHED',
            'resource'     => $this->resource,
            'limit'        => $this->limit,
            'current_usage' => $this->current,
            'remaining'    => max(0, $this->limit - $this->current),
            'message'      => $this->getMessage(),
        ], 422);
    }
}
