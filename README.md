# Markdown Issue Sync

A JavaScript GitHub Action that bi-directionally syncs Markdown roadmap/task files with GitHub Issues.

## Features

- **Markdown to Issues:** Parse a Markdown file and create issues for tasks (`- [ ] Task`). Automatically adds the issue number back to the Markdown file (`- [ ] Task #1`). Also syncs metadata like labels and assignees.
- **Issues to Markdown:** When an issue is closed or reopened, this action can update the corresponding task's checkbox in the Markdown file (`[x]` or `[ ]`).

## Setup

The fastest way to use this action is the bundled reusable workflow. Create `.github/workflows/issue-plan-sync.yml` in your consumer repository:

```yaml
name: Issue Plan Sync

on:
  push:
    branches:
      - main
    paths:
      - 'ROADMAP.md'
  issues:
    types: [closed, reopened]

jobs:
  sync:
    uses: JDoro/markdown-issue-sync/.github/workflows/sync.yml@v1
    with:
      file_path: 'ROADMAP.md'
```

That's it. The reusable workflow handles permissions (`contents: write`, `issues: write`), concurrency guarding, checkout, the token, and picking the right sync direction for each trigger.

### How Direction Is Auto-Detected

When the `direction` input is omitted, the action infers it from the triggering event:

- `push`, `workflow_dispatch`, `schedule` → `to-issues`
- `issues` (`closed`/`reopened`) → `to-markdown`
- `issues` with other actions (e.g. `opened`, `labeled`) → skipped with a notice; no sync runs
- anything else → the run fails with an error explaining the supported events

Set `direction` explicitly to override auto-detection.

### Custom Token

The reusable workflow uses the caller's `github.token` by default. To use a different token (e.g. a PAT), pass it as a secret:

```yaml
jobs:
  sync:
    uses: JDoro/markdown-issue-sync/.github/workflows/sync.yml@v1
    with:
      file_path: 'ROADMAP.md'
    secrets:
      custom_token: ${{ secrets.MY_PAT }}
```

### Allowing Private Repo Access

If you are using this action from another private repository, ensure that the calling repository has access to this action repository in GitHub Actions settings (Settings -> Actions -> General -> Access). This applies to both the action and the reusable workflow.

### Advanced: Using the Action Directly

You can also call the action in your own workflow. `direction` and `github_token` are optional now; only `file_path` is required:

```yaml
jobs:
  sync:
    if: github.event_name != 'issues' || github.event.action == 'closed' || github.event.action == 'reopened'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
    concurrency:
      group: issue-plan-sync-${{ github.ref }}
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - name: Sync Markdown and Issues
        uses: JDoro/markdown-issue-sync@v1
        with:
          file_path: 'ROADMAP.md'
```

A single job handles both directions: pushes of the Markdown file sync to issues, and issue close/reopen events sync back to the Markdown checkboxes. Commit messages produced by the action include `[skip ci]`, so the push-backs never trigger the workflow again.

### Development and Building

Because this is a JavaScript action, the code in `src/` must be compiled into `dist/index.js` before it can be run by GitHub Actions. If you make any changes to the source code, you must run `npm run build` and commit the updated `dist/` directory.

## Markdown Syntax Example

```markdown
## Phase 1: Core Engine

- [ ] Implement robust token authentication
  - **Labels:** \`security\`, \`backend\`
  - **Assignees:** \`@username\`
  - **Priority:** `High`
  - **Estimate:** `5`
  - **Depends on:** `#2, #3`
  - <details><summary>Details</summary>
    Support JWT authentication and refresh tokens via secure HTTP-only cookies.
    Include test coverage for token expiration scenarios.
    </details>
```

When pushed, this will create an issue, add labels and assignees, include the `details` content in the issue body, and append `#<issue_number>` to the Markdown task list.
