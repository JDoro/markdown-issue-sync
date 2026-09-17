const { GitHubClient } = require('../src/github');

describe('GitHubClient', () => {
  let client;

  beforeEach(() => {
    client = new GitHubClient('token', 'owner', 'repo');
  });

  describe('generateIssueBody', () => {
    const defaultTask = {
      title: 'Test Task',
      details: null,
      priority: null,
      estimate: null,
      dependsOn: [],
      section: 'Section'
    };

    const filePath = 'README.md';
    const repoUrl = 'https://github.com/owner/repo';
    const defaultBranch = 'main';

    test('generates body with only metadata header if details are missing', () => {
      const task = {
        ...defaultTask,
        priority: 'High',
        estimate: '5',
        dependsOn: ['1', '2']
      };

      const body = client.generateIssueBody(task, filePath, repoUrl, defaultBranch);

      expect(body).toContain('**Priority:** High');
      expect(body).toContain('**Estimate:** 5');
      expect(body).toContain('**Depends on:** #1, #2');
      expect(body).not.toContain('\n---\n\n---'); // Ensure no double hr
      expect(body).toContain('*Origin:');
    });

    test('generates body with metadata and details', () => {
      const task = {
        ...defaultTask,
        priority: 'Medium',
        details: 'Some task details'
      };

      const body = client.generateIssueBody(task, filePath, repoUrl, defaultBranch);

      expect(body).toContain('**Priority:** Medium');
      expect(body).toContain('\n---\n\nSome task details');
      expect(body).toContain('*Origin:');
    });

    test('generates body without metadata header if fields are absent', () => {
      const body = client.generateIssueBody(defaultTask, filePath, repoUrl, defaultBranch);

      expect(body).not.toContain('**Priority:**');
      expect(body).not.toContain('**Estimate:**');
      expect(body).not.toContain('**Depends on:**');
      expect(body).toContain('*Origin:');
    });
  });
});
