const fs = require('fs');
const { parseMarkdown, updateMarkdownLineWithIssue, updateMarkdownTaskState, computeHash } = require('./parser');

function generateIssueBody(task, filePath, repoUrl, defaultBranch, frontmatter) {
  let body = task.details ? `${task.details}\n\n` : '';

  let metadataHeader = '';
  if (task.priority) metadataHeader += `**Priority:** ${task.priority}\n`;
  if (task.estimate) metadataHeader += `**Estimate:** ${task.estimate}\n`;
  if (task.dependsOn && task.dependsOn.length > 0) {
    metadataHeader += `**Depends on:** ${task.dependsOn.map(id => '#' + id).join(', ')}\n`;
  }

  if (metadataHeader) {
    body = metadataHeader + (body ? '\n---\n\n' + body : '\n\n');
  }

  if (frontmatter && frontmatter.context_footer) {
    body += `${frontmatter.context_footer}\n\n`;
  }

  const encodedFilePath = encodeURI(filePath).replace(/[#?()]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  const escapedFilePath = filePath.replace(/"/g, '&quot;').replace(/-->/g, '--&gt;');
  const escapedSection = (task.section || '').replace(/"/g, '&quot;').replace(/-->/g, '--&gt;');
  const branch = defaultBranch || 'main';

  body += `---\n*Origin: [${filePath}](${repoUrl}/blob/${branch}/${encodedFilePath})*\n\n`;
  body += `<!-- markdown-issue-sync: {"file":"${escapedFilePath}","hash":"${task.hash}"} -->`;
  return body;
}

module.exports = async ({ github, context, core, _fs = fs }) => {
  const filePath = process.env.INPUT_FILE_PATH;
  let direction = process.env.INPUT_DIRECTION;
  const isDryRun = process.env.INPUT_DRY_RUN === 'true';

  const createdIssues = [];
  const updatedIssues = [];
  const closedIssues = [];
  const reopenedIssues = [];

  const { owner, repo } = context.repo;
  const defaultBranch = context.payload.repository ? context.payload.repository.default_branch : 'main';
  const repoUrl = `https://github.com/${owner}/${repo}`;

  if (!direction) {
    const eventName = context.eventName;
    const action = context.payload.action;

    if (['push', 'workflow_dispatch', 'schedule'].includes(eventName)) {
      direction = 'to-issues';
    } else if (eventName === 'issues' && ['closed', 'reopened'].includes(action)) {
      direction = 'to-markdown';
    } else if (eventName === 'issues') {
      core.notice(`Issues event action "${action}" does not affect task state; skipping sync.`);
      return;
    } else {
      core.setFailed(`Could not auto-detect sync direction for event "${eventName}".`);
      return;
    }
    core.info(`Auto-detected sync direction: ${direction}`);
  }

  if (direction !== "to-issues" && direction !== "to-markdown") {
    core.setFailed(`Invalid direction: ${direction}. Must be \`to-issues\` or \`to-markdown\`.`);
    return;
  }

  if (!_fs.existsSync(filePath)) {
    core.setFailed(`File not found: ${filePath}`);
    return;
  }

  const content = _fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = content.endsWith(eol);
  const { lines, tasks, frontmatter } = parseMarkdown(content);

  if (direction === 'to-markdown') {
    if (!context.payload.issue) {
      core.setFailed('Direction "to-markdown" must be triggered by an issue event.');
      return;
    }
    const issueNumber = context.payload.issue.number;
    const isClosed = context.payload.issue.state === 'closed';
    const task = tasks.find(t => t.issueNumber === issueNumber);

    if (task) {
      if (task.checked !== isClosed) {
        if (isDryRun) {
          core.info(`[DRY RUN] Would update markdown task state for issue #${issueNumber}`);
        } else {
          core.info(`Updating markdown task state for issue #${issueNumber}`);
          updateMarkdownTaskState(lines, task.lineIndex, isClosed);
          const output = lines.join(eol) + (hasTrailingNewline && lines[lines.length - 1] !== '' ? eol : '');
          _fs.writeFileSync(filePath, output);
        }
      } else {
        core.info('Markdown task state already matches issue.');
      }
    } else {
      core.info(`Issue #${issueNumber} not found in markdown.`);
    }

    core.setOutput('created_issues', JSON.stringify([]));
    core.setOutput('updated_issues', JSON.stringify([]));
    core.setOutput('closed_issues', JSON.stringify([]));
    core.setOutput('reopened_issues', JSON.stringify([]));
    return;
  }

  // Direction: to-issues
  let changed = false;

  // Pre-fetch all open and closed issues for idempotency guard
  let allIssues = [];
  try {
    allIssues = await github.paginate(github.rest.issues.listForRepo, {
      owner,
      repo,
      state: 'all',
      per_page: 100
    });
  } catch (e) {
    core.warning(`Could not pre-fetch issues: ${e.message}`);
  }

  const getIssueIdByNumber = (num) => {
    const issue = allIssues.find(i => i.number === num);
    return issue ? issue.id : null;
  };

  for (const task of tasks) {
    if (task.parentTaskRef && task.parentTaskRef.issueNumber) {
      task.parentIssueNumber = task.parentTaskRef.issueNumber;
      task.hash = computeHash(task); // Recompute hash with new parentIssueNumber
    }

    let existingIssue = null;
    let needsCreation = !task.issueNumber;

    if (!needsCreation) {
      existingIssue = allIssues.find(i => i.number === task.issueNumber);
      if (!existingIssue && !isDryRun) {
         try {
           const { data } = await github.rest.issues.get({ owner, repo, issue_number: task.issueNumber });
           existingIssue = data;
         } catch (e) {
           core.info(`Issue #${task.issueNumber} not found. Will create a new one.`);
           needsCreation = true;
         }
      }
    }

    if (needsCreation) {
      // Idempotency check
      const orphanedIssue = allIssues.find(i =>
        i.body && i.body.includes(`<!-- markdown-issue-sync: {"file":"${filePath.replace(/"/g, '&quot;').replace(/-->/g, '--&gt;')}"`) &&
        i.body.includes(`"hash":"${task.hash}"`) &&
        !tasks.some(t => t !== task && t.issueNumber === i.number)
      );

      if (orphanedIssue) {
        core.info(`Found orphaned issue #${orphanedIssue.number} for task: ${task.title}. Re-linking.`);
        task.issueNumber = orphanedIssue.number;
        needsCreation = false;
        existingIssue = orphanedIssue;

        if (!isDryRun) {
          updateMarkdownLineWithIssue(lines, task.lineIndex, task.issueNumber);
          changed = true;
        } else {
          core.info(`[DRY RUN] Would link orphaned issue #${task.issueNumber} to markdown.`);
        }
      }
    }

    if (needsCreation) {
      if (isDryRun) {
        core.info(`[DRY RUN] Would create issue for: ${task.title}`);
        createdIssues.push("new");
        // For sub-issues in dry-run, simulate parent having a number
        task.issueNumber = "new";
      } else {
        core.info(`Creating issue for: ${task.title}`);
        const body = generateIssueBody(task, filePath, repoUrl, defaultBranch, frontmatter);
        const { data: newIssue } = await github.rest.issues.create({
          owner,
          repo,
          title: task.title,
          body,
          labels: task.labels.length > 0 ? task.labels : undefined,
          assignees: task.assignees.length > 0 ? task.assignees : undefined
        });

        task.issueNumber = newIssue.number;
        createdIssues.push(task.issueNumber);
        updateMarkdownLineWithIssue(lines, task.lineIndex, task.issueNumber);
        changed = true;

        if (task.checked) {
          await github.rest.issues.update({ owner, repo, issue_number: task.issueNumber, state: 'closed' });
          closedIssues.push(task.issueNumber);
        }

        if (task.parentIssueNumber) {
          try {
            const childId = newIssue.id;
            await github.request(`POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`, {
              owner,
              repo,
              issue_number: task.parentIssueNumber,
              sub_issue_id: childId
            });
          } catch (e) {
            core.warning(`Could not link sub-issue #${task.issueNumber} to parent #${task.parentIssueNumber}: ${e.message}`);
          }
        }
      }
    } else if (existingIssue) {
      const expectedBody = generateIssueBody(task, filePath, repoUrl, defaultBranch, frontmatter);
      const stateChanged = (existingIssue.state === 'closed') !== task.checked;

      let hashDiffers = true;
      const hashMatch = existingIssue.body && existingIssue.body.match(/<!-- markdown-issue-sync:\s*({.*?})\s*-->/);
      if (hashMatch) {
         try {
           const meta = JSON.parse(hashMatch[1]);
           if (meta.hash === task.hash) {
             hashDiffers = false;
           }
         } catch(e) {}
      }

      if (hashDiffers || stateChanged) {
        if (isDryRun) {
          core.info(`[DRY RUN] Would update issue #${task.issueNumber} (hash/state changed)`);
          if (stateChanged) {
             if (task.checked) closedIssues.push(task.issueNumber);
             else reopenedIssues.push(task.issueNumber);
          }
          if (hashDiffers) updatedIssues.push(task.issueNumber);
        } else {
          core.info(`Updating issue #${task.issueNumber} because changes were detected.`);

          const updateParams = {
            owner, repo, issue_number: task.issueNumber,
            state: task.checked ? 'closed' : 'open'
          };

          if (hashDiffers) {
             updateParams.title = task.title;
             updateParams.body = expectedBody;
             updateParams.labels = task.labels;
             updateParams.assignees = task.assignees;
          }

          await github.rest.issues.update(updateParams);

          if (stateChanged) {
             if (task.checked) closedIssues.push(task.issueNumber);
             else reopenedIssues.push(task.issueNumber);
          }
          if (hashDiffers) updatedIssues.push(task.issueNumber);

          // Sub-issue linking if changed/new parent
          if (task.parentIssueNumber) {
            try {
              const childId = getIssueIdByNumber(task.issueNumber) || existingIssue.id;
              await github.request(`POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues`, {
                owner,
                repo,
                issue_number: task.parentIssueNumber,
                sub_issue_id: childId
              });
            } catch (e) {
               // Only warn if not already linked (which is likely a 422 error or similar)
               core.warning(`Could not link sub-issue #${task.issueNumber} to parent #${task.parentIssueNumber}: ${e.message}`);
            }
          }
        }
      } else {
        core.info(`No changes detected for issue #${task.issueNumber}. Skipping update.`);
      }
    }
  }

  if (changed && !isDryRun) {
    core.info(`Updated markdown file: ${filePath}`);
    const output = lines.join(eol) + (hasTrailingNewline && lines[lines.length - 1] !== '' ? eol : '');
    _fs.writeFileSync(filePath, output);
  } else if (!changed) {
    core.info('No new issues to create from markdown.');
  }

  core.setOutput('created_issues', JSON.stringify(createdIssues));
  core.setOutput('updated_issues', JSON.stringify(updatedIssues));
  core.setOutput('closed_issues', JSON.stringify(closedIssues));
  core.setOutput('reopened_issues', JSON.stringify(reopenedIssues));

  if (core.summary) {
    await core.summary
      .addHeading('Markdown Issue Sync Summary')
      .addTable([
        [{data: 'Metric', header: true}, {data: 'Count', header: true}, {data: 'Issues', header: true}],
        ['Created', String(createdIssues.length), createdIssues.map(n => `#${n}`).join(', ')],
        ['Updated', String(updatedIssues.length), updatedIssues.map(n => `#${n}`).join(', ')],
        ['Closed', String(closedIssues.length), closedIssues.map(n => `#${n}`).join(', ')],
        ['Reopened', String(reopenedIssues.length), reopenedIssues.map(n => `#${n}`).join(', ')]
      ])
      .write();
  }
};
