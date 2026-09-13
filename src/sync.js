const fs = require('fs');
const core = require('@actions/core');
const { parseMarkdown, updateMarkdownLineWithIssue, updateMarkdownTaskState } = require('./parser');
const { GitHubClient } = require('./github');

async function syncToIssues(filePath, githubClient, repoUrl) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { lines, tasks } = parseMarkdown(content);
  let changed = false;

  for (const task of tasks) {
    if (!task.issueNumber) {
      core.info(`Creating issue for: ${task.title}`);
      const issueNumber = await githubClient.createIssue(task, filePath, repoUrl);
      updateMarkdownLineWithIssue(lines, task.lineIndex, issueNumber);

      // Persist the markdown mapping immediately
      const tempFile = `${filePath}.tmp`;
      fs.writeFileSync(tempFile, lines.join('\n'));
      fs.renameSync(tempFile, filePath);

      // If task is checked, update state to closed now that ID is persisted
      if (task.checked) {
          await githubClient.updateIssueState(issueNumber, true, null, null, null);
      }

      changed = true;
    } else {
        // Sync state if already exists
        core.info(`Updating state, labels, and assignees for issue #${task.issueNumber}`);
        await githubClient.updateIssueState(task.issueNumber, task.checked, task.title, task.labels, task.assignees);
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
  const { lines, tasks } = parseMarkdown(content);

  const task = tasks.find(t => t.issueNumber === issueNumber);

  if (task) {
    if (task.checked !== isClosed) {
      core.info(`Updating markdown task state for issue #${issueNumber}`);
      updateMarkdownTaskState(lines, task.lineIndex, isClosed);
      fs.writeFileSync(filePath, lines.join('\n'));
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
