const core = require('@actions/core');
const github = require('@actions/github');
const { syncToIssues, syncToMarkdown } = require('./sync');
const { GitHubClient } = require('./github');
const { resolveDirection } = require('./direction');
const { commitAndPush } = require('./git');

async function run() {
  try {
    const filePath = core.getInput('file_path', { required: true });
    const token = core.getInput('github_token', { required: true });

    const context = github.context;
    let direction = core.getInput('direction');

    if (!direction) {
      const resolved = resolveDirection(context.eventName, context.payload.action);
      if (resolved.skip) {
        core.notice(resolved.reason);
        return;
      }
      direction = resolved.direction;
      core.info(`Auto-detected sync direction: ${direction}`);
    }

    const { owner, repo } = context.repo;
    const defaultBranch = context.payload.repository ? context.payload.repository.default_branch : 'main';
    const repoUrl = `https://github.com/${owner}/${repo}`;

    const client = new GitHubClient(token, owner, repo);

    if (direction === 'to-issues') {
      core.info('Syncing from Markdown to GitHub Issues...');
      await syncToIssues(filePath, client, repoUrl, defaultBranch);
      commitAndPush(filePath, 'chore: sync issues to markdown [skip ci]');
    } else if (direction === 'to-markdown') {
      if (!context.payload.issue) {
        throw new Error('Direction "to-markdown" must be triggered by an issue event.');
      }

      core.info('Syncing from GitHub Issue to Markdown...');
      const issueNumber = context.payload.issue.number;
      const isClosed = context.payload.issue.state === 'closed';

      await syncToMarkdown(filePath, issueNumber, isClosed);
      commitAndPush(filePath, 'chore: sync issue state to markdown [skip ci]');
    } else {
      throw new Error(`Invalid direction: ${direction}. Must be 'to-issues' or 'to-markdown'.`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
