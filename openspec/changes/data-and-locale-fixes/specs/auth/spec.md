## MODIFIED Requirements

### Requirement: Mail service
The system SHALL provide a `MailService` interface with three implementations: `SmtpMailService` (nodemailer transport configured from `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`), `LogMailService` (used when `MAIL_HOST` is unset; renders the same message to the app logger for local/dev parity), and a test double. Messages SHALL be **Arabic by default** with an RTL-safe HTML body (`dir="rtl"`, `lang="ar"`) plus a plain-text fallback, safe for Arabic characters; the template mechanism SHALL remain swappable per-language (Arabic default, French retained) so other locales can be added later. The interface SHALL cover `sendVerificationEmail` and `sendPasswordReset`.

#### Scenario: SMTP provider sends an RTL-safe HTML message
- **WHEN** `MAIL_HOST` is set and a verification/reset email is requested with the default Arabic locale
- **THEN** `SmtpMailService` sends the message through nodemailer with `MAIL_FROM`, an Arabic subject, an RTL-safe HTML body, and the plain-text Arabic fallback

#### Scenario: Fallback logs the Arabic plain-text body
- **WHEN** `MAIL_HOST` is unset and an email is requested
- **THEN** `LogMailService` renders the same Arabic plain-text body (no HTML) into the logger and does not attempt an SMTP connection

#### Scenario: Locale remains swappable
- **WHEN** a non-default locale is selected for a mail template
- **THEN** the rendered subject, HTML body, and plain-text body are produced from that locale's templates without changing the `MailService` contract