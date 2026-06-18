# Contributing to vSME

> 🇬🇧 English (you are here) · 🇻🇳 Tiếng Việt: [CONTRIBUTING.vi.md](CONTRIBUTING.vi.md).

Thank you for your interest! The project welcomes ideas, bug reports, and pull
requests.

## Before you start

- vSME uses a **source-available** license ([LICENSE](LICENSE)) — not open source.
- All contributions are governed by the **Contributor License Agreement (CLA)** —
  see [CLA.md](CLA.md). On your first Pull Request, the CLA bot will ask you to
  sign once.

## Workflow

1. **Open an issue first** for large changes to align on direction.
2. Fork → create a branch off `main` (named `feat/...` or `fix/...`).
3. Set up and run the project per [CLAUDE.md](CLAUDE.md) (pnpm + turbo).
4. Before committing:
   - `pnpm db:check` — ensure the DB matches the schema.
   - `pnpm type-check` — no type errors.
5. Commit using Conventional Commits (`feat:`, `fix:`, `docs:`...).
6. Open a Pull Request clearly describing the change and the reason.

## Contributor rights & obligations

**You keep the copyright** to the code you write. Through the CLA you **license**
(not assign) to the Project Owner the right to use and re-license your
contribution, including in the commercial edition.

- You are credited in the commit history and `CONTRIBUTORS.md`.
- Contributions are released under the project's license.
- Submitting a PR does **not** create co-ownership of the product or any financial
  entitlement. Any maintainer/revenue-share arrangement is discussed separately,
  outside this CLA.

## Reporting security issues

Do not open public issues for vulnerabilities. Email **vuna.aid@gmail.com**
privately.
