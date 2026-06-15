#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function checkDeliverableWorkflow() {
  console.log('=== Checking Deliverable Workflow Implementation ===\n');

  const deliverableDetailsPath = 'frontend/src/pages/DeliverableDetails.jsx';
  const deliverableControllerPath = 'backend/app/Http/Controllers/DeliverableController.php';

  if (!fs.existsSync(deliverableDetailsPath)) {
    console.error(`❌ File not found: ${deliverableDetailsPath}`);
    return false;
  }

  const deliverableDetails = fs.readFileSync(deliverableDetailsPath, 'utf8');
  const deliverableController = fs.existsSync(deliverableControllerPath) ? fs.readFileSync(deliverableControllerPath, 'utf8') : '';

  let checksPassed = 0;
  let checksTotal = 0;

  console.log('1. Checking frontend DeliverableDetails.jsx workflow implementation...');

  if (deliverableDetails.includes('const isAssignee = deliverable && currentUser')) {
    console.log('   ✅ Assignee identification is present');
    checksPassed++;
  } else {
    console.log('   ❌ Assignee identification is missing');
  }
  checksTotal++;

  if (deliverableDetails.includes('setSubmissionLocked(true);')) {
    console.log('   ✅ Submission lock state management is present');
    checksPassed++;
  } else {
    console.log('   ❌ Submission lock state management is missing');
  }
  checksTotal++;

  if (deliverableDetails.includes('submissionLocked && deliverable.status !== "rejected"')) {
    console.log('   ✅ Submit button disabled logic is present');
    checksPassed++;
  } else {
    console.log('   ❌ Submit button disabled logic is missing');
  }
  checksTotal++;

  if (deliverableDetails.includes('showSubmitForm || (deliverable.status === "rejected" && isAssignee))')) {
    console.log('   ✅ Rejected status allows assignee to resubmit');
    checksPassed++;
  } else {
    console.log('   ❌ Rejected status allows assignee to resubmit is missing');
  }
  checksTotal++;

  if (deliverableDetails.includes('deliverable.status === "rejected" && isAssignee && deliverable.rejection_comment')) {
    console.log('   ✅ Rejection info only shown to assignee');
    checksPassed++;
  } else {
    console.log('   ❌ Rejection info only shown to assignee is missing');
  }
  checksTotal++;

  console.log('\n2. Checking backend DeliverableController workflow implementation...');

  if (deliverableController.includes('public function submit(Request $request, Deliverable $deliverable)')) {
    console.log('   ✅ Submit API endpoint is present');
    checksPassed++;
  } else {
    console.log('   ❌ Submit API endpoint is missing');
  }
  checksTotal++;

  if (deliverableController.includes('public function approve(Request $request, Deliverable $deliverable)')) {
    console.log('   ✅ Approve API endpoint is present');
    checksPassed++;
  } else {
    console.log('   ❌ Approve API endpoint is missing');
  }
  checksTotal++;

  if (deliverableController.includes('public function reject(Request $request, Deliverable $deliverable)')) {
    console.log('   ✅ Reject API endpoint is present');
    checksPassed++;
  } else {
    console.log('   ❌ Reject API endpoint is missing');
  }
  checksTotal++;

  if (deliverableController.includes("'status' => 'submitted',")) {
    console.log('   ✅ Status transition to submitted is present');
    checksPassed++;
  } else {
    console.log('   ❌ Status transition to submitted is missing');
  }
  checksTotal++;

  if (deliverableController.includes("'status' => 'approved',")) {
    console.log('   ✅ Status transition to approved is present');
    checksPassed++;
  } else {
    console.log('   ❌ Status transition to approved is missing');
  }
  checksTotal++;

  if (deliverableController.includes("'status' => 'rejected',")) {
    console.log('   ✅ Status transition to rejected is present');
    checksPassed++;
  } else {
    console.log('   ❌ Status transition to rejected is missing');
  }
  checksTotal++;

  console.log('\n3. Checking API routes...');

  const routesPath = 'backend/routes/api.php';
  if (fs.existsSync(routesPath)) {
    const routes = fs.readFileSync(routesPath, 'utf8');
    if (routes.includes('/deliverables/{deliverable}/submit')) {
      console.log('   ✅ Submit route is present');
      checksPassed++;
    } else {
      console.log('   ❌ Submit route is missing');
    }
    checksTotal++;

    if (routes.includes('/deliverables/{deliverable}/approve')) {
      console.log('   ✅ Approve route is present');
      checksPassed++;
    } else {
      console.log('   ❌ Approve route is missing');
    }
    checksTotal++;

    if (routes.includes('/deliverables/{deliverable}/reject')) {
      console.log('   ✅ Reject route is present');
      checksPassed++;
    } else {
      console.log('   ❌ Reject route is missing');
    }
    checksTotal++;
  } else {
    console.log('   ❌ Routes file not found');
    checksTotal += 3;
  }

  console.log('\n4. Checking Task progress integration...');

  const taskControllerPath = 'backend/app/Http/Controllers/TaskController.php';
  if (fs.existsSync(taskControllerPath)) {
    const taskController = fs.readFileSync(taskControllerPath, 'utf8');
    if (taskController.includes("deliverables()->whereIn('status', ['approved'])")) {
      console.log('   ✅ Task progress calculation for approved deliverables is present');
      checksPassed++;
    } else {
      console.log('   ❌ Task progress calculation for approved deliverables is missing');
    }
    checksTotal++;
  } else {
    console.log('   ❌ TaskController not found');
    checksTotal++;
  }

  console.log('\n=== Summary ===');
  console.log(`✅ Checks passed: ${checksPassed}\n`);

  if (checksPassed === checksTotal) {
    console.log('🎉 All checks passed! Deliverable workflow implementation is complete.');
    return true;
  } else {
    console.log(`⚠️ ${checksTotal - checksPassed} checks failed. Please review the implementation.`);
    return false;
  }
}

checkDeliverableWorkflow();
