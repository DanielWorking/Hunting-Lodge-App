# Implementation Plan: Prevent Admin Self-Deletion

## Overview
Prevent administrator users from deleting their own accounts. This requires a server-side authorization check to strictly block self-deletion, paired with client-side updates to hide the delete action for the currently authenticated user in the admin table.

## Requirements
- Prevent self-deletion of admin accounts on the server-side via context-aware JWT `sub`/`id` comparison.
- Hide the delete icon on the client-side for the currently logged-in user's row.
- Zero-bypass validation: API authorization must enforce this regardless of UI state.
- Graceful error handling without leaking schemas or stack traces.
- Add regression tests to prevent future breakage.

## Architecture Changes
- `server/controllers/usersController.js`: Integrate self-deletion block in `deleteUser`.
- `client/src/components/admin/AdminTable.tsx`: Identify logged-in user to conditionally hide the delete icon.
- `server/test/controllers.test.js`: Add specific test for self-deletion rejection.

## Implementation Steps

### Phase 1: Server-Side Enforcement (2 files)
1. **Enforce Self-Deletion Block** (File: `server/controllers/usersController.js`)
   - Action: Inside `deleteUser()`, immediately after the `isAdmin` check, compare the authenticated user's ID (`req.user._id.toString()`) with the target parameter ID (`req.params.id`). If they match, immediately return a `403 Forbidden` response with a standard error message and the code `FORBIDDEN_SELF_DELETION`.
   - Why: Provides zero-bypass context-aware validation ensuring administrators cannot accidentally or maliciously delete their own records.
   - Dependencies: None
   - Risk: Low - Safely isolated within the deletion route.

2. **Add Regression Tests** (File: `server/test/controllers.test.js`)
   - Action: Add a new test case `it("should reject self-deletion by an administrator", ...)` under the `usersController.deleteUser` block. Create a mock request where `req.user._id` matches `req.params.id` and the user has admin privileges. Assert that the controller responds with a `403` status code and `FORBIDDEN_SELF_DELETION` response code.
   - Why: Fulfills the requirement for zero-bypass regression prevention.
   - Dependencies: Step 1.
   - Risk: Low

### Phase 2: Client-Side UI Enforcement (1 file)
3. **Hide Delete Icon** (File: `client/src/components/admin/AdminTable.tsx`)
   - Action: Import `useUser` from `../../context/UserContext`. Inside the `AdminTable` component, destructure the current user using `const { user: loggedInUser } = useUser();`. In the `renderUserRow` function, modify the delete button rendering condition from `!isSuperAdmin` to `!isSuperAdmin && user._id !== loggedInUser?._id`.
   - Why: Enhances UX by preventing the user from seeing a delete option that will ultimately fail, conforming to client-side representation requirements.
   - Dependencies: None.
   - Risk: Low - Only affects UI rendering logic.

## Testing Strategy
- Unit tests: Run `server/test/controllers.test.js` to verify the `deleteUser` modifications correctly reject the self-deletion action.
- Manual testing: Log in as a standard administrator, navigate to the Admin Dashboard, verify the delete icon is missing from the logged-in user's row, and manually attempt to call the DELETE endpoint on the logged-in user ID via API to confirm `403` rejection.

## Risks & Mitigations
- **Risk**: A super admin accidentally bypasses this check if logic is misordered.
  - Mitigation: The check compares the parameter ID explicitly with the requester ID after standard admin authentication, blocking even super admins from self-deletion (though super admins are already protected by the `isSuperAdminUser` block).

## Success Criteria
- [ ] Server responds with `403 Forbidden` (`FORBIDDEN_SELF_DELETION`) if an admin tries to delete their own account.
- [ ] The delete icon is invisible for the currently logged-in user in the `AdminTable`.
- [ ] Server tests cover the self-deletion rejection specifically.
