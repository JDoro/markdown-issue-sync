const MARKDOWN_EVENTS = ['push', 'workflow_dispatch', 'schedule'];
const ISSUE_STATE_ACTIONS = ['closed', 'reopened'];

function resolveDirection(eventName, issueAction) {
  if (MARKDOWN_EVENTS.includes(eventName)) {
    return { direction: 'to-issues' };
  }

  if (eventName === 'issues') {
    if (ISSUE_STATE_ACTIONS.includes(issueAction)) {
      return { direction: 'to-markdown' };
    }
    return {
      skip: true,
      reason: `Issues event action "${issueAction}" does not affect task state; skipping sync.`,
    };
  }

  throw new Error(
    `Could not auto-detect sync direction for event "${eventName}". ` +
      'Supported events: push, workflow_dispatch, schedule, issues (closed/reopened). ' +
      'Set the "direction" input explicitly to override.'
  );
}

module.exports = { resolveDirection };
