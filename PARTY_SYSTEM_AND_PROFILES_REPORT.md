# Party System and Account Profiles — Update Report

**Project:** Project Voting System  
**Report date:** 22 October 2026  
**Scope:** Election party management, party voting/results, and candidate, voter, and administrator profiles.

## Executive summary

The voting system now supports election-specific parties that group candidates into teams, present party information on the ballot and profile directory, and report vote totals across positions. Administrators can create parties, assign candidates, and manage party information. Vote records retain the candidate's party at the time the vote is cast, so a later membership change does not rewrite the historical party result.

Profiles were added for all three account types: candidates, voters, and administrators. Depending on account type, users can display a profile photo and personal details; candidates and administrators can also provide social links. Candidates can see their own vote count and, when affiliated with a party, its election-wide vote count. A signed-in profile directory lets election participants view available profiles.

## 1. Party system

### What parties represent

- A party is a team of candidates competing together in **one election**.
- Each candidate can be assigned to at most one party, or remain **Independent / no party**.
- Party information includes a name, color, slogan, platform or ideas, and optional logo.
- Party membership and totals are scoped to the election; party names must be unique within that election.

### Administrator workflow

Administrators can create, edit, and delete parties from the election administration page. The party editor captures the party name, platform, slogan, and color; a logo can be uploaded from the administrator's device. Administrators can assign a party while adding a candidate or change the candidate's party later.

The administration interface also displays the candidate count for each party. A party with recorded votes cannot be deleted, protecting election results from being invalidated. Candidates assigned to a deleted party, when deletion is allowed, become unassigned through the database relationship.

### Ballot and public-facing presentation

For each candidate, the ballot can show their name, photo, party name and color, party logo, slogan, and platform. Candidates without a party are identified as independent. These details also appear on candidate profiles in the profile directory.

### Vote attribution and results

- A vote stores both the selected candidate and the party associated with that candidate when the vote is cast.
- Party totals aggregate votes across positions and include a breakdown by position.
- Candidate results remain available per position; party totals supplement rather than replace them.
- Party totals are included in administrator live results and public results when the election's results visibility settings allow access.
- The candidate account shows the candidate's own vote count and the current total for their party across positions.

This snapshot approach means reassignment after votes have been cast does not move those existing votes to a different party in the historical party totals.

### Decisions and boundaries

- Existing candidates are not automatically assigned to a party; administrators can assign them as needed.
- Party membership is election-scoped.
- The party platform field represents a team's ideas or cause.
- The system does **not** currently track campaign costs, budgets, or spending.

## 2. Account profiles

### Candidate profiles

Candidate accounts have a sign-in dashboard showing the candidate's name, position, election, profile information, current candidate vote count, and party details when applicable. Candidates can update their profile bio and social links, upload or remove their profile photo, and see their party's total votes when affiliated with one.

The candidate's campaign photo and profile photo serve different purposes: the campaign photo can be shown with their ballot listing, while the profile photo represents their account in the profile directory and account dashboard.

### Voter profiles

The voter account displays the voter's name, student ID, and section/grade information. Voters can update their bio and profile photo, restore the default photo, and change their voter code. The account continues to show voting status and, where applicable, the voter's own voting record.

### Administrator profiles

Administrators can set a display name, profile bio, social links, and profile photo. The profile card reflects the administrator's name and role. Administrator profiles are included in the election profile directory.

### Shared profile directory

Signed-in voters and candidates can view a directory containing candidate, voter, and administrator profiles. Candidate entries can include party affiliation and public party information. Each directory entry can show the account's profile photo, bio, and supported social links.

## 3. Image uploads

Image entry for profile photos, candidate photos, party logos, and election logos uses device-based file uploads rather than asking administrators to enter an image URL.

- Accepted formats: **JPEG and PNG**.
- Maximum file size: **25 MB**.
- Profile photos can be reset to the application's default avatar.
- Upload bytes and MIME type are stored in PostgreSQL; image routes return the stored image.
- Upload endpoints validate the content type and image signature, rather than relying only on the browser-provided file name or type.
- Party and candidate image reads are election-scoped.
- Legacy URL values remain available as read fallbacks for older records; new image entry is through file upload controls.

## 4. Data and implementation overview

The changes extend the existing PostgreSQL model:

- `parties` stores election-specific party details.
- `candidates.party_id` links a candidate to a party when assigned.
- `votes.party_id` records party attribution at vote time.
- Profile fields store bio, social-link data, and profile-photo data for the relevant account types.
- Candidate photos and party/election logos have their own binary-image and MIME-type fields.

The application exposes account-specific profile APIs, administrator party-management routes, and public election/result data needed by the ballot and results pages. The additive database migrations are applied during application startup and are designed to be repeatable.

## 5. Validation performed

Project checks performed during implementation included:

- JavaScript syntax checks for the affected server and browser scripts.
- Repeat application of database migrations to check idempotence.
- Transactional PostgreSQL checks for image storage, image URL shaping, party/candidate relationships, and profile-directory query compatibility.
- Image validation checks confirming JPEG and PNG signatures are accepted while WebP is rejected.
- Browser-form wiring checks for administrator controls.
- Party vote attribution and total calculation checks, including preserving the party recorded when the vote was cast.

These checks exercise application logic and database queries; they are not a substitute for a full end-to-end usability test in a deployed environment.

## 6. Related project files

### Party system and results

- [db/init.sql](./db/init.sql)
- [db/migrations/20261020_account_profiles.sql](./db/migrations/20261020_account_profiles.sql)
- [src/routes/admin.js](./src/routes/admin.js)
- [src/routes/vote.js](./src/routes/vote.js)
- [src/party-results.js](./src/party-results.js)
- [src/routes/results.js](./src/routes/results.js)
- [src/routes/admins.js](./src/routes/admins.js)
- [db/migrations/20261021_local_image_uploads.sql](./db/migrations/20261021_local_image_uploads.sql)
- [public/admin.html](./public/admin.html)
- [public/js/admin.js](./public/js/admin.js)
- [public/js/voter.js](./public/js/voter.js)
- [public/js/results.js](./public/js/results.js)

### Profiles and image uploads

- [src/profile.js](./src/profile.js)
- [src/avatar.js](./src/avatar.js)
- [src/routes/candidate.js](./src/routes/candidate.js)
- [src/routes/voter.js](./src/routes/voter.js)
- [src/routes/admins.js](./src/routes/admins.js)
- [src/routes/profiles.js](./src/routes/profiles.js)
- [public/candidate.html](./public/candidate.html)
- [public/voter.html](./public/voter.html)
- [public/js/candidate.js](./public/js/candidate.js)
- [public/js/profile-photo.js](./public/js/profile-photo.js)
- [public/js/profiles.js](./public/js/profiles.js)
- [public/default-avatar.svg](./public/default-avatar.svg)

## 7. Current limitations and possible next steps

- Party cost or budget management is not included.
- Existing candidates need administrator assignment if they should belong to a party.
- Candidate and party vote totals count votes across positions as defined by the current election data; no weighted or position-specific aggregation rules are applied.
- Social links are curated profile links rather than a messaging or follow system.
- The platform does not currently provide moderation workflows, profile privacy settings per field, or user-to-user interactions.
- A full deployment-level test should confirm that any reverse proxy, hosting provider, or request-body limit is configured to permit uploads up to 25 MB.
