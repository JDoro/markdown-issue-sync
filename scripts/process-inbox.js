const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const INBOX_DIR = path.join(process.cwd(), 'issues', 'inbox');
const PROCESSED_DIR = path.join(process.cwd(), 'issues', 'processed');

async function fetchIssueSnapshot(repoFullName, token) {
  const snapshot = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues?state=all&per_page=100&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub API responded with status ${response.status}: ${await response.text()}`);
    }
    const issues = await response.json();
    for (const i of issues) {
      if (!i.pull_request && typeof i.body === 'string') {
        snapshot.push({ number: i.number, body: i.body });
      }
    }
    if (issues.length < 100) {
      return snapshot;
    }
  }
}

async function processInbox() {
  let hadFailure = false;
  const token = process.env.GITHUB_TOKEN;
  const repoFullName = process.env.GITHUB_REPOSITORY;

  if (!token || !repoFullName) {
    console.error('GITHUB_TOKEN and GITHUB_REPOSITORY environment variables are required.');
    process.exit(1);
  }

  let files;
  try {
    files = fs.readdirSync(INBOX_DIR);
  } catch (err) {
    console.error(`Failed to read directory ${INBOX_DIR}:`, err);
    process.exit(1);
  }

  let snapshot = null;
  const findExistingIssue = async (marker) => {
    if (!snapshot) {
      snapshot = await fetchIssueSnapshot(repoFullName, token);
    }
    return snapshot.find(i => i.body.includes(marker)) || null;
  };

  for (const file of files) {
    if (!file.endsWith('.md')) {
      continue;
    }

    const filePath = path.join(INBOX_DIR, file);

    // YYYYMMDD-HHmmss-Issue Title.md -> Issue Title
    const match = file.match(/^\d{8}-\d{6}-(.+)\.md$/);
    if (!match) {
      console.warn(`File ${file} does not match the expected format YYYYMMDD-HHmmss-Issue Title.md, skipping.`);
      continue;
    }
    const issueTitle = match[1];

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`Failed to read file ${filePath}:`, err);
      hadFailure = true;
      continue;
    }

    console.log(`Creating issue "${issueTitle}" from ${file}...`);
    try {
      const marker = `<!-- markdown-issue-sync:inbox-id=${crypto.createHash('sha256').update(file).digest('hex').slice(0, 16)} -->`;
      let issueNumber;
      const existing = await findExistingIssue(marker);
      if (existing) {
        issueNumber = existing.number;
        console.log(`Found existing issue #${issueNumber} for ${file}, reusing.`);
      } else {
        const issueBody = `${content}\n\n${marker}`;
        const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: issueTitle,
            body: issueBody
          })
        });

        if (!response.ok) {
          throw new Error(`GitHub API responded with status ${response.status}: ${await response.text()}`);
        }

        const responseData = await response.json();
        issueNumber = responseData.number;
        snapshot.push({ number: issueNumber, body: issueBody });
        console.log(`Successfully created issue #${issueNumber}`);
      }

      const newContent = content.startsWith('---\n') || content.startsWith('---\r\n')
        ? content
        : `---\nissue_number: ${issueNumber}\n---\n${content}`;
      fs.mkdirSync(PROCESSED_DIR, { recursive: true });
      const processedFilePath = path.join(PROCESSED_DIR, file);
      fs.writeFileSync(processedFilePath, newContent, 'utf-8');
      fs.unlinkSync(filePath);
      console.log(`Moved ${file} to processed folder.`);

    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
      hadFailure = true;
    }
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

processInbox().catch(err => {
  console.error(err);
  process.exit(1);
});
