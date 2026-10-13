# Jules Automation Setup Guide

This repository contains reusable GitHub Action workflows designed to dispatch automated tasks to the Jules AI.

## Centralized Workflows Available

- `jules-maintenance-template.yml`: Creates an issue to audit maintenance tasks.
- `jules-tdd-generate-tests-template.yml`: Creates an issue to write TDD unit tests based on a feature description.
- `jules-tdd-implement-template.yml`: Creates an issue to implement the required code to make tests pass for a given PR.
- `jules-ci-failure-template.yml`: Creates an issue to fix CI failures on a PR.

## Important Constraint
**CRITICAL**: You MUST add `if: github.event.sender.login != 'google-labs-jules[bot]'` (or similar) to any calling workflow. Since Jules creates PRs and commits code, allowing Jules to trigger these workflows can result in runaway infinite loops.

## How to Call These Reusable Workflows

### 1. Weekly Maintenance Task (Schedule Trigger)
Triggers `jules-maintenance-template.yml` on a cron schedule.

```yaml
name: Weekly Jules Maintenance
on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 9am

jobs:
  call-maintenance:
    if: "github.event.sender.login != 'google-labs-jules[bot]'"
    uses: YOUR_ORG/markdown-issue-sync/.github/workflows/jules-maintenance-template.yml@main
    with:
      focus_area: 'the recent commits, checking for missing unit tests, and auditing npm dependencies'
```

### 2. TDD Generate Tests (Issue Comment / Dispatch Trigger)
Triggers `jules-tdd-generate-tests-template.yml` via workflow dispatch.

```yaml
name: Generate Tests via Jules
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
  call-generate-tests:
    if: "github.event.sender.login != 'google-labs-jules[bot]'"
    uses: YOUR_ORG/markdown-issue-sync/.github/workflows/jules-tdd-generate-tests-template.yml@main
    with:
      feature_title: ${{ github.event.inputs.feature_title }}
      feature_desc: ${{ github.event.inputs.feature_desc }}
```

### 3. TDD Implement Logic (Pull Request Trigger)
Triggers `jules-tdd-implement-template.yml` when a PR labeled `tdd-implement` is opened.

```yaml
name: Implement TDD Logic via Jules
on:
  pull_request:
    types: [opened, labeled]

jobs:
  call-implement:
    if: "github.event.sender.login != 'google-labs-jules[bot]' && contains(github.event.pull_request.labels.*.name, 'tdd-implement')"
    uses: YOUR_ORG/markdown-issue-sync/.github/workflows/jules-tdd-implement-template.yml@main
    with:
      pr_number: ${{ github.event.pull_request.number }}
      branch_name: ${{ github.head_ref }}
```

### 4. CI Failure Auto-Fix (Workflow Run / Check Run Trigger)
Triggers `jules-ci-failure-template.yml` when a CI run fails.
*(Note: Gathering the error log requires additional steps to fetch from the failing run before passing it).*

```yaml
name: Auto-fix CI Failures via Jules
on:
  workflow_run:
    workflows: ["CI Tests"]
    types: [completed]

jobs:
  call-ci-failure:
    if: "github.event.sender.login != 'google-labs-jules[bot]' && github.event.workflow_run.conclusion == 'failure'"
    uses: YOUR_ORG/markdown-issue-sync/.github/workflows/jules-ci-failure-template.yml@main
    with:
      pr_number: ${{ github.event.workflow_run.pull_requests[0].number }}
      branch_name: ${{ github.event.workflow_run.head_branch }}
      error_log: 'Fetch this log in a prior job or pass a link.'
```
