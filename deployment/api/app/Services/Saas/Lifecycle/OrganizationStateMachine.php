<?php

namespace App\Services\Saas\Lifecycle;

/**
 * OrganizationStateMachine.
 *
 * Defines valid state transitions for organization lifecycle.
 * Prevents invalid transitions and provides state validation.
 *
 * States:
 * - draft:      Newly created, not yet active
 * - active:     Fully operational
 * - trial:      In trial period
 * - suspended:  Temporarily blocked
 * - archived:   Inactive but restorable
 * - deleted:    Soft-deleted (via SoftDeletes)
 */
class OrganizationStateMachine
{
    public const STATE_DRAFT     = 'draft';
    public const STATE_ACTIVE    = 'active';
    public const STATE_TRIAL     = 'trial';
    public const STATE_SUSPENDED = 'suspended';
    public const STATE_ARCHIVED  = 'archived';
    public const STATE_DELETED   = 'deleted';

    /**
     * Valid state transitions.
     * Key = current state, Value = array of allowed next states.
     */
    protected const TRANSITIONS = [
        self::STATE_DRAFT     => [self::STATE_ACTIVE, self::STATE_TRIAL, self::STATE_DELETED],
        self::STATE_ACTIVE    => [self::STATE_SUSPENDED, self::STATE_ARCHIVED, self::STATE_DELETED, self::STATE_TRIAL],
        self::STATE_TRIAL     => [self::STATE_ACTIVE, self::STATE_SUSPENDED, self::STATE_ARCHIVED, self::STATE_DELETED],
        self::STATE_SUSPENDED => [self::STATE_ACTIVE, self::STATE_ARCHIVED, self::STATE_DELETED],
        self::STATE_ARCHIVED  => [self::STATE_ACTIVE, self::STATE_DELETED],
        self::STATE_DELETED   => [], // Cannot transition from deleted (use restore instead)
    ];

    /**
     * Check if a state transition is valid.
     */
    public function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    /**
     * Get all allowed transitions from a given state.
     */
    public function getAllowedTransitions(string $state): array
    {
        return self::TRANSITIONS[$state] ?? [];
    }

    /**
     * Get all possible states.
     */
    public function getAllStates(): array
    {
        return array_keys(self::TRANSITIONS);
    }

    /**
     * Validate a transition. Throws exception if invalid.
     *
     * @throws \InvalidArgumentException If transition is not allowed.
     */
    public function validateTransition(string $from, string $to): void
    {
        if (!$this->canTransition($from, $to)) {
            throw new \InvalidArgumentException(
                "Invalid state transition: '{$from}' → '{$to}'. " .
                "Allowed transitions from '{$from}': " .
                implode(', ', $this->getAllowedTransitions($from) ?: ['none'])
            );
        }
    }

    /**
     * Check if the organization is in a state that blocks tenant requests.
     */
    public function blocksRequests(string $state): bool
    {
        return in_array($state, [
            self::STATE_SUSPENDED,
            self::STATE_ARCHIVED,
            self::STATE_DELETED,
            self::STATE_DRAFT,
        ], true);
    }

    /**
     * Check if the organization is in a usable state.
     */
    public function isUsable(string $state): bool
    {
        return in_array($state, [self::STATE_ACTIVE, self::STATE_TRIAL], true);
    }
}
