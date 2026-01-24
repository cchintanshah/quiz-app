// dev.js - For local testing
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const DATA_REPO_OWNER = process.env.DATA_REPO_OWNER;

if (!GITHUB_TOKEN) {
  console.error('❌ Please set GITHUB_TOKEN in .env.local file');
  console.log('📝 Create .env.local file with:');
  console.log('GITHUB_TOKEN=your_token_here');
  console.log('DATA_REPO_OWNER=yourusername');
  process.exit(1);
}

// Process script.js for local testing
let scriptContent = fs.readFileSync('src/script.js', 'utf8');
scriptContent = scriptContent.replace(/{{GITHUB_TOKEN}}/g, GITHUB_TOKEN);
scriptContent = scriptContent.replace(/{{DATA_REPO_OWNER}}/g, DATA_REPO_OWNER);

fs.writeFileSync('src/script-with-token.js', scriptContent, 'utf8');

console.log('✅ Created src/script-with-token.js for local testing');
console.log('📝 To test locally:');
console.log('1. Open src/index.html');
console.log('2. Change script src to "script-with-token.js"');
console.log('3. Refresh the page');