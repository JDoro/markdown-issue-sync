## Phase 1: Foundation

- [x] Scaffold the Action Foundation #1
  - **Labels:** `core`, `setup`
  - <details><summary>Details</summary>
    Implement basic inputs in action.yml and setup package.json with dependencies.
    </details>

- [x] Core bidirectional sync #2
  - **Labels:** `backend`
  - <details><summary>Details</summary>
    Implement syncing of Markdown tasks to GitHub issues and vice-versa.
    </details>

- [x] Parser tests #3
  - **Labels:** `testing`
  - <details><summary>Details</summary>
    Write Jest tests for the regex parser to handle labels, assignees, and details extraction.
    </details>

## Phase 2: Advanced Metadata

- [ ] Milestone syncing via headings #4
  - **Labels:** `enhancement`
  - <details><summary>Details</summary>
    Automatically assign issues to milestones based on the `## Heading` section they reside under.
    </details>

- [ ] Project board v2 integration #5
  - **Labels:** `enhancement`, `projects`
  - <details><summary>Details</summary>
    Automatically link newly created issues to a GitHub project board.
    </details>

## Phase 3: Resilience

- [ ] GraphQL batching for large roadmaps #6
  - **Labels:** `performance`
  - <details><summary>Details</summary>
    Switch from REST to GraphQL API to batch issue creations and updates, avoiding rate limits.
    </details>

- [ ] Conflict resolution #7
  - **Labels:** `core`
  - <details><summary>Details</summary>
    Handle cases where the issue state and markdown state diverge simultaneously.
    </details>

- [ ] Dry-run mode #8
  - **Labels:** `enhancement`
  - <details><summary>Details</summary>
    Add a `dry_run` input to preview changes without creating or modifying issues.
    </details>
