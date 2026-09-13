const { Octokit } = require('@octokit/rest');

class GitHubClient {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  generateIssueBody(task, filePath, repoUrl, defaultBranch) {
    let body = task.details ? `${task.details}\n\n` : '';

    // Ensure properly escaped links and metadata
    const encodedFilePath = encodeURI(filePath).replace(/[#?()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const escapedFilePath = filePath.replace(/"/g, '&quot;');
    const escapedSection = (task.section || '').replace(/"/g, '&quot;').replace(/-->/g, '--&gt;');
    const branch = defaultBranch || 'main';

    body += `---\n*Origin: [${filePath}](${repoUrl}/blob/${branch}/${encodedFilePath})*\n\n`;
    body += `<!-- markdown-sync-meta\nsource_file: "${escapedFilePath}"\nsection: "${escapedSection}"\n-->`;
    return body;
  }

  async createIssue(task, filePath, repoUrl, defaultBranch) {
    const body = this.generateIssueBody(task, filePath, repoUrl, defaultBranch);

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
    return data.number;
  }


  async getIssue(issueNumber) {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
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
    if (Array.isArray(labels)) {
        params.labels = labels;
    }
    if (Array.isArray(assignees)) {
        params.assignees = assignees;
    }
    await this.octokit.issues.update(params);
  }
}

module.exports = { GitHubClient };
