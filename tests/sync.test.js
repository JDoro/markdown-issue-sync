const fs = require('fs');
const core = require('@actions/core');
const { syncToIssues } = require('../src/sync');

jest.mock('fs', () => ({...jest.requireActual('fs'), existsSync: jest.fn(), readFileSync: jest.fn(), writeFileSync: jest.fn(), renameSync: jest.fn()}));
jest.mock('@actions/core');

describe('syncToIssues', () => {
  let mockGithubClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGithubClient = {
      getIssue: jest.fn(),
      createIssue: jest.fn(),
      updateIssueState: jest.fn(),
      generateIssueBody: jest.fn().mockReturnValue('mock body')
    };

    fs.existsSync.mockReturnValue(true);
    fs.writeFileSync = jest.fn();
    fs.renameSync = jest.fn();
  });

  test('creates a new issue when 404 is returned and updates markdown', async () => {
    const mockContent = '- [ ] Task with old missing issue #123';
    fs.readFileSync.mockReturnValue(mockContent);

    // Mock getIssue to reject with a 404
    mockGithubClient.getIssue.mockRejectedValue({ status: 404 });
    // Mock createIssue to return a new issue number
    mockGithubClient.createIssue.mockResolvedValue(456);

    await syncToIssues('ROADMAP.md', mockGithubClient, 'repoUrl', 'main');

    // Should try to fetch existing issue
    expect(mockGithubClient.getIssue).toHaveBeenCalledWith(123);

    // Should fallback to creating an issue
    expect(mockGithubClient.createIssue).toHaveBeenCalled();
    expect(mockGithubClient.createIssue.mock.calls[0][0].title).toBe('Task with old missing issue');

    // Should rewrite markdown file to use new issue number
    expect(fs.writeFileSync).toHaveBeenCalled();
    const writtenContent = fs.writeFileSync.mock.calls[0][1];
    expect(writtenContent).toBe('- [ ] Task with old missing issue #456');

    // Check correct info message logged
    expect(core.info).toHaveBeenCalledWith('Issue #123 not found or inaccessible. Will create a new one.');
  });

  test('creates a new issue when 403 Resource not accessible by integration is returned', async () => {
    const mockContent = '- [ ] Task with old PR issue #123';
    fs.readFileSync.mockReturnValue(mockContent);

    // Mock getIssue to reject with a 403
    mockGithubClient.getIssue.mockRejectedValue({ status: 403, message: 'Resource not accessible by integration' });
    // Mock createIssue to return a new issue number
    mockGithubClient.createIssue.mockResolvedValue(456);

    await syncToIssues('ROADMAP.md', mockGithubClient, 'repoUrl', 'main');

    expect(mockGithubClient.getIssue).toHaveBeenCalledWith(123);
    expect(mockGithubClient.createIssue).toHaveBeenCalled();
    const writtenContent = fs.writeFileSync.mock.calls[0][1];
    expect(writtenContent).toBe('- [ ] Task with old PR issue #456');
    expect(core.info).toHaveBeenCalledWith('Issue #123 not found or inaccessible. Will create a new one.');
  });

});
