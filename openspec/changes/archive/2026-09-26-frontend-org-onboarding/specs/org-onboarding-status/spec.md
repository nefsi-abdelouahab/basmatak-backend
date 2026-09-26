## ADDED Requirements

### Requirement: Post-registration pending-review state
Registration stays minimal in F1 (`POST /auth/register/organization` with `{email, password, phone?}`, auto-login). This change SHALL present the neutral "Pending review" state showing `ORG-<registryId>` from the organization record, with next-step CTAs to Email Verification and then the verification dossier.

#### Scenario: Fresh org sees pending review
- **WHEN** an org completes minimal registration and is auto-logged in
- **THEN** the system shows "Pending review" with `ORG-<registryId>` and CTAs to verify email and open the dossier

### Requirement: Email-verification gate before dossier
The dossier upload and submit actions SHALL be guarded by email-verified status. When the backend returns 403 `EMAIL_NOT_VERIFIED` (or the account shows unverified), the UI SHALL redirect to F1's Email Verification screen first and SHALL NOT attempt uploads.

#### Scenario: Unverified org gated to email verification
- **WHEN** an unverified org opens the dossier route or submits
- **THEN** the system redirects to the Email Verification screen with a CTA to return afterward

#### Scenario: Verified org proceeds
- **WHEN** a verified org opens the dossier route
- **THEN** the system renders the upload UI with no gate interruption
