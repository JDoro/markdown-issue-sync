const core = require('@actions/core');
const { execFileSync } = require('child_process');

function commitAndPush(filePath, message) {
  if (!process.env.GITHUB_WORKSPACE) {
    return;
  }

  try {
    execFileSync('git', ['config', '--local', 'user.name', 'github-actions[bot]']);
    execFileSync('git', ['config', '--local', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
    execFileSync('git', ['add', filePath]);
    // Check if there are changes
    const diff = execFileSync('git', ['diff', '--staged']).toString();
    if (diff) {
      execFileSync('git', ['commit', '-m', message]);
      execFileSync('git', ['pull', '--rebase']);
      execFileSync('git', ['push']);
    }
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : '';
    core.setFailed(`Could not commit/push: ${e.message}\n${stderr}`);
  }
}

module.exports = { commitAndPush };
