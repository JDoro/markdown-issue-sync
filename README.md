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

## Junie Reusable Workflows

This repository also includes reusable workflows for integrating [JetBrains Junie](https://plugins.jetbrains.com/plugin/22533-junie--ai-agent) into your repositories. These workflows allow Junie to operate on issue/PR comments and automate fixes for automated code review comments.

### Required repository settings and permissions

A called workflow cannot elevate the caller's `GITHUB_TOKEN` permissions, so the caller job must grant `contents: write`, `pull-requests: write` and `issues: write` (as in the examples below). For Junie to create pull requests, also enable, under **Settings > Actions > General > Workflow permissions**, "Read and write permissions" and "Allow GitHub Actions to create and approve pull requests".

> **Limitation:** Pull requests from forks are not supported. The workflows use the base repository's `github.token`, which cannot push to a fork branch, so for fork PRs they skip Junie and post a single comment (deduplicated) explaining this.

### 1. General Junie Workflow

This workflow triggers Junie whenever a user mentions `@junie-agent` in an issue or pull request comment. Only comments from users whose `author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR` trigger it. For PR comments, the PR branch is checked out.

To use it, create a file like `.github/workflows/junie.yml` in your repository:

```yaml
name: Junie

on:
  issue_comment:
    types: [created]

jobs:
  run-junie:
    permissions:
      contents: write
      pull-requests: write
      issues: write
    uses: JDoro/markdown-issue-sync/.github/workflows/reusable-junie-general.yml@main
    secrets:
      api_key: ${{ secrets.JUNIE_API_KEY }}
```

### 2. Auto-Fix Workflow

This workflow triggers Junie to automatically fix issues based on feedback left by automated bot reviewers (like `kilo-code-bot[bot]`).

To use it, create a file like `.github/workflows/junie-autofix.yml` in your repository:

```yaml
name: Junie Auto-Fix

on:
  issue_comment:
    types: [created]

jobs:
  run-junie-autofix:
    permissions:
      contents: write
      pull-requests: write
      issues: write
    uses: JDoro/markdown-issue-sync/.github/workflows/reusable-junie-autofix.yml@main
    with:
      bot_username: 'kilo-code-bot[bot]' # Optional, defaults to 'kilo-code-bot[bot]'
    secrets:
      api_key: ${{ secrets.JUNIE_API_KEY }}
```

To prevent endless review/fix loops and duplicate paid runs, the workflow:

- only reacts to PR conversation comments (`issue_comment`), never to inline review comments (`pull_request_review_comment`), so a review with N inline findings does not cause N runs;
- ignores the bot's summary comments (those containing the `<!-- kilo-review -->` marker);
- runs Junie at most once per PR head commit: before running, it looks for a `<!-- junie-autofix:<head sha> -->` marker comment and skips if present, otherwise it posts that marker. Re-reviews of an unchanged commit (e.g. unfixable findings) therefore never retrigger Junie; a new commit allows one more run;
- uses a per-PR `concurrency` group so fix runs never overlap.

## Jules Reusable Workflows

This repository also includes reusable workflows for integrating [Jules AI](https://github.com/google-labs-jules) into your projects. Jules operates by having issues created and assigned to it. These workflows provide convenient templates to programmatically assign tasks to Jules.

### Required Setup to Prevent Infinite Loops

> **WARNING:** When configuring Jules automated workflows, explicitly verify that the sender is not the bot itself before calling these templates, to prevent bot actions from triggering recursive downstream workflows and infinite loops.
> `if: ${{ github.event.sender.login != 'google-labs-jules[bot]' }}`

### 1. CI Failure Template

Creates an issue for Jules to fix a failing CI build on a specific branch.

To use it, call it from your repository's CI workflow when a job fails:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... your build/test steps ...

  notify-jules:
    needs: build
    if: ${{ failure() && github.event.pull_request && github.event.sender.login != 'google-labs-jules[bot]' }}
    uses: JDoro/markdown-issue-sync/.github/workflows/jules-ci-failure-template.yml@main
    permissions:
      issues: write
    with:
      pr_number: "${{ github.event.pull_request.number }}"
      branch_name: "${{ github.head_ref }}"
      error_log: "Check the GitHub Actions logs for details." # In practice, extract logs using steps
```

### 2. Maintenance Template

Creates an issue for Jules to perform weekly or routine maintenance, such as auditing dependencies or adding missing tests.

```yaml
name: Weekly Maintenance

on:
  schedule:
    - cron: '0 0 * * 0' # Every Sunday at midnight

jobs:
  run-maintenance:
    if: ${{ github.event.sender.login != 'google-labs-jules[bot]' }}
    uses: JDoro/markdown-issue-sync/.github/workflows/jules-maintenance-template.yml@main
    permissions:
      issues: write
    with:
      focus_area: 'recent commits, check for missing unit tests, and audit npm dependencies'
```

### 3. TDD Generate Tests Template

Creates an issue asking Jules to write failing unit tests based on a feature description, acting as the first step in a TDD workflow.

```yaml
name: Jules TDD Start

on:
  workflow_dispatch:
    inputs:
      feature_title:
        description: 'Title of the feature'
        required: true
      feature_desc:
        description: 'Description of the feature'
        required: true

jobs:
  generate-tests:
    if: ${{ github.event.sender.login != 'google-labs-jules[bot]' }}
    uses: JDoro/markdown-issue-sync/.github/workflows/jules-tdd-generate-tests-template.yml@main
    permissions:
      issues: write
    with:
      feature_title: "${{ github.event.inputs.feature_title }}"
      feature_desc: "${{ github.event.inputs.feature_desc }}"
```

### 4. TDD Implement Template

Creates an issue asking Jules to implement the logic for a PR that contains failing tests, completing the TDD cycle. It is triggered by a human adding the `tdd-implement` label to the PR (not by Jules opening or pushing to it).

> **Note:** The template does not guard against loops itself. Keep the `github.event.sender.login != 'google-labs-jules[bot]'` check in the caller, and avoid triggers like `synchronize` that Jules's own pushes would fire.

```yaml
name: Jules TDD Implement

on:
  pull_request:
    types: [labeled]

jobs:
  implement:
    # A human adds the `tdd-implement` label to the PR containing the failing tests.
    # The sender is the person who labeled, never the Jules bot, so this cannot loop.
    if: ${{ github.event.label.name == 'tdd-implement' && github.event.sender.login != 'google-labs-jules[bot]' }}
    uses: JDoro/markdown-issue-sync/.github/workflows/jules-tdd-implement-template.yml@main
    permissions:
      issues: write
    with:
      pr_number: "${{ github.event.pull_request.number }}"
      branch_name: "${{ github.head_ref }}"
```
