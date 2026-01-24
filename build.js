const fs = require('fs');
const path = require('path');

console.log('🚀 Starting build process...');

// Read the configuration from environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const DATA_REPO_OWNER = process.env.DATA_REPO_OWNER || 'cchintanshah'; // Default fallback

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

// Create build directory
const buildDir = 'dist';
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

// Function to process files and replace placeholders
function processFile(filePath, outputPath) {
  console.log(`📄 Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace placeholders
  content = content.replace(/{{GITHUB_TOKEN}}/g, GITHUB_TOKEN);
  content = content.replace(/{{DATA_REPO_OWNER}}/g, DATA_REPO_OWNER);
  
  // Write processed file
  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`✅ Created: ${outputPath}`);
}

// Process all files in src directory
const srcDir = 'src';
const files = fs.readdirSync(srcDir);

files.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(buildDir, file);
  
  if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.json')) {
    processFile(srcPath, destPath);
  } else {
    // Copy other files as-is
    fs.copyFileSync(srcPath, destPath);
    console.log(`📋 Copied: ${file}`);
  }
});

console.log('🎉 Build completed successfully!');
console.log(`📁 Built files are in: ${buildDir}/`);