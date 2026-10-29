# Accounts and Sessions

## Two Account Types

The platform has two account types: Volunteer and Organization. The type is chosen at registration and cannot be changed later.

## Registration and Sign-In

- Registration uses an email address and a password.
- The password must be between 8 and 72 characters.
- A phone number is optional.
- The account type is fixed by the registration route.
- Signing in returns an access token and a refresh token.

## Email Verification

Registration sends a verification email. The email address can be verified from the message. Changing the email address requires verification again.

## Session Lifetime

- An access token is valid for 15 minutes.
- A refresh token is valid for 30 days.
- A refresh rotates the session and returns a new pair of tokens.
- Reusing an old refresh token revokes all sessions for the account.

## Managing Sessions

A signed-in user can:

- See their own sessions, including device information and which session is current.
- Log out the current session.
- Log out all sessions.
- Log out all other sessions while keeping the current one.

## Passwords

- When a password is forgotten, a reset message can be requested.
- Resetting the password revokes all sessions.
- Changing the password keeps the current session and revokes the others.

## Common Questions

**How do I create an account?**
Choose the Volunteer or Organization account type at registration, provide an email address and a password, and verify the email address.

**Can I change my account type?**
No. It is fixed at registration.

**What do I sign in with?**
An email address and a password.

**What is the minimum password length?**
8 characters. The maximum is 72.

**Is a phone number required?**
No. It is optional.

**How long does an access token last?**
15 minutes.

**How long does a refresh token last?**
30 days.

**Can I see where I am signed in?**
Yes. The sessions list shows device information and marks the current session.

**Can I sign out of other devices?**
Yes. Logging out other sessions keeps the current one active.

**Does resetting my password sign me out everywhere?**
Yes. All sessions are revoked.
