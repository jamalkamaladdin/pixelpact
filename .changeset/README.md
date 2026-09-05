# Changesets

Every user facing change carries a changeset: a small markdown file that names the affected
packages, the semver bump, and one sentence for the changelog.

```bash
pnpm changeset
```

Merging a pull request that contains one of these files makes the release workflow open a
version pull request. Merging that pull request publishes to npm. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for the full flow.
