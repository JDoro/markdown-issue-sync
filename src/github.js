const { Octokit } = require('@octokit/rest');

class GitHubClient {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  generateIssueBody(task, filePath, repoUrl) {
    let body = task.details ? `${task.details}\n\n` : '';
    body += `---\n*Origin: [${filePath}](${repoUrl}/blob/main/${filePath})*\n\n`;
    body += `<!-- markdown-sync-meta\nsource_file: "${filePath}"\nsection: "${task.section}"\n-->`;
    return body;
  }

  async createIssue(task, filePath, repoUrl) {
    const body = this.generateIssueBody(task, filePath, repoUrl);

    const params = {
      owner: this.owner,
      repo: this.repo,
      title: task.title,
      body: body,
    };

    if (task.labels.length > 0) {
      params.labels = task.labels;
    }
    if (task.assignees.length > 0) {
      params.assignees = task.assignees;
    }

    const { data } = await this.octokit.issues.create(params);

    // Close issue if it's already checked in markdown
    if (task.checked) {
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: data.number,
        state: 'closed'
      });
    }

    return data.number;
  }

  async updateIssueState(issueNumber, isClosed, title, labels, assignees) {
    const params = {
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: isClosed ? 'closed' : 'open',
    };
    if (title) {
        params.title = title;
    }
    if (labels && labels.length > 0) {
        params.labels = labels;
    }
    if (assignees && assignees.length > 0) {
        params.assignees = assignees;
    }
    await this.octokit.issues.update(params);
  }
}

module.exports = { GitHubClient };
