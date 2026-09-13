const core = require('@actions/core');
const github = require('@actions/github');
const { syncToIssues, syncToMarkdown } = require('./sync');
const { GitHubClient } = require('./github');
const { execFileSync } = require('child_process');

async function run() {
  try {
    const filePath = core.getInput('file_path', { required: true });
    const direction = core.getInput('direction', { required: true });
    const token = core.getInput('github_token', { required: true });

    const context = github.context;
    const { owner, repo } = context.repo;
    const defaultBranch = context.payload.repository ? context.payload.repository.default_branch : 'main';
    const repoUrl = `https://github.com/${owner}/${repo}`;

    const client = new GitHubClient(token, owner, repo);

    if (direction === 'to-issues') {
      core.info('Syncing from Markdown to GitHub Issues...');
      await syncToIssues(filePath, client, repoUrl, defaultBranch);

      // Auto-commit if running in GHA
      if (process.env.GITHUB_WORKSPACE) {
         try {
            execFileSync('git', ['config', '--local', 'user.name', 'github-actions[bot]']);
            execFileSync('git', ['config', '--local', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
            execFileSync('git', ['add', filePath]);
            // Check if there are changes
            const diff = execFileSync('git', ['diff', '--staged']).toString();
            if (diff) {
                execFileSync('git', ['commit', '-m', 'chore: sync issues to markdown [skip ci]']);
                execFileSync('git', ['pull', '--rebase']);
                execFileSync('git', ['push']);
            }
         } catch (e) {
             const stderr = e.stderr ? e.stderr.toString() : '';
             core.setFailed(`Could not commit/push: ${e.message}\n${stderr}`);
         }
      }
    } else if (direction === 'to-markdown') {
      if (!context.payload.issue) {
        throw new Error('Direction "to-markdown" must be triggered by an issue event.');
      }

      core.info('Syncing from GitHub Issue to Markdown...');
      const issueNumber = context.payload.issue.number;
      const isClosed = context.payload.issue.state === 'closed';

      await syncToMarkdown(filePath, issueNumber, isClosed);

      if (process.env.GITHUB_WORKSPACE) {
         try {
            execFileSync('git', ['config', '--local', 'user.name', 'github-actions[bot]']);
            execFileSync('git', ['config', '--local', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
            execFileSync('git', ['add', filePath]);
            const diff = execFileSync('git', ['diff', '--staged']).toString();
            if (diff) {
                execFileSync('git', ['commit', '-m', 'chore: sync issue state to markdown [skip ci]']);
                execFileSync('git', ['pull', '--rebase']);
                execFileSync('git', ['push']);
            }
         } catch (e) {
             const stderr = e.stderr ? e.stderr.toString() : '';
             core.setFailed(`Could not commit/push: ${e.message}\n${stderr}`);
         }
      }
    } else {
      throw new Error(`Invalid direction: ${direction}. Must be 'to-issues' or 'to-markdown'.`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
