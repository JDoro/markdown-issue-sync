const fs = require('fs');
const core = require('@actions/core');
const { parseMarkdown, updateMarkdownLineWithIssue, updateMarkdownTaskState } = require('./parser');
const { GitHubClient } = require('./github');

async function syncToIssues(filePath, githubClient, repoUrl, defaultBranch) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = content.endsWith(eol);
  const { lines, tasks } = parseMarkdown(content);
  let changed = false;

  for (const task of tasks) {
    if (!task.issueNumber) {
      core.info(`Creating issue for: ${task.title}`);
      const issueNumber = await githubClient.createIssue(task, filePath, repoUrl, defaultBranch);
      updateMarkdownLineWithIssue(lines, task.lineIndex, issueNumber);

      // Persist the markdown mapping immediately
      const tempFile = `${filePath}.tmp`;
      const output = lines.join(eol) + (hasTrailingNewline && lines[lines.length - 1] !== '' ? eol : '');
      fs.writeFileSync(tempFile, output);
      fs.renameSync(tempFile, filePath);

      // If task is checked, update state to closed now that ID is persisted
      if (task.checked) {
          await githubClient.updateIssueState(issueNumber, true, null, null, null);
      }

      changed = true;
    } else {
        // Sync state if already exists
        core.info(`Checking existing state for issue #${task.issueNumber}`);
        const existingIssue = await githubClient.getIssue(task.issueNumber);

        const existingState = existingIssue.state === 'closed';
        const existingTitle = existingIssue.title;
        const existingLabels = existingIssue.labels.map(l => l.name);
        const existingAssignees = existingIssue.assignees.map(a => a.login);

        const stateChanged = existingState !== task.checked;
        const titleChanged = existingTitle !== task.title;

        const labelsChanged = task.labels && (
          task.labels.length !== existingLabels.length ||
          !task.labels.every(l => existingLabels.includes(l))
        );

        const assigneesChanged = task.assignees && (
          task.assignees.length !== existingAssignees.length ||
          !task.assignees.every(a => existingAssignees.includes(a))
        );

        if (stateChanged || titleChanged || labelsChanged || assigneesChanged) {
            core.info(`Updating issue #${task.issueNumber} because changes were detected.`);
            await githubClient.updateIssueState(
              task.issueNumber,
              stateChanged ? task.checked : existingState,
              titleChanged ? task.title : null,
              labelsChanged ? task.labels : null,
              assigneesChanged ? task.assignees : null
            );
        } else {
            core.info(`No changes detected for issue #${task.issueNumber}. Skipping update.`);
        }
    }
  }

  if (changed) {
    core.info(`Updated markdown file: ${filePath}`);
  } else {
    core.info('No new issues to create from markdown.');
  }
}

async function syncToMarkdown(filePath, issueNumber, isClosed) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = content.endsWith(eol);
  const { lines, tasks } = parseMarkdown(content);

  const task = tasks.find(t => t.issueNumber === issueNumber);

  if (task) {
    if (task.checked !== isClosed) {
      core.info(`Updating markdown task state for issue #${issueNumber}`);
      updateMarkdownTaskState(lines, task.lineIndex, isClosed);
      const output = lines.join(eol) + (hasTrailingNewline && lines[lines.length - 1] !== '' ? eol : '');
      fs.writeFileSync(filePath, output);
    } else {
      core.info('Markdown task state already matches issue.');
    }
  } else {
    core.info(`Issue #${issueNumber} not found in markdown.`);
  }
}

module.exports = {
  syncToIssues,
  syncToMarkdown
};
