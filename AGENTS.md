# Repository Instructions

## VM Deployment Order

- Test the changes, commit them, and push them to GitHub before deploying to a VM or production server.
- Verify that the exact deployment commit is present on the remote branch. If the push fails, stop deployment.
- Deploy runtime files from that verified commit, not uncommitted local changes.
- Back up the current deployment and verify deployed file hashes and service health afterward.
- Preserve unrelated VM changes, configuration, caches, and music. Do not modify or restart Navidrome unless explicitly requested.
- This deployment rule does not prevent local development or testing.

## Commit Privacy

- Use `BASF2HD <basf2hd@users.noreply.github.com>` for both author and committer on agent-created commits.
- Do not publish the user's real name, personal email, credentials, or private local paths.
