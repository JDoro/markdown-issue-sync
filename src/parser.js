const TASK_REGEX = /^(\s*-\s*\[([ xX])\])\s+(.*?)(?:\s+#(\d+))?\s*$/;
const HEADING_REGEX = /^(#+)\s+(.*)$/;
const LABELS_REGEX = /^\s*-\s*\*\*Labels:\*\*\s*(.*)$/;
const ASSIGNEES_REGEX = /^\s*-\s*\*\*Assignees:\*\*\s*(.*)$/;
const PRIORITY_REGEX = /^\s*-\s*\*\*Priority:\*\*\s*(.*)$/;
const DEPENDS_ON_REGEX = /^\s*-\s*\*\*Depends on:\*\*\s*(.*)$/;
const ESTIMATE_REGEX = /^\s*-\s*\*\*Estimate:\*\*\s*(.*)$/;

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
        if (currentTask) {
          currentTask.details = detailsLines.join('\n');
        }
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
        priority: null,
        dependsOn: [],
        estimate: null,
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

      const priorityMatch = line.match(PRIORITY_REGEX);
      if (priorityMatch) {
        currentTask.priority = priorityMatch[1].replace(/`/g, '').trim();
        continue;
      }

      const dependsOnMatch = line.match(DEPENDS_ON_REGEX);
      if (dependsOnMatch) {
        currentTask.dependsOn = dependsOnMatch[1].split(',').map(d => d.replace(/[`#]/g, '').trim()).filter(Boolean);
        continue;
      }

      const estimateMatch = line.match(ESTIMATE_REGEX);
      if (estimateMatch) {
        currentTask.estimate = estimateMatch[1].replace(/`/g, '').trim();
        continue;
      }

    }

    if (/<details\b/.test(line)) {
      inDetails = true;
      detailsLines = [line];
      if (line.includes('</details>')) {
        inDetails = false;
        if (currentTask) {
          currentTask.details = detailsLines.join('\n');
        }
      }
      continue;
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
  if (taskMatch) {
    if (!taskMatch[4]) {
      lines[lineIndex] = `${line.replace(/\s+$/, '')} #${issueNumber}`;
    } else {
      lines[lineIndex] = line.replace(new RegExp(`\\s+#${taskMatch[4]}(\\s*)$`), ` #${issueNumber}$1`);
    }
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
