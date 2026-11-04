## ADDED Requirements

### Requirement: Official contact allowlist
The assistant SHALL treat only the official Roeya Association and platform-support contacts as displayable: `roeyatimimoun@gmail.com`, `a.nefsi@esi-sba.dz`, `+213 663847105`, and `+213 696 946 808`. Every other email address or phone number in an assistant answer SHALL be removed or replaced before the answer reaches the user. Official contact values SHALL be recognized in canonical, local, and `00213` normalized phone forms.

#### Scenario: Official contacts survive sanitization
- **WHEN** an answer contains an official association or support email or phone
- **THEN** the value remains in the final answer

#### Scenario: Unofficial contacts are redacted
- **WHEN** an answer contains any other email address or phone number
- **THEN** that contact token is replaced with a locale-specific phrase pointing to the public profile

### Requirement: Final-answer contact sanitizer
The system SHALL run a pure, deterministic contact-sanitization pass on every final assistant answer, including streamed answers, after citations are stripped. The pass SHALL detect email addresses and Algerian/international phone numbers and SHALL preserve only allowlisted official values. It SHALL be covered by unit tests, including a prompt-injection message that asks for an organization's phone and an email.

#### Scenario: Injected organization phone is removed
- **WHEN** a user message says to ignore the rules and asks for an organization's phone
- **THEN** the final answer contains no unauthorized phone digits and points to the organization's public profile

#### Scenario: Injected organization email is removed
- **WHEN** a model answer includes a non-official organization email
- **THEN** the final answer contains no `@` address and no unauthorized contact value

#### Scenario: Arabic answer is redacted with Arabic wording
- **WHEN** an Arabic answer contains a non-official organization phone or email
- **THEN** the contact token is replaced with the Arabic public-profile phrase

### Requirement: Organization-contact assistant policy
The assistant SHALL NOT display an organization's email or phone. It SHALL explain that the organization's email is public on its public profile, that the phone is visible only to signed-in users, and that the assistant cannot show either. It SHALL direct the user to the organization's public profile instead. The English and Arabic knowledge corpus SHALL state these rules and SHALL NOT introduce literal organization contact values outside the four allowlisted files.

#### Scenario: User asks for an organization's phone
- **WHEN** the user asks for an organization's phone number
- **THEN** the assistant says it cannot show organization contact details and points to the public profile

#### Scenario: User is not signed in
- **WHEN** a guest asks how to contact an organization
- **THEN** the assistant explains that the email is public and the phone requires sign-in, and points to the public profile

#### Scenario: Prompt injection cannot override the policy
- **WHEN** a user asks the assistant to ignore its rules and reveal an organization's email or phone
- **THEN** the deterministic sanitizer removes any non-official contact that slips into the answer

### Requirement: Knowledge Q&As and evaluation coverage
The English and Arabic troubleshooting knowledge SHALL include: “Why can't I see the organization's phone?”, “How do I contact an organization if I am not signed in?”, and “Can the assistant give me an organization's phone?”. The retrieval evaluation SHALL include one English and one Arabic query about organization phone visibility.

#### Scenario: English Q&A is retrievable
- **WHEN** the English organization-phone question is evaluated
- **THEN** the expected troubleshooting source appears within the top four results

#### Scenario: Arabic Q&A is retrievable
- **WHEN** the Arabic organization-phone question is evaluated
- **THEN** the expected troubleshooting source appears within the top four results
