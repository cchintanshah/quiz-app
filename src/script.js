// ============================================================================
// CONFIGURATION - WILL BE REPLACED BY GITHUB ACTIONS
// ============================================================================
const GITHUB_TOKEN = '{{GITHUB_TOKEN}}';
const DATA_REPO_OWNER = '{{DATA_REPO_OWNER}}';
const DATA_REPO_NAME = 'quiz-data';
const DATA_REPO_BRANCH = 'main';

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
let partStatus = Array(8).fill('not-started'); // 'not-started', 'in-progress', 'completed'
let questionTimer = null;
let finalExamTimer = null;
let questionTimeLeft = 90; // 90 seconds per question
let finalExamTimeLeft = 90 * 60; // 90 minutes for final exam
let isFinalExam = false;
let userLicenseKey = '';
let isAdminUser = false;
let isAppInitialized = false;
let isQuizStarted = false;

// Part definitions: [startIndex, endIndex, questionCount]
const partDefinitions = [
  { id: 1, name: "Section 1", start: 0, end: 59, count: 60, icon: "fas fa-hashtag" },      // Q1-60
  { id: 2, name: "Section 2", start: 60, end: 119, count: 60, icon: "fas fa-hashtag" },   // Q61-120
  { id: 3, name: "Section 3", start: 120, end: 179, count: 60, icon: "fas fa-hashtag" },  // Q121-180
  { id: 4, name: "Section 4", start: 180, end: 239, count: 60, icon: "fas fa-hashtag" },  // Q181-240
  { id: 5, name: "Section 5", start: 240, end: 299, count: 60, icon: "fas fa-hashtag" },  // Q241-300
  { id: 6, name: "Section 6", start: 300, end: 359, count: 60, icon: "fas fa-hashtag" },  // Q301-360
  { id: 7, name: "Section 7", start: 360, end: 384, count: 25, icon: "fas fa-hashtag" },  // Q361-385
  { id: 8, name: "Final Exam", start: 0, end: 384, count: 60, icon: "fas fa-star" }       // Random 60 from all questions
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
 * Validate license key against GitHub
 */
async function validateLicenseKey(licenseKey) {
  console.log(`🔑 Validating license: ${licenseKey.substring(0, 8)}...`);
  
  try {
    // First check local storage for quick validation (cache for 24 hours)
    const savedLicense = localStorage.getItem('userLicenseKey');
    const savedLicenseData = localStorage.getItem('licenseData');
    
    if (savedLicense === licenseKey && savedLicenseData) {
      try {
        const localData = JSON.parse(savedLicenseData);
        const now = new Date();
        const savedTime = new Date(localData.timestamp);
        const hoursDiff = (now - savedTime) / (1000 * 60 * 60);
        
        if (localData.valid && hoursDiff < 24) {
          console.log('✅ License validated from cache');
          return {
            valid: true,
            isAdmin: licenseKey === localData.adminKey,
            message: 'License validated (cached)'
          };
        }
      } catch (e) {
        console.log('Cache parse error, proceeding to GitHub validation');
      }
    }
    
    // Get license data from GitHub
    const licenseData = await getGitHubFile('licenses.json');
    
    if (!licenseData) {
      console.error('❌ License database not found on GitHub');
      // Fallback to offline validation
      return validateLicenseOffline(licenseKey);
    }
    
    // Check admin key
    if (licenseKey === licenseData.admin_key) {
      console.log('✅ Admin access granted');
      return {
        valid: true,
        isAdmin: true,
        message: 'Admin access granted'
      };
    }
    
    // Check regular license keys
    const keyEntry = licenseData.keys.find(k => k.key === licenseKey);
    
    if (!keyEntry) {
      console.log('❌ Invalid license key');
      return {
        valid: false,
        message: 'Invalid license key'
      };
    }
    
    if (keyEntry.used && !isAdminUser) {
      console.log('❌ License already used');
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
      try {
        await putGitHubFile('licenses.json', licenseData, `Mark license ${licenseKey.substring(0, 10)}... as used`);
        console.log('✅ License marked as used on GitHub');
      } catch (error) {
        console.error('Failed to update license on GitHub:', error);
        // Continue anyway - we'll cache locally
      }
    }
    
    // Save to local storage for faster future validation
    localStorage.setItem('userLicenseKey', licenseKey);
    localStorage.setItem('licenseData', JSON.stringify({
      valid: true,
      used: keyEntry.used,
      adminKey: licenseData.admin_key,
      timestamp: new Date().toISOString()
    }));
    
    console.log('✅ License validated successfully');
    return {
      valid: true,
      isAdmin: false,
      message: 'License validated successfully'
    };
    
  } catch (error) {
    console.error('GitHub license validation failed:', error);
    
    // Fallback: Check against hardcoded keys if GitHub API fails
    return validateLicenseOffline(licenseKey);
  }
}

/**
 * Offline license validation (fallback)
 */
function validateLicenseOffline(licenseKey) {
  console.log('📴 Using offline license validation');
  
  // Hardcoded license keys for offline fallback (first 10 chars only for display)
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
    console.log('✅ Admin access (offline mode)');
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
    localStorage.setItem('userLicenseKey', licenseKey);
    localStorage.setItem('licenseData', JSON.stringify({
      valid: true,
      used: true,
      adminKey: OFFLINE_ADMIN,
      timestamp: new Date().toISOString()
    }));
    
    console.log('✅ License validated (offline mode)');
    return {
      valid: true,
      isAdmin: false,
      message: 'License validated (offline mode)'
    };
  }
  
  if (usedKeys.includes(licenseKey)) {
    console.log('❌ License already used (offline mode)');
    return {
      valid: false,
      message: 'This license key has already been used'
    };
  }
  
  console.log('❌ Invalid license key (offline mode)');
  return {
    valid: false,
    message: 'Invalid license key'
  };
}

/**
 * Save user progress to GitHub
 */
async function saveProgressToGitHub() {
  if (!userLicenseKey) {
    console.warn('⚠️ No license key, cannot save progress to GitHub');
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
    totalScore: partScores.reduce((sum, score) => sum + score, 0),
    isFinalExam: isFinalExam
  };
  
  try {
    // Save to GitHub
    const fileName = `progress/${userLicenseKey}.json`;
    await putGitHubFile(fileName, progressData, `Save progress for ${userLicenseKey.substring(0, 10)}...`);
    
    console.log('💾 Progress saved to GitHub');
    
    // Also save locally as backup
    saveProgressToLocal();
    
  } catch (error) {
    console.error('❌ Failed to save progress to GitHub:', error);
    // Fallback to local storage
    saveProgressToLocal();
  }
}

/**
 * Load user progress from GitHub
 */
async function loadProgressFromGitHub() {
  if (!userLicenseKey) {
    console.warn('⚠️ No license key, cannot load progress from GitHub');
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
      
      console.log(`📂 Progress loaded from GitHub: Part ${currentPart}, Question ${currentIndex + 1}`);
      console.log(`📊 Scores: ${partScores.filter(s => s > 0).length} sections with scores`);
      
      // Show notification if we loaded progress
      if (currentPart > 0 && currentIndex > 0) {
        showNotification('Previous progress loaded successfully!', 'success');
      }
    } else {
      console.log('📭 No saved progress found on GitHub');
      loadProgressFromLocal(); // Try local storage
    }
    
  } catch (error) {
    console.error('❌ Failed to load progress from GitHub:', error);
    loadProgressFromLocal(); // Fallback to local storage
  }
}

/**
 * Save progress to local storage as backup
 */
function saveProgressToLocal() {
  if (!userLicenseKey) {
    // Create a temporary key for anonymous users
    const tempKey = 'temp_user_' + Date.now();
    userLicenseKey = tempKey;
    localStorage.setItem('userLicenseKey', tempKey);
  }
  
  const progressData = {
    licenseKey: userLicenseKey,
    currentPart,
    currentIndex,
    userAnswers,
    partScores,
    partStatus,
    lastSaved: new Date().toISOString(),
    isFinalExam: isFinalExam
  };
  
  localStorage.setItem('quizProgress', JSON.stringify(progressData));
  console.log('💾 Progress saved locally');
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
        
        console.log(`📂 Progress loaded from local: Part ${currentPart}, Question ${currentIndex + 1}`);
        
        if (progressData.licenseKey && !userLicenseKey) {
          userLicenseKey = progressData.licenseKey;
        }
        
        // Show notification if we loaded progress
        if (currentPart > 1 || currentIndex > 0) {
          showNotification('Local progress loaded', 'info');
        }
      }
    } catch (error) {
      console.error('❌ Error loading local progress:', error);
    }
  } else {
    console.log('📭 No local progress found');
  }
}

// ============================================================================
// QUESTIONS LOADING
// ============================================================================

/**
 * Load questions from questions.json
 */
async function loadQuestions() {
  console.log('📚 Loading questions...');
  
  // Show loading indicator
  if (document.getElementById('question')) {
    document.getElementById('question').innerText = 'Loading questions...';
  }
  
  try {
    // Try multiple paths to find questions.json
    const possiblePaths = [
      'questions.json',
      './questions.json',
      '/questions.json',
      'src/questions.json',
      'dist/questions.json'
    ];
    
    let loaded = false;
    let lastError = null;
    
    for (const path of possiblePaths) {
      try {
        console.log(`🔍 Trying path: ${path}`);
        const response = await fetch(path);
        
        if (response.ok) {
          allQuestions = await response.json();
          
          // Validate the loaded data
          if (!Array.isArray(allQuestions)) {
            throw new Error('questions.json should contain an array of questions');
          }
          
          if (allQuestions.length < 385) {
            console.warn(`⚠️ Warning: Expected 385 questions, but loaded ${allQuestions.length}`);
          }
          
          console.log(`✅ Loaded ${allQuestions.length} questions from ${path}`);
          loaded = true;
          break;
        }
      } catch (error) {
        lastError = error;
        console.log(`❌ Failed to load from ${path}:`, error.message);
        continue;
      }
    }
    
    if (!loaded) {
      throw new Error(`Failed to load questions from any path. Last error: ${lastError?.message}`);
    }
    
    // Validate question structure
    validateQuestions();
    
    return true;
    
  } catch (error) {
    console.error('❌ Error loading questions:', error);
    showErrorMessage(
      'Failed to load quiz questions. ' +
      'Please make sure questions.json exists and contains valid JSON data. ' +
      'Check browser console for details.'
    );
    return false;
  }
}

/**
 * Validate loaded questions
 */
function validateQuestions() {
  console.log('🔍 Validating questions...');
  
  let validCount = 0;
  let invalidCount = 0;
  
  allQuestions.forEach((q, index) => {
    if (!q.question || typeof q.question !== 'string') {
      console.error(`❌ Question ${index + 1}: Missing or invalid 'question' field`);
      invalidCount++;
      return;
    }
    
    if (!q.options || typeof q.options !== 'object') {
      console.error(`❌ Question ${index + 1}: Missing or invalid 'options' field`);
      invalidCount++;
      return;
    }
    
    if (!q.correct || !Array.isArray(q.correct)) {
      console.error(`❌ Question ${index + 1}: Missing or invalid 'correct' field`);
      invalidCount++;
      return;
    }
    
    if (!q.type || (q.type !== 'single' && q.type !== 'multi')) {
      console.error(`❌ Question ${index + 1}: Missing or invalid 'type' field (should be 'single' or 'multi')`);
      invalidCount++;
      return;
    }
    
    validCount++;
  });
  
  console.log(`📊 Validation: ${validCount} valid, ${invalidCount} invalid questions`);
  
  if (invalidCount > 0) {
    console.warn(`⚠️ ${invalidCount} questions have validation issues`);
  }
}

// ============================================================================
// LOCK SCREEN FUNCTIONS
// ============================================================================

/**
 * Check if app should be locked
 */
async function checkAppLock() {
  console.log('🔒 Checking app lock status...');
  
  // Check if user has a valid license in localStorage
  const savedLicense = localStorage.getItem('userLicenseKey');
  const licenseDataStr = localStorage.getItem('licenseData');
  
  if (savedLicense && licenseDataStr) {
    try {
      const licenseData = JSON.parse(licenseDataStr);
      
      // Check if license is still valid (within 30 days)
      const now = new Date();
      const savedTime = new Date(licenseData.timestamp);
      const daysDiff = (now - savedTime) / (1000 * 60 * 60 * 24);
      
      if (licenseData.valid && daysDiff < 30) {
        userLicenseKey = savedLicense;
        isAdminUser = savedLicense === licenseData.adminKey;
        
        console.log(`✅ License valid from cache: ${userLicenseKey.substring(0, 10)}... (Admin: ${isAdminUser})`);
        
        // Load questions in background
        const questionsLoaded = await loadQuestions();
        
        if (questionsLoaded) {
          // Load progress and initialize
          await loadProgressFromGitHub();
          unlockApp();
          initializeQuiz();
          return false;
        }
      } else {
        console.log('🔄 License cache expired, re-validating...');
      }
    } catch (error) {
      console.error('Error parsing license cache:', error);
    }
  }
  
  // Show lock screen
  showLockScreen();
  
  // Pre-load questions in background for faster unlock
  loadQuestions().then(success => {
    if (success) {
      console.log('✅ Questions pre-loaded for faster unlock');
    }
  });
  
  return true;
}

/**
 * Show lock screen
 */
function showLockScreen() {
  console.log('🔐 Showing lock screen');
  document.body.classList.add('locked');
  
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) {
    lockScreen.style.display = 'flex';
  }
  
  // Set focus to license input
  setTimeout(() => {
    const licenseInput = document.getElementById('licenseInput');
    if (licenseInput) {
      licenseInput.focus();
    }
  }, 100);
}

/**
 * Hide lock screen
 */
function hideLockScreen() {
  console.log('🔓 Hiding lock screen');
  document.body.classList.remove('locked');
  
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) {
    lockScreen.style.display = 'none';
  }
}

/**
 * Unlock the app with license key
 */
async function unlockApp() {
  const licenseInput = document.getElementById('licenseInput');
  const lockMessage = document.getElementById('lockMessage');
  const licenseKey = licenseInput ? licenseInput.value.trim() : '';
  
  if (!licenseKey) {
    showLockMessage('Please enter a license key', 'error');
    return;
  }
  
  showLockMessage('Validating license...', 'info');
  
  // Disable input and button during validation
  if (licenseInput) licenseInput.disabled = true;
  const unlockBtn = document.querySelector('.unlock-btn');
  if (unlockBtn) unlockBtn.disabled = true;
  
  try {
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
      
      showLockMessage(`${validation.message}! Loading your progress...`, 'success');
      
      // Ensure questions are loaded
      if (allQuestions.length === 0) {
        const questionsLoaded = await loadQuestions();
        if (!questionsLoaded) {
          showLockMessage('Failed to load questions. Please try again.', 'error');
          enableLockInputs();
          return;
        }
      }
      
      // Load user progress
      await loadProgressFromGitHub();
      
      // Hide lock screen and initialize quiz
      setTimeout(() => {
        hideLockScreen();
        initializeQuiz();
        enableLockInputs();
      }, 1000);
      
    } else {
      showLockMessage(validation.message, 'error');
      enableLockInputs();
    }
    
  } catch (error) {
    console.error('Unlock error:', error);
    showLockMessage('Error during validation. Please try again.', 'error');
    enableLockInputs();
  }
}

/**
 * Enable lock screen inputs
 */
function enableLockInputs() {
  const licenseInput = document.getElementById('licenseInput');
  const unlockBtn = document.querySelector('.unlock-btn');
  
  if (licenseInput) licenseInput.disabled = false;
  if (unlockBtn) unlockBtn.disabled = false;
}

/**
 * Show message in lock screen
 */
function showLockMessage(message, type) {
  const element = document.getElementById('lockMessage');
  if (!element) return;
  
  element.textContent = message;
  element.className = 'message ' + type;
  element.style.display = 'block';
  
  // Auto-hide success messages after 3 seconds
  if (type === 'success') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 3000);
  }
}

/**
 * Reset local data (for testing/debugging)
 */
function resetLocalData() {
  if (confirm('Are you sure you want to reset all local data? This will remove your license, progress, and settings.')) {
    localStorage.removeItem('userLicenseKey');
    localStorage.removeItem('licenseData');
    localStorage.removeItem('quizProgress');
    localStorage.removeItem('usedLicenseKeys');
    localStorage.removeItem('allProgress');
    
    document.getElementById('lockMessage').innerHTML = 
      '<div class="success">All local data has been reset. The page will refresh...</div>';
    
    setTimeout(() => {
      location.reload();
    }, 2000);
  }
}

// ============================================================================
// QUIZ INITIALIZATION & CORE FUNCTIONS
// ============================================================================

/**
 * Initialize the quiz
 */
async function initializeQuiz() {
  console.log('🎯 Initializing quiz...');
  
  if (isAppInitialized) {
    console.log('⚠️ Quiz already initialized');
    return;
  }
  
  // Verify questions are loaded
  if (!allQuestions || allQuestions.length === 0) {
    console.error('❌ No questions loaded, trying to load now...');
    const loaded = await loadQuestions();
    if (!loaded) {
      showErrorMessage('Failed to load quiz questions. Please refresh the page.');
      return;
    }
  }
  
  console.log(`📊 Ready with ${allQuestions.length} questions`);
  
  // Update parts list
  renderPartsList();
  updateTotalScore();
  
  // Show selection screen or resume based on progress
  if (currentPart === 1 && currentIndex === 0 && userAnswers.length === 0) {
    console.log('🔄 Starting fresh - showing selection screen');
    showSelectionScreen();
  } else {
    console.log(`🔄 Resuming from progress: Part ${currentPart}, Question ${currentIndex + 1}`);
    loadPart(currentPart);
  }
  
  isAppInitialized = true;
  isQuizStarted = true;
  console.log('✅ Quiz initialized successfully');
}

/**
 * Show selection screen
 */
function showSelectionScreen() {
  console.log('📱 Showing selection screen');
  
  const sectionCards = document.getElementById('sectionCards');
  if (!sectionCards) {
    console.error('❌ sectionCards element not found');
    return;
  }
  
  // Clear existing cards
  sectionCards.innerHTML = '';
  
  // Create cards for each section
  partDefinitions.forEach((part, index) => {
    const status = partStatus[index];
    const score = partScores[index] || 0;
    const isFinalExam = part.id === 8;
    
    const card = document.createElement('div');
    card.className = `section-card ${status} ${isFinalExam ? 'final-exam' : ''}`;
    card.dataset.partId = part.id;
    
    card.innerHTML = `
      <div class="section-icon">
        <i class="${part.icon}"></i>
      </div>
      <h3>${part.name}</h3>
      <p>${isFinalExam ? '60 random questions from all sections' : `Questions ${part.start + 1} - ${part.end + 1}`}</p>
      <div class="section-status status-${status.replace('-', '-')}">
        ${status === 'not-started' ? 'Not Started' : 
          status === 'in-progress' ? 'In Progress' : 'Completed'}
      </div>
      ${status === 'completed' ? 
        `<div class="section-score">${score}/${part.count}</div>` : ''}
    `;
    
    card.addEventListener('click', () => {
      console.log(`🖱️ Clicked on ${part.name}`);
      if (status === 'in-progress' || status === 'completed' || status === 'not-started') {
        loadPart(part.id);
      }
    });
    
    sectionCards.appendChild(card);
  });
  
  // Show selection screen, hide quiz screen
  document.getElementById('selectionScreen').classList.remove('hidden');
  document.getElementById('quizScreen').classList.add('hidden');
  
  console.log('✅ Selection screen shown');
}

/**
 * Show quiz screen
 */
function showQuizScreen() {
  console.log('📝 Showing quiz screen');
  document.getElementById('selectionScreen').classList.add('hidden');
  document.getElementById('quizScreen').classList.remove('hidden');
}

/**
 * Load a specific part
 */
function loadPart(partNumber) {
  console.log(`🔄 Loading part ${partNumber}...`);
  
  if (partNumber < 1 || partNumber > 8) {
    console.error(`❌ Invalid part number: ${partNumber}`);
    return;
  }
  
  const part = partDefinitions[partNumber - 1];
  isFinalExam = partNumber === 8;
  
  // Verify questions are loaded
  if (!allQuestions || allQuestions.length === 0) {
    console.error('❌ Cannot load part: questions not loaded');
    showErrorMessage('Questions not loaded. Please refresh the page.');
    return;
  }
  
  // Switch to quiz screen
  showQuizScreen();
  
  // Reset for this part
  currentPart = partNumber;
  currentIndex = 0;
  showFeedback = false;
  userAnswers = [];
  
  // Get questions for this part
  let partQuestions;
  if (isFinalExam) {
    // For final exam, select 60 random questions from all questions
    partQuestions = getRandomQuestions(60);
    console.log(`🎲 Final exam: Selected ${partQuestions.length} random questions`);
  } else {
    // For regular sections, get questions from the defined range
    const start = Math.max(0, part.start);
    const end = Math.min(allQuestions.length - 1, part.end);
    partQuestions = allQuestions.slice(start, end + 1);
    
    if (partQuestions.length === 0) {
      console.error(`❌ No questions found for part ${partNumber} (range ${start}-${end})`);
      showErrorMessage(`No questions found for ${part.name}.`);
      return;
    }
    
    console.log(`📚 Section ${partNumber}: ${partQuestions.length} questions (${start + 1}-${end + 1})`);
  }
  
  // Shuffle questions within this part
  window.currentPartQuestions = shuffle(partQuestions);
  
  // Setup timers based on section type
  if (isFinalExam) {
    // Final exam: 90 minutes total
    finalExamTimeLeft = 90 * 60;
    questionTimeLeft = 90;
    
    // Show final exam timer, hide question timer
    document.getElementById('questionTimerDisplay').classList.add('hidden');
    document.getElementById('finalExamTimerDisplay').classList.remove('hidden');
    document.querySelector('.question-timer').classList.add('hidden');
  } else {
    // Regular section: 90 seconds per question
    questionTimeLeft = 90;
    
    // Show question timer, hide final exam timer
    document.getElementById('questionTimerDisplay').classList.remove('hidden');
    document.getElementById('finalExamTimerDisplay').classList.add('hidden');
    document.querySelector('.question-timer').classList.remove('hidden');
  }
  
  // Update UI styling for final exam
  const quizCard = document.getElementById('quizCard');
  if (quizCard) {
    if (isFinalExam) {
      quizCard.classList.add('final-exam');
    } else {
      quizCard.classList.remove('final-exam');
    }
  }
  
  // Update part status
  if (partStatus[partNumber - 1] !== 'completed') {
    partStatus[partNumber - 1] = 'in-progress';
  }
  
  // Update UI
  document.getElementById('currentSection').textContent = part.name;
  renderPartsList();
  
  // Reset UI elements
  document.getElementById('submitNextBtn').classList.remove('hidden');
  document.getElementById('submitSectionBtn').classList.add('hidden');
  document.getElementById('retryBtn').classList.add('hidden');
  document.getElementById('backToSelectionBtn').classList.add('hidden');
  document.getElementById('review').classList.add('hidden');
  document.getElementById('submitNextBtn').textContent = 'Submit';
  
  // Start timers
  startTimers();
  
  // Render first question
  renderQuestion();
  
  // Auto-save after loading part
  setTimeout(() => {
    saveProgressToGitHub();
  }, 500);
}

/**
 * Get random questions for final exam
 */
function getRandomQuestions(count) {
  if (!allQuestions || allQuestions.length === 0) {
    return [];
  }
  
  // Ensure we don't try to get more questions than available
  const actualCount = Math.min(count, allQuestions.length);
  const shuffled = shuffle([...allQuestions]);
  return shuffled.slice(0, actualCount);
}

/**
 * Render current question
 */
function renderQuestion() {
  if (!window.currentPartQuestions || window.currentPartQuestions.length === 0) {
    console.error('❌ No questions available to render');
    document.getElementById('question').textContent = 'No questions available.';
    return;
  }
  
  const q = window.currentPartQuestions[currentIndex];
  showFeedback = false;
  
  updateProgress();
  
  document.getElementById('question').textContent = q.question;
  document.getElementById('feedback').innerHTML = '';
  
  // Clear options container
  const optionsContainer = document.getElementById('options');
  if (!optionsContainer) {
    console.error('❌ Options container not found');
    return;
  }
  
  optionsContainer.innerHTML = '';
  
  // Reset question timer for regular sections
  if (!isFinalExam) {
    questionTimeLeft = 90;
    updateQuestionTimerDisplay();
  }
  
  // Determine input type
  const inputType = q.type === 'multi' ? 'checkbox' : 'radio';
  const hasPreviousAnswer = userAnswers[currentIndex] && userAnswers[currentIndex].length > 0;
  
  // Create option elements
  if (q.options && typeof q.options === 'object') {
    Object.entries(q.options).forEach(([key, value]) => {
      const label = document.createElement('label');
      const isChecked = hasPreviousAnswer && userAnswers[currentIndex].includes(key);
      
      label.innerHTML = `
        <input type="${inputType}" name="option" value="${key}" ${isChecked ? 'checked' : ''}>
        <span>${key}. ${value}</span>
      `;
      optionsContainer.appendChild(label);
    });
  } else {
    optionsContainer.innerHTML = '<div class="error">Error: Question has no options</div>';
    return;
  }
  
  // Restore previous answer if exists
  if (hasPreviousAnswer) {
    userAnswers[currentIndex].forEach(answer => {
      const input = document.querySelector(`input[value="${answer}"]`);
      if (input) input.checked = true;
    });
  }
  
  // Update button text based on whether question is answered
  const submitNextBtn = document.getElementById('submitNextBtn');
  if (submitNextBtn) {
    submitNextBtn.textContent = hasPreviousAnswer ? 'Next' : 'Submit';
  }
  
  // Show/hide buttons based on position
  const submitSectionBtn = document.getElementById('submitSectionBtn');
  if (currentIndex === window.currentPartQuestions.length - 1) {
    if (submitSectionBtn) submitSectionBtn.classList.remove('hidden');
    if (submitNextBtn) submitNextBtn.classList.add('hidden');
  } else {
    if (submitSectionBtn) submitSectionBtn.classList.add('hidden');
    if (submitNextBtn) submitNextBtn.classList.remove('hidden');
  }
  
  console.log(`📝 Rendering question ${currentIndex + 1}/${window.currentPartQuestions.length}`);
}

/**
 * Update progress bar and counter
 */
function updateProgress() {
  if (!window.currentPartQuestions || window.currentPartQuestions.length === 0) {
    return;
  }
  
  const progressPercent = ((currentIndex) / window.currentPartQuestions.length) * 100;
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('sectionProgressText');
  
  if (progressFill) {
    progressFill.style.width = `${progressPercent}%`;
  }
  
  if (progressText) {
    progressText.textContent = `Question ${currentIndex + 1} of ${window.currentPartQuestions.length}`;
  }
}

/**
 * Update timer displays
 */
function updateQuestionTimerDisplay() {
  const timerText = document.getElementById('questionTimerText');
  const questionTimerDisplay = document.getElementById('questionTimer');
  const finalExamTimerDisplay = document.getElementById('finalExamTimer');
  
  if (!isFinalExam) {
    // Update question timer for regular sections
    if (timerText) timerText.textContent = questionTimeLeft;
    if (questionTimerDisplay) questionTimerDisplay.textContent = questionTimeLeft;
    
    // Update circle progress
    const circle = document.getElementById('questionTimerCircle');
    if (circle) {
      const circumference = 2 * Math.PI * 20;
      const offset = circumference - (questionTimeLeft / 90) * circumference;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      circle.style.strokeDashoffset = offset;
      
      // Update timer color based on remaining time
      if (questionTimeLeft <= 30) {
        timerText.className = 'timer-warning';
        circle.style.stroke = '#ed8936';
      } else if (questionTimeLeft <= 10) {
        timerText.className = 'timer-danger';
        circle.style.stroke = '#f56565';
      } else {
        timerText.className = '';
        circle.style.stroke = '#667eea';
      }
    }
  } else {
    // Update final exam timer
    if (finalExamTimerDisplay) {
      const minutes = Math.floor(finalExamTimeLeft / 60);
      const seconds = finalExamTimeLeft % 60;
      finalExamTimerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      // Update timer color based on remaining time
      if (finalExamTimeLeft <= 10 * 60) { // 10 minutes
        finalExamTimerDisplay.className = 'timer-warning';
      } else if (finalExamTimeLeft <= 5 * 60) { // 5 minutes
        finalExamTimerDisplay.className = 'timer-danger';
      } else {
        finalExamTimerDisplay.className = '';
      }
    }
  }
}

/**
 * Start timers
 */
function startTimers() {
  // Clear existing timers
  if (questionTimer) clearInterval(questionTimer);
  if (finalExamTimer) clearInterval(finalExamTimer);
  
  if (!isFinalExam) {
    // Start question timer for regular sections
    questionTimer = setInterval(() => {
      questionTimeLeft--;
      updateQuestionTimerDisplay();
      
      if (questionTimeLeft <= 0) {
        clearInterval(questionTimer);
        timeUpForQuestion();
      }
    }, 1000);
  } else {
    // Start final exam timer
    finalExamTimer = setInterval(() => {
      finalExamTimeLeft--;
      updateQuestionTimerDisplay();
      
      if (finalExamTimeLeft <= 0) {
        clearInterval(finalExamTimer);
        timeUpForFinalExam();
      }
    }, 1000);
  }
  
  console.log('⏱️ Timers started');
}

/**
 * Handle time up for a question
 */
function timeUpForQuestion() {
  console.log('⏰ Time up for question');
  
  // Auto-submit current question if not answered
  if (!userAnswers[currentIndex] || userAnswers[currentIndex].length === 0) {
    userAnswers[currentIndex] = [];
    evaluateAnswer(true);
  }
  
  // Auto-advance to next question after 3 seconds
  setTimeout(() => {
    if (currentIndex < window.currentPartQuestions.length - 1) {
      currentIndex++;
      renderQuestion();
      startTimers();
    } else {
      // If this was the last question, show submit button
      document.getElementById('submitSectionBtn').classList.remove('hidden');
      document.getElementById('submitNextBtn').classList.add('hidden');
    }
  }, 3000);
}

/**
 * Handle time up for final exam
 */
function timeUpForFinalExam() {
  console.log('⏰ Final exam time up');
  
  // Submit the final exam
  submitSection();
}

/**
 * Evaluate the current answer
 */
function evaluateAnswer(isTimeUp = false) {
  const q = window.currentPartQuestions[currentIndex];
  const selected = Array.from(
    document.querySelectorAll('input[name="option"]:checked')
  ).map(i => i.value);
  
  userAnswers[currentIndex] = selected;
  
  // Disable inputs
  document.querySelectorAll('input[name="option"]').forEach(i => i.disabled = true);
  
  const isCorrect = selected.length === q.correct.length &&
    selected.every(a => q.correct.includes(a));
  
  let feedbackHTML = '';
  
  if (isTimeUp) {
    feedbackHTML = `<div class="incorrect">Time's up! The correct answer was: ${q.correct.join(', ')}</div>`;
  } else if (isCorrect) {
    feedbackHTML = `<div class="correct">Correct! The answer is: ${q.correct.join(', ')}</div>`;
  } else {
    feedbackHTML = `<div class="incorrect">Incorrect. The correct answer is: ${q.correct.join(', ')}</div>`;
  }
  
  document.getElementById('feedback').innerHTML = feedbackHTML;
  showFeedback = true;
  
  // Change button text to 'Next'
  document.getElementById('submitNextBtn').textContent = 'Next';
  
  // Clear question timer for regular sections
  if (!isFinalExam && questionTimer) {
    clearInterval(questionTimer);
  }
  
  // Auto-save progress
  setTimeout(() => {
    saveProgressToGitHub();
  }, 500);
}

/**
 * Submit the current section
 */
function submitSection() {
  console.log(`📤 Submitting section ${currentPart}`);
  
  // Stop all timers
  if (questionTimer) clearInterval(questionTimer);
  if (finalExamTimer) clearInterval(finalExamTimer);
  
  // Calculate score for this part
  let partScore = 0;
  window.currentPartQuestions.forEach((q, index) => {
    const userAnswer = userAnswers[index] || [];
    const isCorrect = userAnswer.length === q.correct.length &&
      userAnswer.every(a => q.correct.includes(a));
    
    if (isCorrect) {
      partScore++;
    }
  });
  
  // Update part scores
  partScores[currentPart - 1] = partScore;
  partStatus[currentPart - 1] = 'completed';
  
  // Update total score
  updateTotalScore();
  renderPartsList();
  
  // Show final results
  showFinalResult(partScore);
}

/**
 * Show final results for the section
 */
function showFinalResult(partScore) {
  const part = partDefinitions[currentPart - 1];
  const totalQuestions = window.currentPartQuestions.length;
  
  document.getElementById('question').textContent = 
    `${part.name} Completed! Score: ${partScore}/${totalQuestions}`;
  
  document.getElementById('options').innerHTML = '';
  document.getElementById('feedback').innerHTML = '';
  document.getElementById('submitNextBtn').classList.add('hidden');
  document.getElementById('submitSectionBtn').classList.add('hidden');
  document.getElementById('retryBtn').classList.remove('hidden');
  document.getElementById('backToSelectionBtn').classList.remove('hidden');
  
  // Update selection screen
  renderSectionSelection();
  
  // Show review
  showReview(partScore);
  
  // Save final progress
  saveProgressToGitHub();
}

/**
 * Show review of the section
 */
function showReview(partScore) {
  const reviewDiv = document.getElementById('review');
  reviewDiv.classList.remove('hidden');
  reviewDiv.innerHTML = `<h3>${partDefinitions[currentPart - 1].name} Review</h3>`;
  
  window.currentPartQuestions.forEach((q, i) => {
    const user = userAnswers[i]?.join(', ') || 'Not answered';
    const correct = q.correct.join(', ');
    
    const isCorrect = userAnswers[i] &&
      userAnswers[i].length === q.correct.length &&
      userAnswers[i].every(a => q.correct.includes(a));
    
    reviewDiv.innerHTML += `
      <div class="review-item">
        <div class="review-question">${i + 1}. ${q.question}</div>
        <div class="review-answer">Your answer: <span class="${isCorrect ? 'correct' : 'incorrect'}">${user}</span></div>
        <div class="review-answer">Correct answer: <span class="correct">${correct}</span></div>
      </div>
    `;
  });
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================

/**
 * Render parts list in left panel
 */
function renderPartsList() {
  const partsList = document.getElementById('partsList');
  if (!partsList) return;
  
  partsList.innerHTML = '';
  
  partDefinitions.forEach((part, index) => {
    const isFinalExam = part.id === 8;
    const status = partStatus[index];
    const score = partScores[index] || 0;
    
    const partElement = document.createElement('div');
    partElement.className = `part-item ${status === 'completed' ? 'completed' : ''} 
      ${currentPart === (index + 1) && isQuizStarted ? 'active' : ''} 
      ${isFinalExam ? 'final-exam' : ''}`;
    partElement.dataset.partId = index + 1;
    
    partElement.innerHTML = `
      <div class="part-info">
        <div class="part-title">${part.name}</div>
        <div class="part-range">${isFinalExam ? '60 random questions' : `Q${part.start + 1}-${part.end + 1}`}</div>
      </div>
      <div class="part-score ${status === 'completed' ? 'completed' : ''} ${isFinalExam ? 'final-exam' : ''}">
        ${status === 'completed' ? `${score}/${part.count}` : '-'}
      </div>
    `;
    
    partElement.addEventListener('click', () => {
      if (status === 'completed' || status === 'not-started') {
        loadPart(index + 1);
      }
    });
    
    partsList.appendChild(partElement);
  });
}

/**
 * Render section selection cards
 */
function renderSectionSelection() {
  const sectionCards = document.getElementById('sectionCards');
  if (!sectionCards) return;
  
  sectionCards.innerHTML = '';
  
  partDefinitions.forEach((part, index) => {
    const status = partStatus[index];
    const score = partScores[index] || 0;
    const isFinalExam = part.id === 8;
    
    const card = document.createElement('div');
    card.className = `section-card ${status} ${isFinalExam ? 'final-exam' : ''}`;
    card.dataset.partId = part.id;
    
    card.innerHTML = `
      <div class="section-icon">
        <i class="${part.icon}"></i>
      </div>
      <h3>${part.name}</h3>
      <p>${isFinalExam ? '60 random questions from all sections' : `Questions ${part.start + 1} - ${part.end + 1}`}</p>
      <div class="section-status status-${status.replace('-', '-')}">
        ${status === 'not-started' ? 'Not Started' : 
          status === 'in-progress' ? 'In Progress' : 'Completed'}
      </div>
      ${status === 'completed' ? 
        `<div class="section-score">${score}/${part.count}</div>` : ''}
    `;
    
    card.addEventListener('click', () => {
      if (status === 'in-progress' || status === 'completed' || status === 'not-started') {
        loadPart(part.id);
      }
    });
    
    sectionCards.appendChild(card);
  });
}

/**
 * Update total score display
 */
function updateTotalScore() {
  const totalScore = partScores.reduce((sum, score) => sum + score, 0);
  const totalScoreElement = document.getElementById('totalScore');
  
  if (totalScoreElement) {
    totalScoreElement.textContent = `${totalScore}/445`;
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
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
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
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
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

/**
 * Show error message
 */
function showErrorMessage(message) {
  const quizCard = document.querySelector('.quiz-card') || document.getElementById('quizCard');
  if (quizCard) {
    quizCard.innerHTML = `
      <div class="error-container">
        <h2><i class="fas fa-exclamation-triangle"></i> Error Loading Quiz</h2>
        <p>${message}</p>
        <div class="error-details">
          <p><strong>Please check:</strong></p>
          <ul>
            <li>Is questions.json in the correct location?</li>
            <li>Does questions.json contain valid JSON?</li>
            <li>Open browser console (F12) for more details</li>
          </ul>
        </div>
        <button onclick="location.reload()" class="reload-btn">
          <i class="fas fa-redo"></i> Reload Page
        </button>
      </div>
    `;
  } else {
    alert(`Error: ${message}`);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffle(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Debug function to show current state
 */
function debugState() {
  console.log('=== DEBUG STATE ===');
  console.log('All questions:', allQuestions.length);
  console.log('Current part:', currentPart);
  console.log('Current index:', currentIndex);
  console.log('User answers:', userAnswers.length);
  console.log('Part scores:', partScores);
  console.log('Part status:', partStatus);
  console.log('License key:', userLicenseKey ? userLicenseKey.substring(0, 10) + '...' : 'None');
  console.log('Is admin?', isAdminUser);
  console.log('Is quiz started?', isQuizStarted);
  console.log('Current part questions:', window.currentPartQuestions?.length || 0);
  console.log('Is final exam?', isFinalExam);
  console.log('Question time left:', questionTimeLeft);
  console.log('Final exam time left:', finalExamTimeLeft);
  console.log('===================');
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  console.log('🔗 Setting up event listeners...');
  
  // Unlock button
  const unlockBtn = document.querySelector('.unlock-btn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', unlockApp);
  }
  
  // License input - Enter key support
  const licenseInput = document.getElementById('licenseInput');
  if (licenseInput) {
    licenseInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        unlockApp();
      }
    });
  }
  
  // Submit/Next button
  const submitNextBtn = document.getElementById('submitNextBtn');
  if (submitNextBtn) {
    submitNextBtn.addEventListener('click', () => {
      if (!showFeedback) {
        // Check if any option is selected
        const selected = document.querySelectorAll('input[name="option"]:checked');
        if (selected.length > 0) {
          evaluateAnswer();
        } else {
          document.getElementById('feedback').innerHTML = 
            `<div class="incorrect">Please select an answer before proceeding.</div>`;
        }
      } else {
        if (currentIndex < window.currentPartQuestions.length - 1) {
          currentIndex++;
          renderQuestion();
          
          // Restart question timer for regular sections
          if (!isFinalExam) {
            questionTimeLeft = 90;
            if (questionTimer) clearInterval(questionTimer);
            questionTimer = setInterval(() => {
              questionTimeLeft--;
              updateQuestionTimerDisplay();
              
              if (questionTimeLeft <= 0) {
                clearInterval(questionTimer);
                timeUpForQuestion();
              }
            }, 1000);
          }
        } else {
          // This shouldn't happen since submit button is hidden on last question
          submitSection();
        }
      }
    });
  }
  
  // Submit Section button
  const submitSectionBtn = document.getElementById('submitSectionBtn');
  if (submitSectionBtn) {
    submitSectionBtn.addEventListener('click', () => {
      // Check if current question is answered before submitting
      if (!userAnswers[currentIndex] || userAnswers[currentIndex].length === 0) {
        const selected = document.querySelectorAll('input[name="option"]:checked');
        if (selected.length === 0) {
          document.getElementById('feedback').innerHTML = 
            `<div class="incorrect">Please answer this question before submitting the section.</div>`;
          return;
        }
        evaluateAnswer();
        // Wait a moment for feedback to show, then submit
        setTimeout(submitSection, 1000);
      } else {
        submitSection();
      }
    });
  }
  
  // Retry button
  const retryBtn = document.getElementById('retryBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      // Reset for current part
      currentIndex = 0;
      userAnswers = [];
      
      if (isFinalExam) {
        // For final exam, get new random questions
        window.currentPartQuestions = getRandomQuestions(60);
      } else {
        // For regular sections, reshuffle the same questions
        window.currentPartQuestions = shuffle([...window.currentPartQuestions]);
      }
      
      // Reset UI
      document.getElementById('review').classList.add('hidden');
      document.getElementById('retryBtn').classList.add('hidden');
      document.getElementById('backToSelectionBtn').classList.add('hidden');
      document.getElementById('submitNextBtn').classList.remove('hidden');
      
      // Reset timers
      if (isFinalExam) {
        finalExamTimeLeft = 90 * 60;
      } else {
        questionTimeLeft = 90;
      }
      startTimers();
      
      renderQuestion();
    });
  }
  
  // Back to Selection button
  const backToSelectionBtn = document.getElementById('backToSelectionBtn');
  if (backToSelectionBtn) {
    backToSelectionBtn.addEventListener('click', () => {
      showSelectionScreen();
    });
  }
  
  // Reset data button
  const resetBtn = document.querySelector('.text-btn');
  if (resetBtn && resetBtn.textContent.includes('Reset')) {
    resetBtn.addEventListener('click', resetLocalData);
  }
  
  // Debug button (hidden, for development)
  const debugBtn = document.createElement('button');
  debugBtn.innerHTML = '🐛';
  debugBtn.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    z-index: 9999;
    padding: 5px 10px;
    background: #333;
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
    opacity: 0.3;
  `;
  debugBtn.title = 'Debug Info';
  debugBtn.addEventListener('click', debugState);
  document.body.appendChild(debugBtn);
  
  console.log('✅ Event listeners set up');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
async function initializeApp() {
  console.log('🚀 Initializing application...');
  
  try {
    // Setup event listeners first
    setupEventListeners();
    
    // Check app lock status
    await checkAppLock();
    
    console.log('✅ Application initialized');
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    showErrorMessage('Failed to initialize application. Please refresh the page.');
  }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Export functions for debugging (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    shuffle,
    debugState,
    validateLicenseOffline
  };
}