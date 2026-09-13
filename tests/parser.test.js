const { parseMarkdown, updateMarkdownLineWithIssue, updateMarkdownTaskState } = require('../src/parser');

describe('Markdown Parser', () => {
  const markdownContent = `
## Phase 1: Core Engine

- [ ] Implement robust token authentication #42
  - **Labels:** \`security\`, \`backend\`
  - **Assignees:** \`@username\`
  - <details><summary>Details</summary>
    Support JWT authentication and refresh tokens via secure HTTP-only cookies.
    Include test coverage for token expiration scenarios.
    </details>

- [x] Configure base CI/CD pipelines #39
  - **Labels:** \`devops\`

- [ ] A new task without an issue
`;

  test('parses tasks correctly', () => {
    const { tasks } = parseMarkdown(markdownContent);
    expect(tasks.length).toBe(3);

    expect(tasks[0].title).toBe('Implement robust token authentication');
    expect(tasks[0].checked).toBe(false);
    expect(tasks[0].issueNumber).toBe(42);
    expect(tasks[0].section).toBe('Phase 1: Core Engine');
    expect(tasks[0].labels).toEqual(['security', 'backend']);
    expect(tasks[0].assignees).toEqual(['username']);
    expect(tasks[0].details).toContain('Support JWT authentication');

    expect(tasks[1].title).toBe('Configure base CI/CD pipelines');
    expect(tasks[1].checked).toBe(true);
    expect(tasks[1].issueNumber).toBe(39);
    expect(tasks[1].labels).toEqual(['devops']);
    expect(tasks[1].assignees).toEqual([]);

    expect(tasks[2].title).toBe('A new task without an issue');
    expect(tasks[2].issueNumber).toBeNull();
  });

  test('updates markdown line with issue number', () => {
    const { lines, tasks } = parseMarkdown(markdownContent);
    const taskIndex = tasks[2].lineIndex;

    updateMarkdownLineWithIssue(lines, taskIndex, 101);

    expect(lines[taskIndex]).toBe('- [ ] A new task without an issue #101');
  });

  test('updates task state to closed', () => {
    const { lines, tasks } = parseMarkdown(markdownContent);
    const taskIndex = tasks[0].lineIndex;

    updateMarkdownTaskState(lines, taskIndex, true);

    expect(lines[taskIndex]).toBe('- [x] Implement robust token authentication #42');
  });

  test('updates task state to open', () => {
    const { lines, tasks } = parseMarkdown(markdownContent);
    const taskIndex = tasks[1].lineIndex;

    updateMarkdownTaskState(lines, taskIndex, false);

    expect(lines[taskIndex]).toBe('- [ ] Configure base CI/CD pipelines #39');
  });
});
