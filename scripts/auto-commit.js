#!/usr/bin/env node
const { execSync } = require('child_process');
const args = process.argv.slice(2);

function usage() {
  console.log('Usage: node scripts/auto-commit.js [-m "message"] [--push]');
  process.exit(1);
}

let message = null;
let push = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-m' || a === '--message') {
    message = args[i+1];
    i++;
  } else if (a === '--push') {
    push = true;
  } else if (a === '-h' || a === '--help') {
    usage();
  }
}

if (!message) {
  const now = new Date().toISOString();
  message = `chore: auto-commit changes ${now}`;
}

try {
  // Show status
  console.log(execSync('git status --porcelain', { encoding: 'utf8' }));

  // Stage all changes (including untracked)
  console.log('Staging all changes...');
  execSync('git add -A', { stdio: 'inherit' });

  // Commit
  console.log(`Committing: ${message}`);
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

  if (push) {
    console.log('Pushing to origin HEAD...');
    execSync('git push origin HEAD', { stdio: 'inherit' });
  }

  console.log('Done.');
} catch (err) {
  console.error('auto-commit failed:', err.message || err);
  process.exit(1);
}
