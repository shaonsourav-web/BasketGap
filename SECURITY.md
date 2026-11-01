# Security Policy

## Reporting a vulnerability

Please report security problems privately through GitHub private vulnerability reporting:

https://github.com/shaonsourav-web/BasketGap/security/advisories/new

You can also reach it from the repository's Security tab by choosing "Report a vulnerability". Please do not open a public issue or pull request for a suspected vulnerability.

Include, where you can:

- What the problem is and which package or file it affects.
- Steps to reproduce, or a proof of concept using synthetic data.
- The impact you expect.

Do not include real credentials, personal information, or retailer content in a report.

## What to expect

This is a small, volunteer-run project. Reports are read and acknowledged as soon as the maintainer is able, and there is no guaranteed response time. If the report is valid, a fix will be prepared privately and disclosed with credit to you unless you prefer to stay anonymous.

## Supported versions

BasketGap has no tagged releases yet. Only the latest commit on `main` is supported.

## Scope

In scope: the code in this repository, including the API in `packages/api`, the matching engine in `packages/shared`, the workers in `packages/workers`, and the mobile app in `packages/mobile`.

Out of scope: vulnerabilities in third-party services (Supabase, Vercel, Upstash, Google, OpenAI, Coles, Woolworths) that are not caused by how this project uses them. Report those to the vendor.

## If you find a leaked secret

If you find a credential in this repository or its history, report it privately through the link above so it can be revoked and rotated.
