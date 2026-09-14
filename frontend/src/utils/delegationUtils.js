import { getUser } from "./auth";

/**
 * Checks if the current user has rejected a delegation for this task or deliverable.
 *
 * @param {Object} item - The task or deliverable object
 * @param {Object} [currentUser] - The currently logged-in user (optional, falls back to getUser())
 * @returns {boolean}
 */
export function isDelegationRejectedByMe(item, currentUser) {
  if (!item) return false;
  if (item.is_delegation_rejected_by_me) return true;

  const user = currentUser || getUser();
  if (!user || !user.id) return false;
  const currentUserId = parseInt(user.id, 10);

  const chain = Array.isArray(item.delegation_chain)
    ? item.delegation_chain
    : (Array.isArray(item.transfer_chain) ? item.transfer_chain : []);

  if (!chain || chain.length === 0) return false;

  const myDelegations = chain.filter((d) => {
    const toId = parseInt(d?.delegated_to ?? d?.user_id ?? d?.to_user_id, 10);
    return toId === currentUserId;
  });

  if (myDelegations.length === 0) return false;

  const latestMyDelegation = myDelegations[myDelegations.length - 1];
  const isRejected = String(latestMyDelegation?.status || "").toLowerCase() === "rejected";

  if (!isRejected) return false;

  // If item explicitly has current_owner assigned back to me, then it is active on me
  if (item.current_owner != null && parseInt(item.current_owner, 10) === currentUserId) {
    return false;
  }

  return true;
}

/**
 * Checks if a delegation intended for the current user was revoked by the delegator/assigner.
 *
 * @param {Object} item - The task or deliverable object
 * @param {Object} [currentUser] - The currently logged-in user (optional, falls back to getUser())
 * @returns {boolean}
 */
export function isDelegationRevokedFromMe(item, currentUser) {
  if (!item) return false;
  if (item.is_delegation_revoked_from_me) return true;

  const user = currentUser || getUser();
  if (!user || !user.id) return false;
  const currentUserId = parseInt(user.id, 10);

  const chain = Array.isArray(item.delegation_chain)
    ? item.delegation_chain
    : (Array.isArray(item.transfer_chain) ? item.transfer_chain : []);

  if (!chain || chain.length === 0) return false;

  const myDelegations = chain.filter((d) => {
    const toId = parseInt(d?.delegated_to ?? d?.user_id ?? d?.to_user_id, 10);
    return toId === currentUserId;
  });

  if (myDelegations.length === 0) return false;

  const latestMyDelegation = myDelegations[myDelegations.length - 1];
  const isRevoked = String(latestMyDelegation?.status || "").toLowerCase() === "revoked";

  if (!isRevoked) return false;

  // If item explicitly has current_owner assigned back to me, then it is active on me
  if (item.current_owner != null && parseInt(item.current_owner, 10) === currentUserId) {
    return false;
  }

  return true;
}

/**
 * Checks if there is a pending delegation to the current user.
 *
 * @param {Object} item - The task or deliverable object
 * @param {Object} [currentUser] - The currently logged-in user (optional, falls back to getUser())
 * @returns {boolean}
 */
export function isDelegationPendingForMe(item, currentUser) {
  if (!item) return false;
  const user = currentUser || getUser();
  if (!user || !user.id) return false;
  const currentUserId = parseInt(user.id, 10);

  if (item.pending_delegation) {
    const toId = parseInt(item.pending_delegation.delegated_to ?? item.pending_delegation.user_id, 10);
    if (toId === currentUserId && String(item.pending_delegation.status || "").toLowerCase() === "pending") {
      return true;
    }
  }

  const chain = Array.isArray(item.delegation_chain)
    ? item.delegation_chain
    : (Array.isArray(item.transfer_chain) ? item.transfer_chain : []);

  const pending = chain.find((d) => {
    const toId = parseInt(d?.delegated_to ?? d?.user_id ?? d?.to_user_id, 10);
    return toId === currentUserId && String(d?.status || "").toLowerCase() === "pending";
  });

  return Boolean(pending);
}


