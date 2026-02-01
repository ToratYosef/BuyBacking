const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const forbiddenPatterns = [
  /httpsCallable/g,
  /firebase\/functions/g,
  /functions\.httpsCallable/g,
  /cloudfunctions\.net/g,
  /getFunctions\(/g,
  /us-central1-buyback-a0f05\.cloudfunctions\.net/g,
];

function shouldIgnoreDir(dirPath) {
  const relative = path.relative(ROOT, dirPath);
  if (!relative) return false;
  const normalized = relative.split(path.sep).join('/');
  const segments = normalized.split('/');
  if (segments.includes('node_modules')) return true;
  if (segments.includes('.git')) return true;
  return false;
}

function collectFiles(dir, files = []) {
  if (shouldIgnoreDir(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (entry.isFile()) {
      if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function checkFile(filePath) {
  if (filePath.endsWith(`${path.sep}tools${path.sep}check-no-functions.js`)) {
    return [];
  }
  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents.split(/\r?\n/);
  const matches = [];

  lines.forEach((line, index) => {
    forbiddenPatterns.forEach((pattern) => {
      if (pattern.test(line)) {
        matches.push({
          line: index + 1,
          content: line.trim(),
          pattern: pattern.toString(),
        });
      }
      pattern.lastIndex = 0;
    });
  });

  return matches;
}

function run() {
  const files = collectFiles(ROOT);
  const violations = [];

  files.forEach((filePath) => {
    const matches = checkFile(filePath);
    if (matches.length) {
      violations.push({ filePath, matches });
    }
  });

  if (violations.length) {
    console.error('Forbidden Firebase Functions usage found:');
    violations.forEach(({ filePath, matches }) => {
      const relative = path.relative(ROOT, filePath);
      matches.forEach((match) => {
        console.error(`- ${relative}:${match.line} :: ${match.content}`);
      });
    });
    process.exit(1);
  }

  console.log('✅ No Firebase Functions usage detected.');
}

run();
