# media Specification Change

## Purpose

Session 19 media hardening (ROADMAP lines 858+): signed read URLs and presigned upload URLs must expire within 15 minutes, and the external-link host allowlist must be immune to subdomain/suffix bypass attempts while preserving the existing allowed hosts and behavior.

## Requirements

## MODIFIED Requirements

### Requirement: External link media
The system SHALL expose `POST /media/links` (authenticated) accepting `{ url, purpose, visibility }`, creating a `media` row with `type=link` and the given `url`. The URL SHALL be validated as an `http(s)` URL whose host equals an allowlist entry (`youtube.com`, `youtu.be`, `drive.google.com`) or is a subdomain of one, with `youtu.be` matched exactly (no subdomains). Any other host, scheme, or malformed URL SHALL be rejected with `400` and business code `LINK_HOST_NOT_ALLOWED`. The caller becomes the `ownerId`.

#### Scenario: Allowed host accepted
- **WHEN** an authenticated user registers a `youtube.com` (or `youtu.be` / `drive.google.com`) link
- **THEN** a `media` row with `type=link` is created

#### Scenario: Subdomain of an allowlisted host accepted
- **WHEN** the URL host is a subdomain of an allowlisted entry (e.g. `www.youtube.com`)
- **THEN** the link is accepted

#### Scenario: Allowlist bypass attempts rejected
- **WHEN** the URL host is a look-alike suffix (e.g. `youtube.com.evil.com`), a subdomain of `youtu.be`, a foreign host, a non-`http(s)` scheme, or a malformed URL
- **THEN** the request fails with `400 LINK_HOST_NOT_ALLOWED`

#### Scenario: Disallowed host rejected
- **WHEN** the URL host is not in the allowlist
- **THEN** the request fails with `400`

### Requirement: Storage provider interface
The system SHALL define a `StorageProvider` interface with `createPresignedUpload(storageKey, mimeType)` returning a presigned upload URL, `objectMetadata(storageKey)` returning the stored object's actual mime/size (service-role metadata read), and `createSignedReadUrl(storageKey)` returning a signed read URL. Signed read URLs SHALL expire within 15 minutes (900 seconds) of issuance; presigned upload URLs SHALL expire within 15 minutes where the provider exposes an expiry knob, and their TTL SHALL be documented at the contract level otherwise. Implementations SHALL include `SupabaseStorageProvider` (default, via `@supabase/supabase-js`) and `LocalStorageProvider` (dev-only when `STORAGE_PROVIDER=local`, writing to a gitignored `./storage` directory with fake signed URLs), plus a test double usable by tests with no external credentials.

#### Scenario: Provider chosen by env
- **WHEN** `STORAGE_PROVIDER=local`
- **THEN** the `LocalStorageProvider` serves the interface
- **AND** when `STORAGE_PROVIDER=supabase` (or unset) the `SupabaseStorageProvider` serves the interface

#### Scenario: Local provider never needs credentials
- **WHEN** tests run without Supabase configuration
- **THEN** the local provider (or test double) satisfies all interface methods without network access

#### Scenario: Presigned flow shape
- **WHEN** an upload is registered
- **THEN** the provider yields a writable upload URL and, at confirm, the actual stored mime/size from object metadata

#### Scenario: Short-lived signed URLs
- **WHEN** a signed read URL (or a presigned upload URL where the provider supports expiry) is issued
- **THEN** the generated URL expires no later than 15 minutes (900 seconds) from issuance