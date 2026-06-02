# IELTS Practice Platform

**IELTS Practice Platform** is a web-based examination and learning environment designed to support structured IELTS preparation through secure test delivery, controlled access to practice materials, server-side scoring, and a modular foundation for future analytics and feedback workflows.

The project is built by **Nguyễn Đức Đạt**, a student at the **University of Science, Vietnam National University Ho Chi Minh City (HCMUS)**.

## Overview

This platform is conceived as an academically oriented digital practice system for IELTS learners. Its primary objective is to provide a reliable environment in which users can access curated practice tests, complete exam attempts under timed conditions, submit answers safely, and receive result summaries without exposing protected scoring data to the client.

The system emphasizes correctness, security, and maintainability. Test payloads, answer keys, attempt lifecycle, access control, and scoring responsibilities are deliberately separated so that the user interface remains a rendering and interaction layer, while sensitive evaluation logic remains on the server.

## Core Capabilities

- Public product and test catalogue for IELTS practice content.
- Protected exam access flow with free, locked, and unlocked test states.
- Timed exam runner with reload-safe attempt lifecycle.
- Reading question components for common IELTS interaction patterns, including gap filling, multiple choice, true/false/not given, yes/no/not given, and matching questions.
- Server-side answer submission and scoring pipeline.
- Supabase-backed authentication, database access control, and row-level security policies.
- Local verification scripts for database, access boundary, and scoring regression checks.

## Technical Architecture

The application is implemented with a modern full-stack TypeScript architecture:

- **Next.js** for routing, server-rendered pages, API routes, and frontend delivery.
- **React** for interactive examination interfaces and controlled answer components.
- **Supabase** for authentication, PostgreSQL storage, access policies, and local development workflows.
- **PostgreSQL Row-Level Security** to enforce data isolation and prevent direct client access to protected resources.
- **TypeScript** to maintain strong contracts across UI, API, and domain logic.

The architecture follows a security-first boundary:

1. The browser renders only safe exam payloads.
2. Correct answers and answer keys are never sent to the client.
3. Exam timing and scoring are owned by the server.
4. Attempts are written through controlled API routes, not direct client table writes.
5. Access checks are performed before premium or protected payloads are returned.

## Project Principles

This project is developed around several engineering principles:

- **Source-of-truth discipline:** schema, API behavior, access control, and scoring logic are treated as explicit contracts.
- **Server-side authority:** sensitive state transitions, scoring, and protected data access are handled on the backend.
- **Evidence-based development:** major changes are verified through type checks, production builds, database verification, and smoke tests.
- **Modular evolution:** Reading, Listening, Writing, result review, payment, and administrative features are planned as separable modules.
- **Academic usability:** the exam interface is designed to be clear, focused, and suitable for repeated practice under realistic constraints.

## Development Status

The current foundation includes catalogue browsing, exam access control, attempt lifecycle handling, reading question rendering, and server-side scoring for reading submissions. Additional modules such as Listening audio workflows, Writing evaluation, result review, payment or redemption flows, and administrative tooling are intended to extend the platform in later phases.

## Getting Started

Install dependencies:

```bash
npm install
```

Run type checking:

```bash
npm run typecheck
```

Build the application:

```bash
npm run build
```

Run database verification:

```bash
npm run db:verify
```

Local Supabase setup requires a valid environment configuration and a running Supabase local stack.

## Repository Note

This repository contains the application source code and public project documentation suitable for version control. Operational planning documents, local task prompts, secrets, generated build output, and local development artifacts are intentionally excluded.

