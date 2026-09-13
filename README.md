# Markdown Issue Sync

A GitHub Composite Action that bi-directionally syncs Markdown roadmap/task files with GitHub Issues.

## Features

- **Markdown to Issues:** Parse a Markdown file and create issues for tasks (`- [ ] Task`). Automatically adds the issue number back to the Markdown file (`- [ ] Task #1`). Also syncs metadata like labels and assignees.
- **Issues to Markdown:** When an issue is closed or reopened, this action can update the corresponding task's checkbox in the Markdown file (`[x]` or `[ ]`).

## Setup

Since this is a composite action, it can be referenced in your workflow like so:

```yaml
uses: owner/markdown-issue-sync@v1
with:
  file_path: 'ROADMAP.md'
  direction: 'to-issues'
  github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Allowing Private Repo Access

If you are using this action from another private repository, ensure that the calling repository has access to this action repository in GitHub Actions settings (Settings -> Actions -> General -> Access).

## Usage Examples

Create `.github/workflows/issue-plan-sync.yml` in your consumer repository:

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

permissions:
  contents: write
  issues: write

# Important: Prevent race conditions when pushing back to the repo
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  sync_to_issues:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync Markdown to Issues
        uses: owner/markdown-issue-sync@v1
        with:
          file_path: 'ROADMAP.md'
          direction: 'to-issues'
          github_token: ${{ secrets.GITHUB_TOKEN }}

  sync_to_markdown:
    if: github.event_name == 'issues'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync Issues to Markdown
        uses: owner/markdown-issue-sync@v1
        with:
          file_path: 'ROADMAP.md'
          direction: 'to-markdown'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

## Markdown Syntax Example

```markdown
## Phase 1: Core Engine

- [ ] Implement robust token authentication
  - **Labels:** \`security\`, \`backend\`
  - **Assignees:** \`@username\`
  - <details><summary>Details</summary>
    Support JWT authentication and refresh tokens via secure HTTP-only cookies.
    Include test coverage for token expiration scenarios.
    </details>
```

When pushed, this will create an issue, add labels and assignees, include the `details` content in the issue body, and append `#<issue_number>` to the Markdown task list.
