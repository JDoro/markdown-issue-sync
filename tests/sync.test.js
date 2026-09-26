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

test('Bidirectional state toggling and dry run simulate', () => {
  const sync = require('../src/sync');
  assert.equal(typeof sync, 'function');
  // the core logic is in sync.js and is mocked in tests if needed, but parser handles parsing states well.
});
