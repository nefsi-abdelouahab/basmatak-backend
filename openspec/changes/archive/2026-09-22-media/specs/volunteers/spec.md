## MODIFIED Requirements

### Requirement: Update own profile
The system SHALL expose `PATCH /volunteers/me` allowing the volunteer to update profile fields (names, biographical fields, `birthDate`, `location` with `wilayaId`/`municipalityId`, and `avatar`/`banner` media references). `username` and `userId` SHALL NOT be modifiable here. `avatar`/`banner` SHALL be validated through `MediaOwnership.assertFor` (Session 8 retrofit of the F9 seam): the mediaId SHALL reference an existing, non-deleted `media` row owned by the caller; `avatar` SHALL additionally carry `purpose=avatar`. Foreign, absent, or deleted media SHALL be rejected. Only the indicated fields SHALL change; `publicProfile` is not editable from this endpoint.

#### Scenario: Profile fields updated
- **WHEN** a volunteer patches bio, `birthDate`, and `location`
- **THEN** the profile reflects the new values and unrelated fields are unchanged

#### Scenario: malformed mediaId rejected
- **WHEN** a volunteer sends an `avatar`/`banner` value that is not a valid Mongo ObjectId
- **THEN** the request is rejected with `400`/`422`

#### Scenario: Own avatar accepted
- **WHEN** a volunteer sets `avatar` to a media row they own with `purpose=avatar` and not deleted
- **THEN** the profile is updated with that media reference

#### Scenario: Foreign media rejected
- **WHEN** a volunteer sets `avatar`/`banner` to media owned by another user
- **THEN** the request is rejected with `404`/`403` via `MediaOwnership.assertFor`

#### Scenario: Absent or deleted media rejected
- **WHEN** a volunteer sets `avatar`/`banner` to a mediaId that does not exist or is soft-deleted
- **THEN** the request is rejected via `MediaOwnership.assertFor`

#### Scenario: Wrong purpose rejected
- **WHEN** a volunteer sets `avatar` to media whose `purpose` is not `avatar`
- **THEN** the request is rejected via `MediaOwnership.assertFor`