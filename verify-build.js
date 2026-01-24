// verify-build.js - Verify the built files
const fs = require('fs');
const crypto = require('crypto');

console.log('🔍 Verifying build...');

// Check if dist directory exists
if (!fs.existsSync('dist')) {
  console.error('❌ dist/ directory not found');
  process.exit(1);
}

// List of required files
const requiredFiles = ['index.html', 'style.css', 'script.js', 'questions.json'];

// Check each file
requiredFiles.forEach(file => {
  const filePath = `dist/${file}`;
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing file: ${filePath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
  
  console.log(`✅ ${file}: ${sizeKB} KB`);
  
  // Check for placeholders (should NOT exist in built files)
  if (content.includes('{{GITHUB_TOKEN}}')) {
    console.error(`❌ Found placeholder {{GITHUB_TOKEN}} in ${file}`);
    process.exit(1);
  }
  
  if (content.includes('{{DATA_REPO_OWNER}}')) {
    console.error(`❌ Found placeholder {{DATA_REPO_OWNER}} in ${file}`);
    process.exit(1);
  }
  
  // Check if token was injected (only for script.js)
  if (file === 'script.js') {
    // Token should be at least 10 characters and not a placeholder
    const tokenMatch = content.match(/const GITHUB_TOKEN = '([^']+)'/);
    if (tokenMatch) {
      const token = tokenMatch[1];
      if (token.length < 10) {
        console.error(`❌ Token seems too short in ${file}`);
        process.exit(1);
      }
      console.log(`✅ Token injection verified in ${file}`);
    }
  }
});

// Generate checksum of important files
console.log('\n🔐 File checksums:');
['script.js', 'questions.json'].forEach(file => {
  const content = fs.readFileSync(`dist/${file}`, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  console.log(`📄 ${file}: ${hash.substring(0, 16)}...`);
});

console.log('\n🎉 Build verification complete! All checks passed.');