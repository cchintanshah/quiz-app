// ============================================================================
// CONFIGURATION - SET THESE VALUES
// ============================================================================
const GITHUB_TOKEN = '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'; // Your GitHub Personal Access Token
const DATA_REPO_OWNER = 'cchintanshah'; // Your GitHub username
const DATA_REPO_NAME = 'quiz-data'; // Your private repo name
const DATA_REPO_BRANCH = 'main'; // Branch name

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let allQuestions = [];
let currentPart = 1;
let currentIndex = 0;
let score = 0;
let showFeedback = false;
let userAnswers = [];
let partScores = Array(8).fill(0);
let partStatus = Array(8).fill('not-started');
let questionTimer = null;
let finalExamTimer = null;
let questionTimeLeft = 90;
let finalExamTimeLeft = 90 * 60;
let isFinalExam = false;
let userLicenseKey = '';
let isAdminUser = false;

// Part definitions
const partDefinitions = [
  { id: 1, name: "Section 1", start: 0, end: 59, count: 60, icon: "fas fa-hashtag" },
  { id: 2, name: "Section 2", start: 60, end: 119, count: 60, icon: "fas fa-hashtag" },
  { id: 3, name: "Section 3", start: 120, end: 179, count: 60, icon: "fas fa-hashtag" },
  { id: 4, name: "Section 4", start: 180, end: 239, count: 60, icon: "fas fa-hashtag" },
  { id: 5, name: "Section 5", start: 240, end: 299, count: 60, icon: "fas fa-hashtag" },
  { id: 6, name: "Section 6", start: 300, end: 359, count: 60, icon: "fas fa-hashtag" },
  { id: 7, name: "Section 7", start: 360, end: 384, count: 25, icon: "fas fa-hashtag" },
  { id: 8, name: "Final Exam", start: 0, end: 384, count: 60, icon: "fas fa-star" }
];

// ============================================================================
// GITHUB API FUNCTIONS
// ============================================================================

/**
 * GitHub API Helper - Make authenticated requests
 */
async function githubApi(endpoint, method = 'GET', data = null) {
  const url = `https://api.github.com/${endpoint}`;
  
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
  
  const options = {
    method,
    headers,
    body: data ? JSON.stringify(data) : null
  };
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }
    
    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('GitHub API request failed:', error);
    throw error;
  }
}

/**
 * Get file content from the data repository
 */
async function getGitHubFile(filePath) {
  try {
    const endpoint = `repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/${filePath}?ref=${DATA_REPO_BRANCH}`;
    const fileData = await githubApi(endpoint);
    
    if (fileData.content) {
      // Decode base64 content
      const content = atob(fileData.content.replace(/\s/g, ''));
      return JSON.parse(content);
    }
    
    return null;
  } catch (error) {
    console.warn(`File ${filePath} not found or error:`, error.message);
    return null;
  }
}

/**
 * Create or update a file in the data repository
 */
async function putGitHubFile(filePath, content, message) {
  try {
    // First, try to get the file to get its SHA (if it exists)
    let sha = null;
    try {
      const endpoint = `repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/${filePath}?ref=${DATA_REPO_BRANCH}`;
      const existingFile = await githubApi(endpoint);
      sha = existingFile.sha;
    } catch (e) {
      // File doesn't exist yet, that's OK
    }
    
    // Encode content to base64
    const encodedContent = btoa(JSON.stringify(content, null, 2));
    
    const endpoint = `repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/${filePath}`;
    const data = {
      message: message || `Update ${filePath}`,
      content: encodedContent,
      branch: DATA_REPO_BRANCH
    };
    
    if (sha) {
      data.sha = sha;
    }
    
    return await githubApi(endpoint, 'PUT', data);
  } catch (error) {
    console.error('Failed to save file to GitHub:', error);
    throw error;
  }
}

/**
 * Validate license key
 */
async function validateLicenseKey(licenseKey) {
  try {
    // First check local storage for quick validation
    const savedLicense = localStorage.getItem('userLicenseKey');
    const savedLicenseData = localStorage.getItem('licenseData');
    
    if (savedLicense === licenseKey && savedLicenseData) {
      const localData = JSON.parse(savedLicenseData);
      if (localData.valid && (!localData.used || isAdminUser)) {
        return {
          valid: true,
          isAdmin: licenseKey === localData.adminKey,
          message: 'License validated from cache'
        };
      }
    }
    
    // Get license data from GitHub
    const licenseData = await getGitHubFile('licenses.json');
    
    if (!licenseData) {
      throw new Error('License database not found');
    }
    
    // Check admin key
    if (licenseKey === licenseData.admin_key) {
      return {
        valid: true,
        isAdmin: true,
        message: 'Admin access granted'
      };
    }
    
    // Check regular license keys
    const keyEntry = licenseData.keys.find(k => k.key === licenseKey);
    
    if (!keyEntry) {
      return {
        valid: false,
        message: 'Invalid license key'
      };
    }
    
    if (keyEntry.used && !isAdminUser) {
      return {
        valid: false,
        message: 'This license key has already been used'
      };
    }
    
    // Mark as used (unless admin)
    if (!isAdminUser) {
      keyEntry.used = true;
      keyEntry.used_at = new Date().toISOString();
      keyEntry.last_access = new Date().toISOString();
      
      // Save updated licenses back to GitHub
      await putGitHubFile('licenses.json', licenseData, `Mark license ${licenseKey} as used`);
    }
    
    // Save to local storage for faster future validation
    localStorage.setItem('userLicenseKey', licenseKey);
    localStorage.setItem('licenseData', JSON.stringify({
      valid: true,
      used: keyEntry.used,
      adminKey: licenseData.admin_key,
      timestamp: new Date().toISOString()
    }));
    
    return {
      valid: true,
      isAdmin: false,
      message: 'License validated successfully'
    };
    
  } catch (error) {
    console.error('License validation failed:', error);
    
    // Fallback: Check against hardcoded keys if GitHub API fails
    return validateLicenseOffline(licenseKey);
  }
}

/**
 * Offline license validation (fallback)
 */
function validateLicenseOffline(licenseKey) {
  // Hardcoded license keys for offline fallback
  const OFFLINE_KEYS = [
    'LICENSE-001-ABCDE', 'LICENSE-002-FGHIJ', 'LICENSE-003-KLMNO',
    'LICENSE-004-PQRST', 'LICENSE-005-UVWXY', 'LICENSE-006-ZABCD',
    'LICENSE-007-EFGHI', 'LICENSE-008-JKLMN', 'LICENSE-009-OPQRS',
    'LICENSE-010-TUVWX', 'LICENSE-011-YZABC', 'LICENSE-012-DEFGH',
    'LICENSE-013-IJKLM', 'LICENSE-014-NOPQR', 'LICENSE-015-STUVW',
    'LICENSE-016-XYZAB', 'LICENSE-017-CDEFG', 'LICENSE-018-HIJKL',
    'LICENSE-019-MNOPQ', 'LICENSE-020-RSTUV'
  ];
  
  const OFFLINE_ADMIN = 'MASTER-ADMIN-12345';
  
  // Check local storage for used keys
  const usedKeys = JSON.parse(localStorage.getItem('usedLicenseKeys') || '[]');
  
  if (licenseKey === OFFLINE_ADMIN) {
    return {
      valid: true,
      isAdmin: true,
      message: 'Admin access (offline mode)'
    };
  }
  
  if (OFFLINE_KEYS.includes(licenseKey) && !usedKeys.includes(licenseKey)) {
    // Mark as used locally
    usedKeys.push(licenseKey);
    localStorage.setItem('usedLicenseKeys', JSON.stringify(usedKeys));
    
    return {
      valid: true,
      isAdmin: false,
      message: 'License validated (offline mode)'
    };
  }
  
  return {
    valid: false,
    message: 'Invalid or already used license key'
  };
}

/**
 * Save user progress to GitHub
 */
async function saveProgressToGitHub() {
  if (!userLicenseKey) {
    console.warn('No license key, cannot save progress');
    saveProgressToLocal(); // Fallback to local storage
    return;
  }
  
  const progressData = {
    licenseKey: userLicenseKey,
    currentPart,
    currentIndex,
    userAnswers,
    partScores,
    partStatus,
    lastSaved: new Date().toISOString(),
    totalScore: partScores.reduce((sum, score) => sum + score, 0)
  };
  
  try {
    // Save to GitHub
    const fileName = `progress/${userLicenseKey}.json`;
    await putGitHubFile(fileName, progressData, `Save progress for ${userLicenseKey}`);
    
    console.log('Progress saved to GitHub');
    
    // Also save locally as backup
    saveProgressToLocal();
    
  } catch (error) {
    console.error('Failed to save progress to GitHub:', error);
    // Fallback to local storage
    saveProgressToLocal();
  }
}

/**
 * Load user progress from GitHub
 */
async function loadProgressFromGitHub() {
  if (!userLicenseKey) {
    console.warn('No license key, cannot load progress');
    loadProgressFromLocal(); // Fallback to local storage
    return;
  }
  
  try {
    const fileName = `progress/${userLicenseKey}.json`;
    const progressData = await getGitHubFile(fileName);
    
    if (progressData) {
      // Restore progress
      currentPart = progressData.currentPart || 1;
      currentIndex = progressData.currentIndex || 0;
      userAnswers = progressData.userAnswers || [];
      partScores = progressData.partScores || Array(8).fill(0);
      partStatus = progressData.partStatus || Array(8).fill('not-started');
      
      console.log('Progress loaded from GitHub');
      
      // Update UI
      if (currentPart > 0 && currentIndex > 0) {
        showNotification('Progress loaded successfully', 'success');
      }
    } else {
      console.log('No saved progress found on GitHub');
      loadProgressFromLocal(); // Try local storage
    }
    
  } catch (error) {
    console.error('Failed to load progress from GitHub:', error);
    loadProgressFromLocal(); // Fallback to local storage
  }
}

/**
 * Save progress to local storage as backup
 */
function saveProgressToLocal() {
  if (!userLicenseKey) {
    const tempKey = 'temp_user_' + Date.now();
    userLicenseKey = tempKey;
  }
  
  const progressData = {
    licenseKey: userLicenseKey,
    currentPart,
    currentIndex,
    userAnswers,
    partScores,
    partStatus,
    lastSaved: new Date().toISOString()
  };
  
  localStorage.setItem('quizProgress', JSON.stringify(progressData));
  console.log('Progress saved locally');
}

/**
 * Load progress from local storage
 */
function loadProgressFromLocal() {
  const savedProgress = localStorage.getItem('quizProgress');
  
  if (savedProgress) {
    try {
      const progressData = JSON.parse(savedProgress);
      
      // Only load if it's for the current user or no license key is set
      if (!userLicenseKey || progressData.licenseKey === userLicenseKey) {
        currentPart = progressData.currentPart || 1;
        currentIndex = progressData.currentIndex || 0;
        userAnswers = progressData.userAnswers || [];
        partScores = progressData.partScores || Array(8).fill(0);
        partStatus = progressData.partStatus || Array(8).fill('not-started');
        
        console.log('Progress loaded from local storage');
        
        if (progressData.licenseKey && !userLicenseKey) {
          userLicenseKey = progressData.licenseKey;
        }
      }
    } catch (error) {
      console.error('Error loading local progress:', error);
    }
  }
}

// ============================================================================
// LOCK SCREEN FUNCTIONS
// ============================================================================

/**
 * Check if app should be locked
 */
function checkAppLock() {
  // Check if user has a valid license in localStorage
  const savedLicense = localStorage.getItem('userLicenseKey');
  const licenseData = localStorage.getItem('licenseData');
  
  if (savedLicense && licenseData) {
    try {
      const data = JSON.parse(licenseData);
      
      // Check if license is still valid
      const now = new Date();
      const savedTime = new Date(data.timestamp);
      const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);
      
      // Consider license valid for 30 days from last validation
      if (data.valid && daysDiff < 30) {
        userLicenseKey = savedLicense;
        isAdminUser = savedLicense === data.adminKey;
        
        // Auto-unlock
        unlockApp();
        return false;
      }
    } catch (error) {
      console.error('Error parsing license data:', error);
    }
  }
  
  // Show lock screen
  showLockScreen();
  return true;
}

/**
 * Show lock screen
 */
function showLockScreen() {
  document.body.classList.add('locked');
  document.getElementById('lockScreen').style.display = 'flex';
}

/**
 * Hide lock screen
 */
function hideLockScreen() {
  document.body.classList.remove('locked');
  document.getElementById('lockScreen').style.display = 'none';
}

/**
 * Unlock the app with license key
 */
async function unlockApp() {
  const licenseInput = document.getElementById('licenseInput');
  const lockMessage = document.getElementById('lockMessage');
  const licenseKey = licenseInput.value.trim();
  
  if (!licenseKey) {
    showMessage(lockMessage, 'Please enter a license key', 'error');
    return;
  }
  
  showMessage(lockMessage, 'Validating license...', 'info');
  
  // Validate license key
  const validation = await validateLicenseKey(licenseKey);
  
  if (validation.valid) {
    userLicenseKey = licenseKey;
    isAdminUser = validation.isAdmin;
    
    // Save license info
    localStorage.setItem('userLicenseKey', licenseKey);
    localStorage.setItem('licenseData', JSON.stringify({
      valid: true,
      isAdmin: validation.isAdmin,
      adminKey: validation.isAdmin ? licenseKey : null,
      timestamp: new Date().toISOString()
    }));
    
    showMessage(lockMessage, validation.message + '! Loading your progress...', 'success');
    
    // Load user progress
    setTimeout(async () => {
      await loadProgressFromGitHub();
      hideLockScreen();
      initializeQuiz();
    }, 1500);
    
  } else {
    showMessage(lockMessage, validation.message, 'error');
  }
}

/**
 * Show message in lock screen
 */
function showMessage(element, message, type) {
  element.textContent = message;
  element.className = 'message ' + type;
  element.style.display = 'block';
}

/**
 * Reset local data (for testing)
 */
function resetLocalData() {
  if (confirm('Are you sure you want to reset all local data? This will remove your progress and license.')) {
    localStorage.removeItem('userLicenseKey');
    localStorage.removeItem('licenseData');
    localStorage.removeItem('quizProgress');
    localStorage.removeItem('usedLicenseKeys');
    
    document.getElementById('lockMessage').innerHTML = 
      '<div class="success">Local data reset. Please refresh the page.</div>';
    
    setTimeout(() => {
      location.reload();
    }, 2000);
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()">&times;</button>
  `;
  
  // Add styles if not already added
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-width: 300px;
        max-width: 400px;
        animation: slideIn 0.3s ease;
      }
      .notification.success { background: #48bb78; }
      .notification.error { background: #f56565; }
      .notification.info { background: #667eea; }
      .notification button {
        background: none;
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        margin-left: 10px;
      }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// ============================================================================
// QUIZ FUNCTIONS (Modified from your original code)
// ============================================================================

/**
 * Initialize the quiz
 */
async function initializeQuiz() {
  // Load questions
  try {
    const response = await fetch("questions.json");
    allQuestions = await response.json();
  } catch (error) {
    console.error('Error loading questions:', error);
    document.getElementById('question').innerText = 'Error loading questions.';
    return;
  }
  
  // Show selection screen if no progress, otherwise start quiz
  if (currentPart === 1 && currentIndex === 0) {
    showSelectionScreen();
  } else {
    // Resume from saved progress
    loadPart(currentPart);
  }
}

// ============================================================================
// MODIFIED QUIZ FUNCTIONS (Auto-save added)
// ============================================================================

// Modify your existing functions to auto-save progress

// After each question answer, add:
function evaluateAnswer(isTimeUp = false) {
  // ... your existing evaluateAnswer code ...
  
  // Auto-save after answering
  setTimeout(() => {
    saveProgressToGitHub();
  }, 500);
}

// When moving to next question, add:
document.getElementById('submitNextBtn').addEventListener('click', () => {
  // ... your existing next button code ...
  
  // Auto-save
  setTimeout(() => {
    saveProgressToGitHub();
  }, 500);
});

// When submitting section, add:
function submitSection() {
  // ... your existing submitSection code ...
  
  // Save final progress
  saveProgressToGitHub();
}

// When loading a part, save progress
function loadPart(partNumber) {
  // ... your existing loadPart code ...
  
  // Save that we changed sections
  setTimeout(() => {
    saveProgressToGitHub();
  }, 1000);
}

// ============================================================================
// ADMIN FUNCTIONS (For you to manage licenses)
// ============================================================================

/**
 * Create Admin Panel (Keep this secret!)
 * Create a separate HTML file: admin.html
 */

// admin.html content:
/*
<!DOCTYPE html>
<html>
<head>
  <title>Quiz Admin Panel</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .container { max-width: 800px; margin: 0 auto; }
    .card { background: #f5f5f5; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    input, button { padding: 10px; margin: 5px; }
    .key-list { background: white; padding: 15px; border-radius: 5px; }
    .key-item { padding: 5px; border-bottom: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Quiz Admin Panel</h1>
    
    <div class="card">
      <h3>Generate New License Keys</h3>
      <input type="number" id="count" placeholder="Number of keys" value="5">
      <button onclick="generateKeys()">Generate</button>
      <div id="newKeys" class="key-list"></div>
    </div>
    
    <div class="card">
      <h3>View Used Licenses</h3>
      <button onclick="loadLicenses()">Refresh</button>
      <div id="usedKeys" class="key-list"></div>
    </div>
    
    <div class="card">
      <h3>View User Progress</h3>
      <input type="text" id="searchKey" placeholder="Enter license key">
      <button onclick="viewProgress()">View Progress</button>
      <div id="progressData" class="key-list"></div>
    </div>
  </div>
  
  <script>
    const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';
    const DATA_REPO_OWNER = 'YOUR_USERNAME';
    const DATA_REPO_NAME = 'quiz-data';
    
    async function githubApi(endpoint, method = 'GET', data = null) {
      const response = await fetch(`https://api.github.com/${endpoint}`, {
        method,
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: data ? JSON.stringify(data) : null
      });
      return await response.json();
    }
    
    async function generateKeys() {
      const count = document.getElementById('count').value;
      const response = await githubApi(`repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/licenses.json`);
      const content = JSON.parse(atob(response.content.replace(/\s/g, '')));
      
      for (let i = 0; i < count; i++) {
        const key = `LIC-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        content.keys.push({
          key: key,
          used: false,
          created_at: new Date().toISOString(),
          price_paid: 0
        });
      }
      
      const encoded = btoa(JSON.stringify(content, null, 2));
      await githubApi(`repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/licenses.json`, 'PUT', {
        message: `Generate ${count} new license keys`,
        content: encoded,
        sha: response.sha
      });
      
      document.getElementById('newKeys').innerHTML = 
        `<h4>Generated ${count} new keys:</h4>` +
        content.keys.slice(-count).map(k => 
          `<div class="key-item"><strong>${k.key}</strong> - Not used</div>`
        ).join('');
    }
    
    async function loadLicenses() {
      const response = await githubApi(`repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/licenses.json`);
      const content = JSON.parse(atob(response.content.replace(/\s/g, '')));
      
      const used = content.keys.filter(k => k.used);
      const unused = content.keys.filter(k => !k.used);
      
      document.getElementById('usedKeys').innerHTML = `
        <h4>Used Licenses: ${used.length}</h4>
        ${used.map(k => `<div class="key-item">${k.key} - Used on ${k.used_at}</div>`).join('')}
        <hr>
        <h4>Unused Licenses: ${unused.length}</h4>
        ${unused.map(k => `<div class="key-item">${k.key}</div>`).join('')}
      `;
    }
    
    async function viewProgress() {
      const key = document.getElementById('searchKey').value;
      try {
        const response = await githubApi(`repos/${DATA_REPO_OWNER}/${DATA_REPO_NAME}/contents/progress/${key}.json`);
        const progress = JSON.parse(atob(response.content.replace(/\s/g, '')));
        
        document.getElementById('progressData').innerHTML = `
          <h4>Progress for ${key}</h4>
          <pre>${JSON.stringify(progress, null, 2)}</pre>
        `;
      } catch (error) {
        document.getElementById('progressData').innerHTML = 
          `<div style="color: red;">No progress found for ${key}</div>`;
      }
    }
    
    // Load licenses on page load
    loadLicenses();
  </script>
</body>
</html>
*/

// ============================================================================
// INITIALIZATION
// ============================================================================

// Start the app
document.addEventListener('DOMContentLoaded', async () => {
  // First check if app should be locked
  const isLocked = checkAppLock();
  
  if (!isLocked) {
    // App is unlocked, initialize quiz
    await initializeQuiz();
  }
  
  // Load existing quiz functions (keep your existing code below)
  // ... rest of your existing initialization code ...
});

// IMPORTANT: Keep all your existing quiz functions below this point
// They will work as before, but now with auto-save functionality