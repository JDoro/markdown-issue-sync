const crypto = require('node:crypto');

const TASK_REGEX = /^(\s*-\s*\[([ xX])\])\s+(.*?)(?:\s+#(\d+))?\s*$/;
const HEADING_REGEX = /^(#+)\s+(.*)$/;
const LABELS_REGEX = /^\s*-\s*\*\*Labels:\*\*\s*(.*)$/;
const ASSIGNEES_REGEX = /^\s*-\s*\*\*Assignees:\*\*\s*(.*)$/;
const PRIORITY_REGEX = /^\s*-\s*\*\*Priority:\*\*\s*(.*)$/;
const DEPENDS_ON_REGEX = /^\s*-\s*\*\*Depends on:\*\*\s*(.*)$/;
const ESTIMATE_REGEX = /^\s*-\s*\*\*Estimate:\*\*\s*(.*)$/;

function parseYamlFrontmatter(lines) {
  let inFrontmatter = false;
  let frontmatterLines = [];
  let restLines = [];
  let foundFrontmatter = false;

  if (lines.length > 0 && lines[0].trim() === '---') {
    inFrontmatter = true;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        inFrontmatter = false;
        restLines = lines.slice(i + 1);
        foundFrontmatter = true;
        break;
      }
      frontmatterLines.push(lines[i]);
    }
  }

  if (!foundFrontmatter) {
    return { frontmatter: null, contentLines: lines };
  }

  const frontmatter = {
    default_labels: [],
    default_assignees: [],
    context_footer: ''
  };

  let inContextFooter = false;
  let contextFooterLines = [];

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i];

    if (inContextFooter) {
      if (line.match(/^\w+:/)) {
        inContextFooter = false;
        frontmatter.context_footer = contextFooterLines.join('\n').trim();
      } else {
        contextFooterLines.push(line.replace(/^\s+/, ''));
        continue;
      }
    }

    const labelsMatch = line.match(/^default_labels:\s*(.*)$/);
    if (labelsMatch) {
      if (labelsMatch[1].startsWith('[')) {
         const raw = labelsMatch[1].slice(1, -1);
         frontmatter.default_labels = raw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else {
        frontmatter.default_labels = labelsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      }
      continue;
    }

    const assigneesMatch = line.match(/^default_assignees:\s*(.*)$/);
    if (assigneesMatch) {
      if (assigneesMatch[1].startsWith('[')) {
         const raw = assigneesMatch[1].slice(1, -1);
         frontmatter.default_assignees = raw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else {
        frontmatter.default_assignees = assigneesMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      }
      continue;
    }

    const contextFooterMatch = line.match(/^context_footer:\s*(.*)$/);
    if (contextFooterMatch) {
      const val = contextFooterMatch[1].trim();
      if (val === '|' || val === '>-' || val === '>') {
        inContextFooter = true;
      } else {
        frontmatter.context_footer = val;
      }
      continue;
    }
  }

  if (inContextFooter) {
    frontmatter.context_footer = contextFooterLines.join('\n').trim();
  }

  return { frontmatter, contentLines: restLines };
}

function computeHash(task) {
  const payload = {
    title: task.title,
    body: task.details || '',
    labels: [...task.labels].sort(),
    assignees: [...task.assignees].sort(),
    parentIssueNumber: task.parentIssueNumber || null
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 12);
}

function parseMarkdown(content) {
  const allLines = content.split(/\r?\n/);

  const { frontmatter, contentLines: lines } = parseYamlFrontmatter(allLines);

  const tasks = [];
  let currentSection = '';

  let currentTask = null;
  let inDetails = false;
  let detailsLines = [];
  let inCodeFence = false;

  // Track hierarchy by indentation
  const taskStack = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const trimmedLine = line.trim();

    // YAML frontmatter detection (skip lines already parsed if needed, but since we map to original indices, we must iterate allLines)
    // Actually, to keep line indices correct for update functions, we iterate allLines.
    if (i === 0 && trimmedLine === '---') {
      let j = 1;
      while (j < allLines.length && allLines[j].trim() !== '---') j++;
      if (j < allLines.length) {
        i = j; // skip frontmatter
        continue;
      }
    }

    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

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
      taskStack.length = 0; // reset hierarchy on new heading
      continue;
    }

    const taskMatch = line.match(TASK_REGEX);
    if (taskMatch) {
      const leadingWhitespace = line.match(/^(\s*)/)[1].length;
      const prefix = taskMatch[1];
      const checked = taskMatch[2] === 'x' || taskMatch[2] === 'X';
      const title = taskMatch[3].trim();
      const issueNumber = taskMatch[4] ? parseInt(taskMatch[4], 10) : null;

      // Determine parent
      while (taskStack.length > 0 && taskStack[taskStack.length - 1].indent >= leadingWhitespace) {
        taskStack.pop();
      }
      const parentTask = taskStack.length > 0 ? taskStack[taskStack.length - 1].task : null;

      currentTask = {
        lineIndex: i,
        indent: leadingWhitespace,
        prefix,
        checked,
        title,
        issueNumber,
        section: currentSection,
        labels: frontmatter ? [...frontmatter.default_labels] : [],
        assignees: frontmatter ? [...frontmatter.default_assignees] : [],
        priority: null,
        dependsOn: [],
        estimate: null,
        details: null,
        parentIssueNumber: parentTask ? parentTask.issueNumber : null,
        parentTaskRef: parentTask
      };

      tasks.push(currentTask);
      taskStack.push({ indent: leadingWhitespace, task: currentTask });
      continue;
    }

    if (currentTask) {
      const labelsMatch = line.match(LABELS_REGEX);
      if (labelsMatch) {
        const lineLabels = labelsMatch[1].split(',').map(l => l.replace(/`/g, '').trim()).filter(Boolean);
        currentTask.labels = [...new Set([...currentTask.labels, ...lineLabels])];
        continue;
      }

      const assigneesMatch = line.match(ASSIGNEES_REGEX);
      if (assigneesMatch) {
        const lineAssignees = assigneesMatch[1].split(',').map(a => a.replace(/[`@]/g, '').trim()).filter(Boolean);
        currentTask.assignees = [...new Set([...currentTask.assignees, ...lineAssignees])];
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

  // Compute hashes now that all details/labels/assignees are parsed
  for (const task of tasks) {
    // If the parent task doesn't have an issue number yet, we'll assign it dynamically later,
    // but the hash requires parentIssueNumber. It will be updated later in sync.js if needed.
    task.hash = computeHash(task);
  }

  return { lines: allLines, tasks, frontmatter };
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
  updateMarkdownTaskState,
  computeHash
};
