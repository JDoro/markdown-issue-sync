const { resolveDirection } = require('../src/direction');

describe('Direction Resolution', () => {
  test.each(['push', 'workflow_dispatch', 'schedule'])(
    'maps %s event to to-issues',
    (eventName) => {
      expect(resolveDirection(eventName, undefined)).toEqual({ direction: 'to-issues' });
    }
  );

  test.each(['closed', 'reopened'])(
    'maps issues %s event to to-markdown',
    (issueAction) => {
      expect(resolveDirection('issues', issueAction)).toEqual({ direction: 'to-markdown' });
    }
  );

  test.each(['opened', 'edited', 'labeled', 'assigned', 'deleted'])(
    'skips issues %s event without throwing',
    (issueAction) => {
      const result = resolveDirection('issues', issueAction);
      expect(result.skip).toBe(true);
      expect(result.reason).toContain(issueAction);
    }
  );

  test('fails fast for unmapped events with guidance', () => {
    expect(() => resolveDirection('pull_request', 'opened')).toThrow(/pull_request/);
    expect(() => resolveDirection('pull_request', 'opened')).toThrow(/direction/);
    expect(() => resolveDirection('release', 'published')).toThrow(/Could not auto-detect/);
  });
});
