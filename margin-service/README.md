# Margin cloud storage

Private notebook service for the Margin reader. R2 stores the current notebook and prior revisions. Every notebook read and write requires a password-derived bearer credential, verified against a secret stored only in the hosted environment. The public configuration endpoint supplies only a salt and KDF parameters.

Runtime bindings: BUCKET (R2). Environment settings: AUTH_SALT and AUTH_VERIFIER (secret). Keep credentials, passwords, article backups, and personal annotations out of this repository.

Checks: node --test tests/cloud.test.mjs
Build: bash scripts/build.sh; node scripts/validate-artifact.mjs

The manually dispatched GitHub workflow publishes source using a temporary, project-scoped encrypted repository secret. It does not receive notebook contents or storage credentials. Production publishing remains a separate verified hosting operation.
