<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        $subscriptions = DB::connection($this->connection)
            ->table('organization_subscriptions')
            ->join('organization_plans', 'organization_subscriptions.plan_id', '=', 'organization_plans.id')
            ->select(
                'organization_subscriptions.*',
                'organization_plans.name as plan_name',
                'organization_plans.slug as plan_slug'
            )
            ->orderBy('organization_subscriptions.created_at', 'asc')
            ->get();

        foreach ($subscriptions as $sub) {
            // Determine event type based on subscription status
            $eventType = match ($sub->status) {
                'trial' => 'trial_started',
                'active' => 'plan_assigned',
                'replaced' => 'plan_changed',
                'cancelled' => 'subscription_cancelled',
                default => 'plan_assigned',
            };

            // Try to find previous subscription for this org to determine change type
            $previousSub = DB::connection($this->connection)
                ->table('organization_subscriptions')
                ->where('organization_id', $sub->organization_id)
                ->where('id', '<', $sub->id)
                ->orderBy('id', 'desc')
                ->first();

            $previousPlanId = null;
            if ($previousSub && $eventType === 'plan_changed') {
                $previousPlanId = $previousSub->plan_id;

                // Determine if upgrade or downgrade
                $oldPlan = DB::connection($this->connection)
                    ->table('organization_plans')
                    ->where('id', $previousSub->plan_id)
                    ->first();
                $newPlan = DB::connection($this->connection)
                    ->table('organization_plans')
                    ->where('id', $sub->plan_id)
                    ->first();

                if ($oldPlan && $newPlan) {
                    if ($newPlan->price_monthly > $oldPlan->price_monthly) {
                        $eventType = 'plan_upgraded';
                    } elseif ($newPlan->price_monthly < $oldPlan->price_monthly) {
                        $eventType = 'plan_downgraded';
                    }
                }
            }

            // For replaced subscriptions, determine if it was a renewal or change
            if ($sub->status === 'replaced' && !$previousSub) {
                $eventType = 'plan_assigned';
            } elseif ($sub->status === 'replaced' && $previousSub && $previousSub->plan_id === $sub->plan_id) {
                $eventType = 'subscription_renewed';
                $previousPlanId = null;
            }

            // Check if this is a renewal (same plan, after a replaced subscription)
            if ($sub->status === 'active' && $previousSub && $previousSub->plan_id === $sub->plan_id && $previousSub->status === 'replaced') {
                $eventType = 'subscription_renewed';
                $previousPlanId = null;
            }

            DB::connection($this->connection)->table('organization_subscription_history')->insert([
                'organization_id' => $sub->organization_id,
                'plan_id' => $sub->plan_id,
                'previous_plan_id' => $previousPlanId,
                'event_type' => $eventType,
                'status' => $sub->status,
                'billing_period' => $sub->billing_period,
                'amount' => $sub->amount,
                'started_at' => $sub->starts_at,
                'ended_at' => $sub->ends_at,
                'changed_by' => 'System (backfill)',
                'metadata' => json_encode(['backfilled' => true, 'original_subscription_id' => $sub->id]),
                'created_at' => $sub->created_at,
                'updated_at' => $sub->updated_at ?? $sub->created_at,
            ]);
        }
    }

    public function down(): void
    {
        DB::connection($this->connection)
            ->table('organization_subscription_history')
            ->where('changed_by', 'System (backfill)')
            ->delete();
    }
};
