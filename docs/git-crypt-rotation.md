# git-crypt Rotation

This repo stores the canonical `.env` file encrypted with `git-crypt`.
The GitHub Actions workflows decrypt it with the `GIT_CRYPT_KEY` repository secret.

## Routine Refresh

Use this when you want to replace the GitHub secret value with a fresh copy of the current repo key:

1. Export the repo key from a trusted clone.
2. Base64-encode the exported key.
3. Replace the `GIT_CRYPT_KEY` GitHub repository secret.
4. Re-run CI and Pages to confirm the unlock step still works.

This is a secret refresh, not a cryptographic rekey.

## Compromise Response

If the repo key is suspected to be exposed:

1. Treat it as a credential incident.
2. Remove or rotate any downstream credentials that might be exposed in `.env`.
3. Rebuild the encrypted `.env` from trusted local source material.
4. Reinitialize `git-crypt` on a fresh branch or re-encrypt the file set as needed.
5. Update the `GIT_CRYPT_KEY` secret.
6. Ask collaborators to refresh their local unlock key files.

## Validation

After any rotation action, verify:

- `git-crypt unlock` succeeds locally
- `scripts/audit_git_crypt.py` passes
- CI and Pages can read the unlocked `.env`
