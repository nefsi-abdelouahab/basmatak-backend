# Who Can Do What

This table summarizes the intended permissions. Exact enforcement happens on the server.

| Action | Visitor (not signed in) | Volunteer | Organization |
|---|---|---|---|
| Explore public opportunities | Yes | Yes | Yes |
| View public profiles and talents | Yes | Yes | Yes |
| View public verified experiences | Yes | Yes | Yes |
| Manage own profile | No | Yes | Yes (organization profile) |
| Publish an opportunity | No | No | Yes |
| Apply to an opportunity | No | Yes | No |
| Review applications and select volunteers | No | No | Yes |
| Carry out tasks | No | Yes | No |
| Submit a contribution | No | Yes | No |
| Review and verify a contribution | No | No | Yes |
| Receive Verified Experiences | No | Yes | No |

## Security Rules
- Actions that change data are validated on the server using the user's real signed-in session.
- The platform never trusts a user's claim about their role, and never trusts role information produced by an AI model.
- Only the organization side can verify contributions.

## Note
This matrix reflects the intended role design. If a specific permission is unclear, say that detailed permission rules are not confirmed rather than guessing.

## Common Questions
**Who can verify a contribution?**
Only the organization responsible for the activity.

**Can an organization apply to an opportunity as a volunteer?**
No. Applying is a volunteer action. An organization account is for publishing and managing opportunities.

**Why can't I do something I expected to do?**
Actions depend on your account type and a valid signed-in session. If you are not signed in, you only have visitor access.
