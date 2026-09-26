const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMarkdown, computeHash } = require('../src/parser');

test('Code-fence skipping', () => {
  const md = `
# Section
- [ ] Task outside
\`\`\`
- [ ] Task inside
\`\`\`
- [x] Task after #1
  `;
  const { tasks } = parseMarkdown(md);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].title, 'Task outside');
  assert.equal(tasks[1].title, 'Task after');
});

test('YAML Frontmatter parsing', () => {
  const md = `---
default_labels: [bug, ui]
default_assignees: jdoro
context_footer: >
  This is a footer.
---
# Section
- [ ] Task 1
`;
  const { tasks, frontmatter } = parseMarkdown(md);
  assert.equal(frontmatter.default_labels.length, 2);
  assert.equal(frontmatter.default_assignees[0], 'jdoro');
  assert.equal(frontmatter.context_footer, 'This is a footer.');

  assert.equal(tasks[0].labels[0], 'bug');
  assert.equal(tasks[0].labels[1], 'ui');
});

test('Bidirectional state toggling and dry run simulate', async (t) => {
  const sync = require('../src/sync');
  const assert = require('node:assert/strict');

  let writtenData = '';
  const mockFs = {
    existsSync: () => true,
    readFileSync: () => '- [ ] Some new task',
    writeFileSync: (path, data) => { writtenData = data; }
  };

  const coreMock = {
    setFailed: () => {},
    info: () => {},
    notice: () => {},
    warning: () => {},
    setOutput: () => {},
    summary: {
      addHeading: function() { return this; },
      addTable: function() { return this; },
      write: async function() {}
    }
  };

  const githubMock = {
    paginate: async () => [],
    rest: {
      issues: {
        listForRepo: async () => [],
        create: async () => ({ data: { number: 42, id: 100 } }),
        update: async () => {},
        get: async () => { throw new Error('Not found') }
      }
    }
  };

  const prevEnv = {
    INPUT_FILE_PATH: process.env.INPUT_FILE_PATH,
    INPUT_DIRECTION: process.env.INPUT_DIRECTION,
    INPUT_DRY_RUN: process.env.INPUT_DRY_RUN
  };

  t.after(() => {
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  process.env.INPUT_FILE_PATH = 'fake.md';
  process.env.INPUT_DIRECTION = 'to-issues';
  process.env.INPUT_DRY_RUN = 'true';

  await sync({
    github: githubMock,
    core: coreMock,
    context: { repo: { owner: 'test', repo: 'repo' }, payload: {} },
    _fs: mockFs
  });

  // Dry run shouldn't write files
  assert.equal(writtenData, '');

  // Real run
  process.env.INPUT_DRY_RUN = 'false';
  await sync({
    github: githubMock,
    core: coreMock,
    context: { repo: { owner: 'test', repo: 'repo' }, payload: {} },
    _fs: mockFs
  });

  assert.match(writtenData, /#42/);
});
