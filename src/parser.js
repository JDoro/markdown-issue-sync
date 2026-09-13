const TASK_REGEX = /^(\s*-\s*\[([ xX])\])\s+(.*?)(?:\s+#(\d+))?\s*$/;
const HEADING_REGEX = /^(#+)\s+(.*)$/;
const LABELS_REGEX = /^\s*-\s*\*\*Labels:\*\*\s*(.*)$/;
const ASSIGNEES_REGEX = /^\s*-\s*\*\*Assignees:\*\*\s*(.*)$/;

function parseMarkdown(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  let currentSection = '';

  let currentTask = null;
  let inDetails = false;
  let detailsLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inDetails) {
      detailsLines.push(line);
      if (line.includes('</details>')) {
        inDetails = false;
        currentTask.details = detailsLines.join('\n');
      }
      continue;
    }

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      currentSection = headingMatch[2].trim();
      currentTask = null;
      continue;
    }

    const taskMatch = line.match(TASK_REGEX);
    if (taskMatch) {
      const prefix = taskMatch[1];
      const checked = taskMatch[2] === 'x' || taskMatch[2] === 'X';
      const title = taskMatch[3].trim();
      const issueNumber = taskMatch[4] ? parseInt(taskMatch[4], 10) : null;

      currentTask = {
        lineIndex: i,
        prefix,
        checked,
        title,
        issueNumber,
        section: currentSection,
        labels: [],
        assignees: [],
        details: null
      };
      tasks.push(currentTask);
      continue;
    }

    if (currentTask) {
      const labelsMatch = line.match(LABELS_REGEX);
      if (labelsMatch) {
        currentTask.labels = labelsMatch[1].split(',').map(l => l.replace(/`/g, '').trim()).filter(Boolean);
        continue;
      }

      const assigneesMatch = line.match(ASSIGNEES_REGEX);
      if (assigneesMatch) {
        currentTask.assignees = assigneesMatch[1].split(',').map(a => a.replace(/[`@]/g, '').trim()).filter(Boolean);
        continue;
      }

      if (line.includes('<details>')) {
        inDetails = true;
        detailsLines = [line];
        if (line.includes('</details>')) {
          inDetails = false;
          currentTask.details = detailsLines.join('\n');
        }
        continue;
      }
    }
  }

  if (inDetails) {
    throw new Error('Malformed markdown: Found unterminated <details> block.');
  }

  return { lines, tasks };
}

function updateMarkdownLineWithIssue(lines, lineIndex, issueNumber) {
  const line = lines[lineIndex];
  const taskMatch = line.match(TASK_REGEX);
  if (taskMatch && !taskMatch[4]) {
    lines[lineIndex] = `${line.replace(/\s+$/, '')} #${issueNumber}`;
  }
}

function updateMarkdownTaskState(lines, lineIndex, isClosed) {
  const line = lines[lineIndex];
  const taskMatch = line.match(TASK_REGEX);
  if (taskMatch) {
    const box = isClosed ? '[x]' : '[ ]';
    lines[lineIndex] = line.replace(/\[([ xX])\]/, box);
  }
}

module.exports = {
  parseMarkdown,
  updateMarkdownLineWithIssue,
  updateMarkdownTaskState
};
