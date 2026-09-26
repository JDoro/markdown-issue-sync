# Markdown Issue Sync

A zero-dependency JavaScript GitHub Action that bi-directionally syncs Markdown roadmap/task files with GitHub Issues.

## Features

- **Zero-Dependency Engine:** Uses only Node.js built-ins (`node:fs`, `node:crypto`, `node:test`) and runs instantly via `actions/github-script`. No npm installs, build steps, or `node_modules` vulnerabilities.
- **Markdown to Issues:** Parse a Markdown file and create issues for tasks (`- [ ] Task`). Automatically adds the issue number back to the Markdown file (`- [ ] Task #1`). Also syncs metadata like labels and assignees.
- **Issues to Markdown:** When an issue is closed or reopened, this action updates the corresponding task's checkbox in the Markdown file (`[x]` or `[ ]`).
- **Resilient Content Syncing:** Content hashes are securely embedded within hidden metadata (`<!-- markdown-issue-sync: ... -->`) in your issues, ensuring updates only trigger when task titles or details actually change.
- **Agentic Context Awareness:** Sub-issues are automatically nested using GitHub's sub-issue API based on Markdown indentation. Optional YAML frontmatter (`---`) lets you prepend broad context, defaults, and instructions to all child issues.
- **Idempotency Guard & Dry Run:** Dry-run modes generate structured outputs mapping planned operations without API side-effects, whilst built-in recovery catches orphaned tasks before recreating issues.

## Usage

Simply invoke the composite action. `github_token` and `file_path` are required.

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
        uses: JDoro/markdown-issue-sync@main
        with:
          file_path: 'ROADMAP.md'
          github_token: ${{ secrets.GITHUB_TOKEN }}
          dry_run: 'false'
```

### Action Outputs

The action exposes the following outputs containing stringified JSON arrays of issue numbers processed:
- `created_issues`
- `updated_issues`
- `closed_issues`
- `reopened_issues`

When the action completes, a detailed Job Summary table will appear in your GitHub Actions dashboard showing these metrics.

## Markdown Syntax Example

### YAML Frontmatter Config (Optional)

At the very top of your file, you can specify default labels, assignees, and context that applies to every task.

```yaml
---
default_labels: [enhancement, v2]
default_assignees: [JDoro]
context_footer: |
  **Project Goal:** Launch MVP by Q4.
  Refer to architectural docs before opening PRs.
---
```

### Task Lists and Metadata

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
  - [ ] Support child tokens
    - **Labels:** \`sub-issue\`
```

When pushed, this creates an issue, adds the labels/assignees/details, includes the context footer, links the indented tasks as native sub-issues, and appends `#<issue_number>` to the Markdown tasks. Code fences (` ``` ` or `~~~`) will be safely ignored.
