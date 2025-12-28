import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';

// --- Type Definitions ---
interface User {
    username: string;
    password: string;
    name: string;
    createdAt: string;
}

interface Question {
    question: string;
    options: string[];
    answer: number; // 0-indexed integer for the correct option
    explanation: string;
    subject: string;
    topic: string;
}

interface Test {
    id: string;
    name: string;
    questions: Question[];
    duration: number; // in minutes
    language: string;
    createdAt: string;
    marksPerQuestion: number;
    negativeMarking: number;
}

interface TestAttempt {
    testId: string;
    testName: string;
    userAnswers: (number | null)[];
    timeTaken: number; // in seconds
    timePerQuestion: number[]; // in seconds for each question
    completedAt: string;
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unanswered: number;
    fullTest: Test;
}

type QuestionStatus = 'notVisited' | 'notAnswered' | 'answered' | 'marked' | 'markedAndAnswered';

// --- PDF.js Worker Setup ---
// This is crucial for performance and to prevent errors.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

// --- Authentication Elements ---
const loginScreen = document.getElementById('login-screen');
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const registerForm = document.getElementById('register-form') as HTMLFormElement;
const loginUsernameInput = document.getElementById('login-username') as HTMLInputElement;
const loginPasswordInput = document.getElementById('login-password') as HTMLInputElement;
const rememberMeCheckbox = document.getElementById('remember-me') as HTMLInputElement;
const showRegisterBtn = document.getElementById('show-register-btn');
const backToLoginBtn = document.getElementById('back-to-login-btn');
const registerNameInput = document.getElementById('register-name') as HTMLInputElement;
const registerUsernameInput = document.getElementById('register-username') as HTMLInputElement;
const registerPasswordInput = document.getElementById('register-password') as HTMLInputElement;
const registerConfirmInput = document.getElementById('register-confirm') as HTMLInputElement;
const logoutBtn = document.getElementById('logout-btn');
const userDisplayName = document.getElementById('user-display-name');

// --- Current User State ---
let currentUser: User | null = null;

// --- Authentication Functions ---
function hashPassword(password: string): string {
    // Simple hash for demo purposes (in production, use proper hashing)
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

function getUsers(): User[] {
    try {
        const users = localStorage.getItem('registeredUsers');
        return users ? JSON.parse(users) : [];
    } catch {
        return [];
    }
}

function saveUsers(users: User[]): void {
    localStorage.setItem('registeredUsers', JSON.stringify(users));
}

function registerUser(name: string, username: string, password: string): { success: boolean; message: string } {
    const users = getUsers();
    
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return { success: false, message: 'Username already exists!' };
    }
    
    if (username.length < 3) {
        return { success: false, message: 'Username must be at least 3 characters!' };
    }
    
    if (password.length < 4) {
        return { success: false, message: 'Password must be at least 4 characters!' };
    }
    
    const newUser: User = {
        username: username.toLowerCase(),
        password: hashPassword(password),
        name: name,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    saveUsers(users);
    
    return { success: true, message: 'Account created successfully!' };
}

function authenticateUser(username: string, password: string): { success: boolean; user?: User; message: string } {
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
        return { success: false, message: 'Invalid username or password!' };
    }
    
    if (user.password !== hashPassword(password)) {
        return { success: false, message: 'Invalid username or password!' };
    }
    
    return { success: true, user, message: 'Login successful!' };
}

function loginUser(user: User, remember: boolean): void {
    currentUser = user;
    
    if (remember) {
        localStorage.setItem('rememberedUser', JSON.stringify({ username: user.username, name: user.name }));
    } else {
        localStorage.removeItem('rememberedUser');
    }
    
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    
    userDisplayName.textContent = user.name;
    loginScreen.classList.add('hidden');
    mainView.classList.remove('hidden');
}

function logoutUser(): void {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    
    mainView.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    
    // Reset forms
    loginForm.reset();
    registerForm.reset();
    showLoginForm();
}

function checkExistingSession(): void {
    // Check for active session
    const sessionUser = sessionStorage.getItem('currentUser');
    if (sessionUser) {
        try {
            const user = JSON.parse(sessionUser);
            currentUser = user;
            userDisplayName.textContent = user.name;
            loginScreen.classList.add('hidden');
            mainView.classList.remove('hidden');
            return;
        } catch {}
    }
    
    // Check for remembered user
    const remembered = localStorage.getItem('rememberedUser');
    if (remembered) {
        try {
            const { username, name } = JSON.parse(remembered);
            loginUsernameInput.value = username;
            rememberMeCheckbox.checked = true;
        } catch {}
    }
}

function showLoginForm(): void {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
}

function showRegisterForm(): void {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
}

// --- Authentication Event Listeners ---
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;
    const remember = rememberMeCheckbox.checked;
    
    const result = authenticateUser(username, password);
    
    if (result.success && result.user) {
        loginUser(result.user, remember);
    } else {
        showToast({ message: result.message, type: 'error' });
    }
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = registerNameInput.value.trim();
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value;
    const confirm = registerConfirmInput.value;
    
    if (password !== confirm) {
        showToast({ message: 'Passwords do not match!', type: 'error' });
        return;
    }
    
    const result = registerUser(name, username, password);
    
    if (result.success) {
        showToast({ message: result.message, type: 'success' });
        // Auto-login after registration
        const authResult = authenticateUser(username, password);
        if (authResult.success && authResult.user) {
            loginUser(authResult.user, false);
        } else {
            showLoginForm();
        }
    } else {
        showToast({ message: result.message, type: 'error' });
    }
});

showRegisterBtn.addEventListener('click', showRegisterForm);
backToLoginBtn.addEventListener('click', showLoginForm);
logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        logoutUser();
    }
});

// Initialize auth check
checkExistingSession();

// --- DOM Elements ---
const mainView = document.querySelector('main');
// View Sections
const createTestView = document.getElementById('create-test-view');
const editTestView = document.getElementById('edit-test-view');
const allTestsView = document.getElementById('all-tests-view');
const testDetailView = document.getElementById('test-detail-view');
const testAttemptView = document.getElementById('test-attempt-view');
const performanceView = document.getElementById('performance-view');
const performanceReportView = document.getElementById('performance-report-view');
const analyticsView = document.getElementById('analytics-view');

// Main Page Cards
const createTestCard = document.querySelector('.card[aria-labelledby="create-test-title"]');
const allTestsCard = document.querySelector('.card[aria-labelledby="all-tests-title"]');
const performanceCard = document.querySelector('.card[aria-labelledby="performance-title"]');
const analyticsCard = document.querySelector('.card[aria-labelledby="analytics-title"]');

// Data Control Elements (for restore functionality)
const restoreFileInput = document.getElementById('restore-file-input') as HTMLInputElement;

// Back Buttons
const backToHomeFromCreateBtn = document.getElementById('back-to-home-from-create');
const backToHomeFromAllTestsBtn = document.getElementById('back-to-home-from-all-tests');
const backToHomeFromPerformanceBtn = document.getElementById('back-to-home-from-performance');
const backToHomeFromAnalyticsBtn = document.getElementById('back-to-home-from-analytics');
const backToCreateBtn = document.getElementById('back-to-create');
const backToAllTestsFromDetailBtn = document.getElementById('back-to-all-tests-from-detail');
const backToPerformanceListBtn = document.getElementById('back-to-performance-list');

// Create Test View Elements
const tabs = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');
let activeTabInput = { type: 'topic', value: '' };
const topicInput = document.getElementById('topic-input') as HTMLInputElement;
const questionsSlider = document.getElementById('questions-slider') as HTMLInputElement;
const questionsCount = document.getElementById('questions-count');
const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
const durationInput = document.getElementById('duration-input') as HTMLInputElement;
const marksInput = document.getElementById('marks-input') as HTMLInputElement;
const negativeInput = document.getElementById('negative-input') as HTMLSelectElement;
const testNameInput = document.getElementById('test-name-input') as HTMLInputElement;
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
const manualInput = document.getElementById('manual-input') as HTMLTextAreaElement;
const generateTestBtn = document.getElementById('generate-test-btn') as HTMLButtonElement;
const loader = document.getElementById('loader');

// Edit Test View Elements
const editTestTitle = editTestView.querySelector('h2');
const editableQuestionsContainer = document.getElementById('editable-questions-container');
const addQuestionBtn = document.getElementById('add-question-btn');
const saveTestBtn = document.getElementById('save-test-btn');

// All Tests View Elements
const allTestsContainer = document.getElementById('all-tests-container');
const importTestBtn = document.getElementById('import-test-btn');
const importTestInput = document.getElementById('import-test-input') as HTMLInputElement;

// Test Detail View Elements
const testDetailContainer = document.getElementById('test-detail-container');
const testDetailTitle = document.getElementById('test-detail-title');
const testDetailActions = document.getElementById('test-detail-actions');

// Test Attempt View Elements
const attemptTestTitle = document.getElementById('attempt-test-title');
const timeLeftEl = document.getElementById('time-left');
const questionContentContainer = document.getElementById('question-content');
const questionPaletteContainer = document.getElementById('question-palette');
const saveNextBtn = document.getElementById('save-next-btn') as HTMLButtonElement;
const markReviewBtn = document.getElementById('mark-review-btn') as HTMLButtonElement;
const clearResponseBtn = document.getElementById('clear-response-btn') as HTMLButtonElement;
const testSidebar = document.getElementById('test-sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');

// Performance View Elements
const performanceContainer = document.getElementById('performance-container');
const performanceReportTitle = document.getElementById('performance-report-title');
const performanceSummaryContainer = document.getElementById('performance-summary-container');
// New Tab Containers
const timeAnalysisContainer = document.getElementById('time-analysis-view');
const subjectBreakdownContainer = document.getElementById('subject-breakdown-view');
const mistakesReviewContainer = document.getElementById('mistakes-view');
const allQuestionsReviewContainer = document.getElementById('all-questions-view');
const downloadReportBtn = document.getElementById('download-report-btn');

// Analytics View Elements
const analyticsStatsGrid = document.getElementById('analytics-stats-grid');
const subjectMasteryContainer = document.getElementById('subject-mastery-container');
const analyticsModal = document.getElementById('analytics-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSubjectTitle = document.getElementById('modal-subject-title');
const modalBody = document.getElementById('modal-body');

// Settings Modal Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const toggleApiKeyBtn = document.getElementById('toggle-api-key');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const exportDataBtn = document.getElementById('export-data-btn');
const importDataBtn = document.getElementById('import-data-btn');
const clearDataBtn = document.getElementById('clear-data-btn');
const clearResultsBtn = document.getElementById('clear-results-btn');
const clearTestsBtn = document.getElementById('clear-tests-btn');

// --- Test State ---
let currentTest: Test | null = null;
let currentQuestionIndex = 0;
let userAnswers: (number | null)[] = [];
let questionStatuses: QuestionStatus[] = [];
let timerInterval: number | null = null;
let timeRemaining = 0; // in seconds
let timePerQuestion: number[] = [];
let questionStartTime = 0;
let currentAttemptForReport: TestAttempt | null = null;
let reportReturnView: HTMLElement = performanceView;


// --- Gemini AI ---
let ai: GoogleGenAI;
let userApiKey: string = '';

function initializeAI() {
    // Try to get API key from environment or localStorage
    userApiKey = localStorage.getItem('userApiKey') || process.env.API_KEY || '';
    
    if (userApiKey) {
        try {
            ai = new GoogleGenAI({ apiKey: userApiKey });
            console.log("AI initialized successfully");
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI", e);
        }
    } else {
        console.warn("No API key found. Please configure in Settings.");
    }
}

initializeAI();

// --- Toast Notification System ---
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
    title?: string;
    message: string;
    type?: ToastType;
    duration?: number;
}

function showToast(options: ToastOptions | string) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const opts: ToastOptions = typeof options === 'string' 
        ? { message: options, type: 'info' } 
        : options;

    const { title, message, type = 'info', duration = 3500 } = opts;

    const icons: Record<ToastType, string> = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };

    const titles: Record<ToastType, string> = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.setProperty('--toast-duration', `${duration}ms`);
    
    toast.innerHTML = `
        <div class="toast-icon">
            <span class="material-symbols-outlined">${icons[type]}</span>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title || titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" aria-label="Close">
            <span class="material-symbols-outlined">close</span>
        </button>
        <div class="toast-progress">
            <div class="toast-progress-bar"></div>
        </div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const closeToast = () => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    };

    closeBtn?.addEventListener('click', closeToast);
    
    toastContainer.appendChild(toast);

    // Auto remove after duration
    setTimeout(closeToast, duration);
}

const questionSchema = {
    type: Type.OBJECT,
    properties: {
        question: { type: Type.STRING },
        options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of 4 strings representing the options."
        },
        answer: { type: Type.INTEGER, description: "0-indexed integer for the correct option." },
        explanation: { type: Type.STRING },
        subject: { type: Type.STRING, description: "General subject, e.g., History, Geography, Polity." },
        topic: { type: Type.STRING, description: "Specific topic within the subject." },
    },
    required: ["question", "options", "answer", "explanation", "subject", "topic"]
};

// --- Local Storage Utilities ---
function getFromStorage<T>(key: string, defaultValue: T): T {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error(`Error reading from localStorage key “${key}”:`, error);
        return defaultValue;
    }
}

function saveToStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error writing to localStorage key “${key}”:`, error);
    }
}

// --- Data Restore Logic ---
restoreFileInput.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                throw new Error("The selected file is not a valid JSON file.");
            }

            // Case 1: Full Backup (contains 'tests' or 'performanceHistory' arrays)
            const isBackup = Array.isArray(data.tests) || Array.isArray(data.performanceHistory);
            
            // Case 2: Single Test Export (contains 'questions' array and 'name')
            const isSingleTest = data.name && Array.isArray(data.questions);

            if (isBackup) {
                if (confirm("This will merge the uploaded backup data with your current data. Duplicates will be handled automatically where possible. Continue?")) {
                    const currentTests = getFromStorage<Test[]>('tests', []);
                    const currentHistory = getFromStorage<TestAttempt[]>('performanceHistory', []);
                    
                    const newTests = Array.isArray(data.tests) ? [...data.tests, ...currentTests] : currentTests;
                    const newHistory = Array.isArray(data.performanceHistory) ? [...data.performanceHistory, ...currentHistory] : currentHistory;

                    // De-duplicate tests based on ID
                    const uniqueTests = Array.from(new Map(newTests.map(item => [item.id, item])).values());
                    
                    saveToStorage('tests', uniqueTests);
                    saveToStorage('performanceHistory', newHistory);

                    showToast({ message: 'Data restored successfully!', type: 'success' });
                    // Reload current view if necessary
                    if (!allTestsView.classList.contains('hidden')) renderAllTests();
                    if (!performanceView.classList.contains('hidden')) renderPerformanceHistory();
                    if (!analyticsView.classList.contains('hidden')) renderAnalyticsDashboard();
                }
            } 
            else if (isSingleTest) {
                if (confirm(`This file appears to be a single test: "${data.name}". Would you like to import it?`)) {
                     const newTest: Test = {
                        ...data,
                        id: `test_${Date.now()}_restored`, // Ensure unique ID to prevent conflicts
                        name: `${data.name} (Restored)`
                    };

                    const tests = getFromStorage<Test[]>('tests', []);
                    tests.unshift(newTest);
                    saveToStorage('tests', tests);

                    showToast({ message: `Test "${data.name}" imported successfully!`, type: 'success' });
                    if (!allTestsView.classList.contains('hidden')) renderAllTests();
                }
            } 
            else {
                throw new Error("Invalid file format. Please upload a valid Backup JSON or a single Test JSON.");
            }

        } catch (error) {
            console.error("Error restoring data:", error);
            showToast({ message: `Failed to restore data. ${error.message}`, type: 'error' });
        } finally {
            input.value = ''; // Reset input
        }
    };
    reader.readAsText(file);
});


// --- View Management ---
const views = [mainView, createTestView, editTestView, allTestsView, testDetailView, testAttemptView, performanceView, performanceReportView, analyticsView];

function showView(viewToShow) {
    views.forEach(view => {
        if (view === viewToShow) {
            view.classList.remove('hidden');
        } else {
            view.classList.add('hidden');
        }
    });
    window.scrollTo(0, 0);
}

// --- Event Listeners for navigation ---
createTestCard.addEventListener('click', () => showView(createTestView));
allTestsCard.addEventListener('click', () => {
    renderAllTests();
    showView(allTestsView);
});
performanceCard.addEventListener('click', () => {
    renderPerformanceHistory();
    showView(performanceView);
});
analyticsCard.addEventListener('click', () => {
    renderAnalyticsDashboard();
    showView(analyticsView);
});

backToHomeFromCreateBtn.addEventListener('click', () => showView(mainView));
backToHomeFromAllTestsBtn.addEventListener('click', () => showView(mainView));
backToHomeFromPerformanceBtn.addEventListener('click', () => showView(mainView));
backToHomeFromAnalyticsBtn.addEventListener('click', () => showView(mainView));
backToCreateBtn.addEventListener('click', () => showView(createTestView));
backToAllTestsFromDetailBtn.addEventListener('click', () => showView(allTestsView));

backToPerformanceListBtn.addEventListener('click', () => {
    if (reportReturnView === performanceView) renderPerformanceHistory();
    else if (reportReturnView === allTestsView) renderAllTests();
    showView(reportReturnView);
});

closeModalBtn.addEventListener('click', () => {
    analyticsModal.classList.add('hidden');
});

// Close modal when clicking outside
analyticsModal.addEventListener('click', (e) => {
    if (e.target === analyticsModal) {
        analyticsModal.classList.add('hidden');
    }
});

// --- Settings Modal Handlers ---
function updateSettingsInfo() {
    const tests = getFromStorage<Test[]>('tests', []);
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    
    const totalTestsEl = document.getElementById('total-tests');
    const totalAttemptsEl = document.getElementById('total-attempts');
    const storageUsedEl = document.getElementById('storage-used');
    
    if (totalTestsEl) totalTestsEl.textContent = tests.length.toString();
    if (totalAttemptsEl) totalAttemptsEl.textContent = history.length.toString();
    
    // Calculate storage
    const storageStr = JSON.stringify({ tests, performanceHistory: history });
    const storageSizeKB = (new Blob([storageStr]).size / 1024).toFixed(2);
    if (storageUsedEl) storageUsedEl.textContent = `${storageSizeKB} KB`;
}

settingsBtn.addEventListener('click', () => {
    // Load current settings
    const savedApiKey = localStorage.getItem('userApiKey') || '';
    apiKeyInput.value = savedApiKey;
    
    // Update stats
    updateSettingsInfo();
    
    settingsModal.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
    }
});

toggleApiKeyBtn.addEventListener('click', () => {
    const icon = toggleApiKeyBtn.querySelector('.material-symbols-outlined');
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        apiKeyInput.type = 'password';
        icon.textContent = 'visibility';
    }
});

saveSettingsBtn.addEventListener('click', () => {
    const newApiKey = apiKeyInput.value.trim();
    
    if (newApiKey) {
        localStorage.setItem('userApiKey', newApiKey);
        userApiKey = newApiKey;
        
        // Reinitialize AI with new key
        try {
            ai = new GoogleGenAI({ apiKey: userApiKey });
            showToast({ message: 'Settings saved! AI is now configured.', type: 'success' });
        } catch (e) {
            showToast({ message: 'Settings saved, but failed to initialize AI. Please check your API key.', type: 'warning' });
            console.error('AI initialization error:', e);
        }
    } else {
        localStorage.removeItem('userApiKey');
        userApiKey = '';
        showToast({ message: 'API key removed. AI features will be disabled.', type: 'warning' });
    }
    
    settingsModal.classList.add('hidden');
});

exportDataBtn.addEventListener('click', () => {
    const tests = getFromStorage<Test[]>('tests', []);
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    const users = getUsers();
    
    const backupData = {
        version: '2.1.0',
        exportDate: new Date().toISOString(),
        tests,
        performanceHistory: history,
        users
    };
    
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `upsc-test-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast({ message: 'Data exported successfully!', type: 'success' });
});

importDataBtn.addEventListener('click', () => {
    restoreFileInput.click();
});

clearDataBtn.addEventListener('click', () => {
    if (confirm('⚠️ WARNING: This will delete ALL your tests, performance history, and data. This action cannot be undone!\n\nAre you absolutely sure?')) {
        if (confirm('Final confirmation: Delete everything?')) {
            localStorage.removeItem('tests');
            localStorage.removeItem('performanceHistory');
            
            showToast({ message: 'All data has been cleared.', type: 'success' });
            settingsModal.classList.add('hidden');
            
            // Refresh current view
            if (!allTestsView.classList.contains('hidden')) renderAllTests();
            if (!performanceView.classList.contains('hidden')) renderPerformanceHistory();
            if (!analyticsView.classList.contains('hidden')) renderAnalyticsDashboard();
        }
    }
});

// Clear Results Only
clearResultsBtn?.addEventListener('click', () => {
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    if (history.length === 0) {
        showToast({ message: 'No results to clear.', type: 'info' });
        return;
    }
    
    if (confirm(`⚠️ This will delete all ${history.length} test result(s) from your history.\n\nYour saved tests will NOT be affected.\n\nContinue?`)) {
        localStorage.removeItem('performanceHistory');
        showToast({ message: `${history.length} result(s) cleared successfully.`, type: 'success' });
        
        // Refresh views
        if (!performanceView.classList.contains('hidden')) renderPerformanceHistory();
        if (!analyticsView.classList.contains('hidden')) renderAnalyticsDashboard();
        updateSettingsInfo();
    }
});

// Clear Tests Only
clearTestsBtn?.addEventListener('click', () => {
    const tests = getFromStorage<Test[]>('tests', []);
    if (tests.length === 0) {
        showToast({ message: 'No tests to clear.', type: 'info' });
        return;
    }
    
    if (confirm(`⚠️ This will delete all ${tests.length} saved test(s).\n\nYour result history will NOT be affected.\n\nContinue?`)) {
        localStorage.removeItem('tests');
        showToast({ message: `${tests.length} test(s) cleared successfully.`, type: 'success' });
        
        // Refresh views
        if (!allTestsView.classList.contains('hidden')) renderAllTests();
        updateSettingsInfo();
    }
});

// Sidebar toggle for mobile test attempt view
toggleSidebarBtn?.addEventListener('click', () => {
    testSidebar?.classList.toggle('collapsed');
});

// --- GLOBAL DELEGATED EVENT LISTENERS ---
document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // Test Attempt View Controls
    if (!testAttemptView.classList.contains('hidden')) {
        if (target.closest('#submit-test-btn')) {
            e.preventDefault();
            handleSubmitTest();
        } else if (target.closest('#back-to-all-tests')) {
            e.preventDefault();
            const timerWasRunning = timerInterval !== null;
            if (timerWasRunning) stopTimer();
            if (confirm("Are you sure you want to abandon this test? Your progress will be lost.")) {
                currentTest = null;
                showView(allTestsView);
            } else {
                if (timerWasRunning) startTimer();
            }
        }
        return;
    }
    
    // Deeper Analysis Button in Performance Report
    if (target.matches('.deeper-analysis-btn')) {
        await handleDeeperAnalysis(target);
    }
});


// --- KEYBOARD SHORTCUTS FOR TEST ATTEMPT ---
document.addEventListener('keydown', (e) => {
    if (testAttemptView.classList.contains('hidden')) {
        return;
    }

    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
    }

    switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
            e.preventDefault();
            const optionIndex = parseInt(e.key, 10) - 1;
            const radioButtons = document.querySelectorAll('.attempt-option-item input[type="radio"]') as NodeListOf<HTMLInputElement>;
            if (radioButtons[optionIndex]) {
                radioButtons[optionIndex].checked = true;
            }
            break;

        case ' ': // Spacebar for Save & Next
            e.preventDefault();
            saveNextBtn.click();
            break;
            
        case 'ArrowRight':
            e.preventDefault();
            saveNextBtn.click();
            break;
            
        case 'ArrowLeft':
            e.preventDefault();
            prevBtn.click();
            break;

        case 'm':
        case 'M':
            e.preventDefault();
            markReviewBtn.click();
            break;
            
        case 'c':
        case 'C':
            e.preventDefault();
            clearResponseBtn.click();
            break;
    }
});


// --- Create Test Logic ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        
        const tabName = tab.getAttribute('data-tab');
        activeTabInput.type = tabName;

        tabPanes.forEach(pane => {
            if (pane.id === `${tabName}-content`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    });
});

questionsSlider.addEventListener('input', () => {
    questionsCount.textContent = questionsSlider.value;
});

// Clear text button functionality
document.querySelectorAll('.clear-text-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = (e.currentTarget as HTMLElement).getAttribute('data-target');
        if (targetId) {
            const targetElement = document.getElementById(targetId) as HTMLTextAreaElement;
            if (targetElement && confirm('Are you sure you want to clear this text?')) {
                targetElement.value = '';
                targetElement.focus();
            }
        }
    });
});

generateTestBtn.addEventListener('click', handleGenerateTest);

// Manual Question Parser (No AI needed)
function parseManualQuestions(text: string): Question[] | null {
    try {
        const questions: Question[] = [];
        
        // Split by question numbers (1., 2., etc. or Q1, Q2, etc.)
        const questionBlocks = text.split(/(?=\d+\.\s)|(?=Q\s*\d+[\.:)])/i).filter(block => block.trim());
        
        for (const block of questionBlocks) {
            const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length < 3) continue; // Need at least question + options + answer
            
            let questionText = '';
            const options: string[] = [];
            let answerChar = '';
            let explanation = '';
            let subject = 'General';
            let topic = 'Miscellaneous';
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Extract question text
                if (i === 0 || (!questionText && !line.match(/^[a-d]\)/i) && !line.toLowerCase().startsWith('answer'))) {
                    questionText += (questionText ? ' ' : '') + line.replace(/^\d+\.\s*|^Q\s*\d+[\.:)]\s*/i, '');
                }
                
                // Extract options (a), b), c), d) or A), B), C), D)
                const optionMatch = line.match(/^([a-d])\)\s*(.+)/i);
                if (optionMatch) {
                    options.push(optionMatch[2].trim());
                    continue;
                }
                
                // Extract answer
                const answerMatch = line.match(/^Answer:\s*([a-d])/i);
                if (answerMatch) {
                    answerChar = answerMatch[1].toLowerCase();
                    continue;
                }
                
                // Extract explanation
                const explanationMatch = line.match(/^Explanation:\s*(.+)/i);
                if (explanationMatch) {
                    explanation = explanationMatch[1].trim();
                    // Collect multiline explanation
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].toLowerCase().startsWith('subject') || lines[j].toLowerCase().startsWith('topic')) {
                            break;
                        }
                        explanation += ' ' + lines[j];
                    }
                    continue;
                }
                
                // Extract subject and topic
                const subjectMatch = line.match(/^Subject:\s*(.+?)(?:\s*\||\s*$)/i);
                if (subjectMatch) {
                    subject = subjectMatch[1].trim();
                }
                
                const topicMatch = line.match(/Topic:\s*(.+)/i);
                if (topicMatch) {
                    topic = topicMatch[1].trim();
                }
            }
            
            // Validate question
            if (questionText && options.length === 4 && answerChar) {
                const answerIndex = answerChar.charCodeAt(0) - 'a'.charCodeAt(0);
                
                questions.push({
                    question: questionText,
                    options: options,
                    answer: answerIndex,
                    explanation: explanation || 'No explanation provided.',
                    subject: subject,
                    topic: topic
                });
            }
        }
        
        return questions.length > 0 ? questions : null;
    } catch (error) {
        console.error('Manual parsing error:', error);
        return null;
    }
}

async function handleGenerateTest() {
    if (!ai) {
        showToast({ message: 'AI Service is not available. Please configure API key in Settings.', type: 'error' });
        return;
    }

    loader.classList.remove('hidden');
    generateTestBtn.disabled = true;

    let source = "Custom Input";
    let contentsForApi;

    const numQuestions = parseInt(questionsSlider.value, 10);
    const language = languageSelect.value;
    const testName = testNameInput.value.trim();
    const marks = parseFloat(marksInput.value) || 1;
    const negative = parseFloat(negativeInput.value) || 0;

    try {
        switch (activeTabInput.type) {
            case 'topic':
                const topic = topicInput.value.trim();
                if (!topic) throw new Error('Please enter a topic.');
                source = topic;
                const promptTopic = `Generate ${numQuestions} UPSC-style multiple-choice questions (4 options) based on the following topic: ${topic}. The questions should be in ${language}. For each question, provide the question, four options, the 0-indexed correct answer, a detailed explanation, the general subject, and the specific topic.`;
                contentsForApi = promptTopic;
                break;
            case 'text':
                const text = textInput.value.trim();
                if (!text) throw new Error('Please paste some text.');
                source = "Pasted Text";
                const promptText = `Generate ${numQuestions} UPSC-style multiple-choice questions (4 options) based on the following text: """${text}""". The questions should be in ${language}. For each question, provide the question, four options, the 0-indexed correct answer, a detailed explanation, the general subject, and the specific topic.`;
                contentsForApi = promptText;
                break;
            case 'manual':
                const manualText = manualInput.value.trim();
                if (!manualText) throw new Error('Please paste your questions in the text area.');
                source = "Bulk Import";
                
                // Try parsing manually first (without AI)
                const parsedQuestions = parseManualQuestions(manualText);
                
                if (parsedQuestions && parsedQuestions.length > 0) {
                    // Successfully parsed without AI
                    currentTest = {
                        id: `test_${Date.now()}`,
                        name: testName || `Test on ${source}`,
                        questions: parsedQuestions,
                        duration: parseInt(durationInput.value, 10),
                        language: language,
                        createdAt: new Date().toISOString(),
                        marksPerQuestion: marks,
                        negativeMarking: negative
                    };
                    
                    renderEditableTest(currentTest);
                    showView(editTestView);
                    loader.classList.add('hidden');
                    generateTestBtn.disabled = false;
                    return; // Exit early, no AI needed
                }
                
                // Fallback to AI if manual parsing fails
                const promptManual = `Analyze the following text and extract ALL multiple-choice questions found within it.
                
                The text is expected to contain questions in a format similar to:
                "Q. Question text... A) Opt1 B) Opt2... Answer: A Explanation: ..."
                
                Your task:
                1. Extract every valid question.
                2. Map options to a string array.
                3. Determine the correct answer index (0 for A/1, 1 for B/2, etc).
                4. Extract explanation if present, otherwise generate a brief one.
                5. Extract Subject and Topic if present, otherwise infer them from the question content.
                6. Return the result strictly as a JSON array matching the schema.
                
                Input Text:
                """${manualText}"""`;
                contentsForApi = promptManual;
                break;
            case 'file':
                const file = fileUpload.files[0];
                if (!file) throw new Error('Please select a file to upload.');
                source = file.name;

                if (file.type === "text/plain" || file.name.toLowerCase().endsWith('.txt')) {
                    const fileText = await file.text();
                    if (!fileText.trim()) throw new Error('The uploaded file is empty.');
                    const promptFileText = `Generate ${numQuestions} ... based on the following text: """${fileText}"""`;
                    contentsForApi = promptFileText;
                } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                    let fullText = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
                        fullText += pageText + '\n\n';
                    }

                    const MINIMUM_TEXT_LENGTH = 100;

                    if (fullText.trim().length > MINIMUM_TEXT_LENGTH) {
                        const promptPDFText = `Generate ${numQuestions} UPSC-style multiple-choice questions (4 options) based on the following text. The questions should be in ${language}. For each question, provide the question, four options, the 0-indexed correct answer, a detailed explanation, the general subject, and the specific topic.\n\nText: """${fullText}"""`;
                        contentsForApi = promptPDFText;
                    } else {
                        (loader.querySelector('p') as HTMLElement).textContent = 'Minimal text found. Attempting OCR on PDF pages for better results...';
                        
                        const textPart = { text: `Generate ${numQuestions} UPSC-style multiple-choice questions (4 options) based on the content in the following images. The questions should be in ${language}. For each question, provide the question, four options, the 0-indexed correct answer, a detailed explanation, the general subject, and the specific topic.` };
                        const imageParts = [];

                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const viewport = page.getViewport({ scale: 1.5 });
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;

                            await page.render({ canvasContext: context, viewport: viewport, canvas: canvas } as any).promise;
                            
                            const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
                            imageParts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
                        }
                        if (imageParts.length === 0) throw new Error('Could not extract any images from the PDF.');

                        contentsForApi = { parts: [textPart, ...imageParts] };
                    }
                } else {
                    throw new Error(`Unsupported file type: '${file.type || 'unknown'}'. Please upload a PDF or TXT file.`);
                }
                break;
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contentsForApi,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: questionSchema,
                },
            },
        });

        if (!response || !response.text) {
            console.error("Invalid AI Response:", response);
            const finishReason = response?.candidates?.[0]?.finishReason;
            let errorMessage = "AI did not return a valid response. It might be empty or malformed.";
            if (finishReason === 'SAFETY') {
                errorMessage = "The request was blocked due to safety concerns. Please adjust your input text or file.";
            } else if (finishReason) {
                errorMessage = `Generation failed. Reason: ${finishReason}.`;
            }
            throw new Error(errorMessage);
        }

        const parsedResponse = JSON.parse(response.text);

        if (!Array.isArray(parsedResponse) || parsedResponse.length === 0) {
            throw new Error("Invalid response format from AI. The generated content was not a valid list of questions.");
        }

        currentTest = {
            id: `test_${Date.now()}`,
            name: testName || `Test on ${source}`,
            questions: parsedResponse,
            duration: parseInt(durationInput.value, 10),
            language: language,
            createdAt: new Date().toISOString(),
            marksPerQuestion: marks,
            negativeMarking: negative
        };

        renderEditableTest(currentTest);
        showView(editTestView);
    } catch (error) {
        console.error("Error generating test:", error);
        showToast({ message: `Failed to generate test. ${error.message}`, type: 'error' });
    } finally {
        (loader.querySelector('p') as HTMLElement).textContent = 'Generating your test, please wait...';
        loader.classList.add('hidden');
        generateTestBtn.disabled = false;
    }
}


// --- Edit Test Logic ---
function renderEditableTest(test: Test) {
    editTestTitle.textContent = `Review & Edit: ${test.name}`;
    
    // We render using a details/summary structure (or similar) to make it collapsible.
    // However, native <details> with form inputs can be tricky if we want to programmatically open/close,
    // so we'll use a custom structure with delegated events.
    
    editableQuestionsContainer.innerHTML = test.questions.map((q, index) => `
        <div class="editable-question-item" data-question-index="${index}" id="eq-${index}">
            <div class="editable-question-header">
                <h4>Question ${index + 1}</h4>
                <div class="editable-question-actions">
                    <button class="icon-btn delete-q" title="Delete Question">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                    <button class="icon-btn toggle-q" title="Expand/Collapse">
                        <span class="material-symbols-outlined">expand_more</span>
                    </button>
                </div>
            </div>
            
            <div class="editable-question-body hidden">
                <label for="q-text-${index}">Question Text</label>
                <textarea id="q-text-${index}">${q.question}</textarea>
                
                <label>Options (Select Correct Answer)</label>
                <div class="options-editor">
                    ${q.options.map((opt, optIndex) => `
                        <div class="option-item">
                            <input type="radio" name="q-answer-${index}" value="${optIndex}" ${q.answer === optIndex ? 'checked' : ''}>
                            <input type="text" value="${opt}" placeholder="Option ${optIndex + 1}">
                        </div>
                    `).join('')}
                </div>
                
                <div class="meta-grid">
                    <div>
                        <label for="q-subject-${index}">Subject</label>
                        <input type="text" id="q-subject-${index}" value="${q.subject}">
                    </div>
                    <div>
                        <label for="q-topic-${index}">Topic</label>
                        <input type="text" id="q-topic-${index}" value="${q.topic}">
                    </div>
                </div>
                
                <label for="q-exp-${index}">Explanation</label>
                <textarea id="q-exp-${index}">${q.explanation}</textarea>
            </div>
        </div>
    `).join('');

    // Open first question by default
    const firstItem = document.getElementById('eq-0');
    if (firstItem) {
        firstItem.setAttribute('open', '');
        firstItem.querySelector('.editable-question-body').classList.remove('hidden');
        firstItem.querySelector('.toggle-q span').textContent = 'expand_less';
    }
}

// Delegated events for the editable container (Delete & Toggle)
editableQuestionsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Handle Delete
    const deleteBtn = target.closest('.delete-q');
    if (deleteBtn) {
        e.stopPropagation();
        const item = deleteBtn.closest('.editable-question-item') as HTMLElement;
        const index = parseInt(item.dataset.questionIndex, 10);
        if (confirm(`Are you sure you want to delete question ${index + 1}?`)) {
            // Update currentTest data
            // We need to sync DOM state to data first before splicing to avoid losing unsaved edits
            syncCurrentTestFromDOM(); 
            currentTest.questions.splice(index, 1);
            renderEditableTest(currentTest); 
        }
        return;
    }

    // Handle Toggle (Header click or button click)
    const header = target.closest('.editable-question-header');
    const toggleBtn = target.closest('.toggle-q');
    
    if (header || toggleBtn) {
        // Prevent toggling if clicked on delete button (already handled but good to be safe)
        if (target.closest('.delete-q')) return;

        const item = target.closest('.editable-question-item') as HTMLElement;
        const isOpen = item.hasAttribute('open');
        const body = item.querySelector('.editable-question-body');
        const icon = item.querySelector('.toggle-q span');
        
        if (isOpen) {
            item.removeAttribute('open');
            body.classList.add('hidden');
            if(icon) icon.textContent = 'expand_more';
        } else {
            item.setAttribute('open', '');
            body.classList.remove('hidden');
            if(icon) icon.textContent = 'expand_less';
        }
    }
});

// Helper to save state from DOM to currentTest object without saving to LocalStorage yet
function syncCurrentTestFromDOM() {
    if (!currentTest) return;
    const questionForms = editableQuestionsContainer.querySelectorAll('.editable-question-item');
    const updatedQuestions: Question[] = [];

    questionForms.forEach((form, index) => {
        // Since we might delete items and re-render, the index in DOM matches currentTest structure *before* deletion
        // but this function is called generally to save state.
        const questionText = (form.querySelector(`#q-text-${index}`) as HTMLTextAreaElement).value;
        const explanationText = (form.querySelector(`#q-exp-${index}`) as HTMLTextAreaElement).value;
        const subjectText = (form.querySelector(`#q-subject-${index}`) as HTMLInputElement).value;
        const topicText = (form.querySelector(`#q-topic-${index}`) as HTMLInputElement).value;
        const answer = parseInt((form.querySelector(`input[name="q-answer-${index}"]:checked`) as HTMLInputElement)?.value ?? '0');
        
        const options = Array.from(form.querySelectorAll('.option-item input[type="text"]')).map(input => (input as HTMLInputElement).value);
        
        updatedQuestions.push({
            question: questionText,
            options,
            answer,
            explanation: explanationText,
            subject: subjectText,
            topic: topicText
        });
    });
    currentTest.questions = updatedQuestions;
}


addQuestionBtn.addEventListener('click', () => {
    if (!currentTest) return;
    syncCurrentTestFromDOM(); // Save current progress
    const newQuestion: Question = {
        question: "",
        options: ["", "", "", ""],
        answer: 0,
        explanation: "",
        subject: "",
        topic: ""
    };
    currentTest.questions.push(newQuestion);
    renderEditableTest(currentTest);
    
    // Automatically open the new question
    const lastIdx = currentTest.questions.length - 1;
    setTimeout(() => {
        const newItem = document.getElementById(`eq-${lastIdx}`);
        if(newItem) {
            newItem.setAttribute('open', '');
            newItem.querySelector('.editable-question-body').classList.remove('hidden');
            newItem.querySelector('.toggle-q span').textContent = 'expand_less';
            newItem.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
});


saveTestBtn.addEventListener('click', () => {
    if (!currentTest) return;
    syncCurrentTestFromDOM();

    const tests = getFromStorage<Test[]>('tests', []);
    
    // Check if test already exists (Update mode vs Create mode)
    const existingIndex = tests.findIndex(t => t.id === currentTest.id);
    
    if (existingIndex > -1) {
        tests[existingIndex] = currentTest;
        showToast({ message: 'Test updated successfully!', type: 'success' });
    } else {
        tests.unshift(currentTest);
        showToast({ message: 'Test created successfully!', type: 'success' });
    }
    
    saveToStorage('tests', tests);
    renderAllTests();
    showView(allTestsView);
});


// --- All Tests & Test Detail Logic ---
let filteredTests: Test[] = [];
let currentSearchQuery = '';
let currentSortOption = 'newest';

function renderAllTests() {
    const tests = getFromStorage<Test[]>('tests', []);
    
    // Render stats overview
    const testsStatsOverview = document.getElementById('tests-stats-overview');
    if (tests.length > 0) {
        const totalQuestions = tests.reduce((sum, t) => sum + t.questions.length, 0);
        const avgQuestions = Math.round(totalQuestions / tests.length);
        const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
        
        testsStatsOverview.innerHTML = `
            <div class="stat-card-mini">
                <span class="material-symbols-outlined">library_books</span>
                <div>
                    <div class="stat-value-mini">${tests.length}</div>
                    <div class="stat-label-mini">Total Tests</div>
                </div>
            </div>
            <div class="stat-card-mini">
                <span class="material-symbols-outlined">quiz</span>
                <div>
                    <div class="stat-value-mini">${totalQuestions}</div>
                    <div class="stat-label-mini">Total Questions</div>
                </div>
            </div>
            <div class="stat-card-mini">
                <span class="material-symbols-outlined">functions</span>
                <div>
                    <div class="stat-value-mini">${avgQuestions}</div>
                    <div class="stat-label-mini">Avg Questions/Test</div>
                </div>
            </div>
            <div class="stat-card-mini">
                <span class="material-symbols-outlined">schedule</span>
                <div>
                    <div class="stat-value-mini">${Math.round(totalDuration / 60)}h ${totalDuration % 60}m</div>
                    <div class="stat-label-mini">Total Duration</div>
                </div>
            </div>
        `;
    } else {
        testsStatsOverview.innerHTML = '';
    }
    
    if (tests.length === 0) {
        allTestsContainer.innerHTML = `<p class="placeholder">You haven't saved any tests yet.</p>`;
        return;
    }
    
    // Apply search and filters
    filteredTests = tests.filter(test => {
        if (currentSearchQuery) {
            return test.name.toLowerCase().includes(currentSearchQuery.toLowerCase());
        }
        return true;
    });
    
    // Sort tests
    switch (currentSortOption) {
        case 'newest':
            filteredTests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            break;
        case 'oldest':
            filteredTests.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            break;
        case 'name-asc':
            filteredTests.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            filteredTests.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'questions-desc':
            filteredTests.sort((a, b) => b.questions.length - a.questions.length);
            break;
        case 'questions-asc':
            filteredTests.sort((a, b) => a.questions.length - b.questions.length);
            break;
    }
    
    if (filteredTests.length === 0) {
        allTestsContainer.innerHTML = `<p class="placeholder">No tests found matching your search.</p>`;
        return;
    }
    
    allTestsContainer.innerHTML = filteredTests.map(test => {
        const dateObj = new Date(test.createdAt);
        const date = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const time = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        
        // Get subjects from questions
        const subjects = [...new Set(test.questions.map(q => q.subject))];
        const subjectsText = subjects.length > 3 ? `${subjects.slice(0, 3).join(', ')}...` : subjects.join(', ');
        
        return `
        <div class="saved-test-item enhanced" data-testid="${test.id}">
            <div class="test-item-header">
                <div>
                    <h3>${test.name}</h3>
                    <p class="test-meta">
                        <span><span class="material-symbols-outlined">calendar_today</span> ${date}</span>
                        <span><span class="material-symbols-outlined">schedule</span> ${time}</span>
                    </p>
                    ${subjects.length > 0 ? `<p class="test-subjects"><span class="material-symbols-outlined">category</span> ${subjectsText}</p>` : ''}
                </div>
            </div>
            <div class="test-stats-preview enhanced">
                 <div class="stat-pill">
                    <span class="material-symbols-outlined">quiz</span> ${test.questions.length} Q's
                 </div>
                 <div class="stat-pill">
                    <span class="material-symbols-outlined">timer</span> ${test.duration} min
                 </div>
                 <div class="stat-pill">
                    <span class="material-symbols-outlined">school</span> ${test.language}
                 </div>
                 <div class="stat-pill">
                    <span class="material-symbols-outlined">star</span> ${test.marksPerQuestion} marks
                 </div>
            </div>
            <div class="test-card-actions">
                <button class="start-btn" aria-label="Start Test" title="Start Test">
                     <span class="material-symbols-outlined">play_arrow</span> Start
                </button>
                 <button class="edit-btn" aria-label="Edit Test" title="Edit Test">
                     <span class="material-symbols-outlined">edit</span>
                </button>
                <button class="download-test-btn" aria-label="Download JSON" title="Download">
                     <span class="material-symbols-outlined">download</span>
                </button>
                <button class="delete-btn" aria-label="Delete Test" title="Delete">
                     <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
    `}).join('');
}

// Search and filter event listeners
const testSearchInput = document.getElementById('test-search-input') as HTMLInputElement;
const testSortSelect = document.getElementById('test-sort-select') as HTMLSelectElement;

if (testSearchInput) {
    testSearchInput.addEventListener('input', (e) => {
        currentSearchQuery = (e.target as HTMLInputElement).value;
        if (!allTestsView.classList.contains('hidden')) {
            renderAllTests();
        }
    });
}

if (testSortSelect) {
    testSortSelect.addEventListener('change', (e) => {
        currentSortOption = (e.target as HTMLSelectElement).value;
        if (!allTestsView.classList.contains('hidden')) {
            renderAllTests();
        }
    });
}

function handleDownloadTest(test: Test) {
    const jsonString = JSON.stringify(test, null, 2); // Pretty print JSON
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Sanitize file name
    const fileName = `test-${test.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleDeleteTest(testId: string) {
    if (confirm("Are you sure you want to delete this test?")) {
        let tests = getFromStorage<Test[]>('tests', []);
        tests = tests.filter(t => t.id !== testId);
        saveToStorage('tests', tests);
        renderAllTests(); // Re-render the list
    }
}

function handleEditTest(test: Test) {
    // Deep copy to ensure we don't mutate state unless saved
    currentTest = JSON.parse(JSON.stringify(test));
    renderEditableTest(currentTest);
    showView(editTestView);
}

function handleImportTest(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result as string;
            if (!text) throw new Error("File is empty.");

            const importedData = JSON.parse(text);

            // Basic validation
            if (
                typeof importedData.name !== 'string' ||
                typeof importedData.duration !== 'number' ||
                !Array.isArray(importedData.questions)
            ) {
                throw new Error("Invalid test file format. The file must contain a name, duration, and questions array.");
            }

            const newTest: Test = {
                ...importedData,
                id: `test_${Date.now()}`, // Assign a new unique ID
                name: `${importedData.name} (Imported)`, // Mark as imported
                createdAt: new Date().toISOString(), // Set new creation date
                marksPerQuestion: importedData.marksPerQuestion || 1, // Default to 1 if missing in import
                negativeMarking: importedData.negativeMarking || 0
            };

            const tests = getFromStorage<Test[]>('tests', []);
            tests.unshift(newTest);
            saveToStorage('tests', tests);

            showToast({ message: `Test "${newTest.name}" imported successfully!`, type: 'success' });
            renderAllTests();

        } catch (error) {
            console.error("Error importing test:", error);
            showToast({ message: `Failed to import test. ${error.message}`, type: 'error' });
        } finally {
            // Reset input value to allow re-uploading the same file
            input.value = '';
        }
    };
    reader.onerror = () => {
         showToast({ message: 'Error reading the file.', type: 'error' });
         input.value = '';
    };
    reader.readAsText(file);
}

importTestBtn.addEventListener('click', () => importTestInput.click());
importTestInput.addEventListener('change', handleImportTest);

allTestsContainer.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const testItem = target.closest('.saved-test-item') as HTMLElement;
    if (!testItem) return;

    const testId = testItem.dataset.testid;
    const tests = getFromStorage<Test[]>('tests', []);
    const test = tests.find(t => t.id === testId);
    if (!test) return;

    // Handle clicks on specific buttons
    if (target.closest('.start-btn')) {
        startTest(test);
    } else if (target.closest('.download-test-btn')) {
        handleDownloadTest(test);
    } else if (target.closest('.delete-btn')) {
        handleDeleteTest(testId);
    } else if (target.closest('.edit-btn')) {
        handleEditTest(test);
    } else {
        // If clicked anywhere else on the card (but not on a button), show details
        if (!target.closest('button')) {
             renderTestDetail(test);
             showView(testDetailView);
        }
    }
});

function renderTestDetail(test: Test) {
    currentTest = test;
    testDetailTitle.textContent = test.name;
    testDetailContainer.innerHTML = test.questions.map((q, index) => `
        <div class="test-detail-item">
            <div class="question-header">
                <p>Question ${index + 1}</p>
                <span class="question-meta">${q.subject} > ${q.topic}</span>
            </div>
            <p>${q.question}</p>
            <ul class="detail-options">
                ${q.options.map((opt, optIndex) => `
                    <li class="detail-option-item ${q.answer === optIndex ? 'correct' : ''}">${opt}</li>
                `).join('')}
            </ul>
            <div class="explanation-box">
                <h4>Explanation</h4>
                <p>${q.explanation}</p>
            </div>
        </div>
    `).join('');
}

testDetailActions.addEventListener('click', e => {
    if (!currentTest) return;
    const target = e.target as HTMLElement;

    if (target.closest('#start-test-btn')) {
        startTest(currentTest);
    }
    if (target.closest('#delete-test-btn')) {
        if (confirm(`Are you sure you want to delete the test "${currentTest.name}"? This action cannot be undone.`)) {
            let tests = getFromStorage<Test[]>('tests', []);
            tests = tests.filter(t => t.id !== currentTest.id);
            saveToStorage('tests', tests);
            showToast({ message: 'Test deleted.', type: 'success' });
            renderAllTests();
            showView(allTestsView);
        }
    }
});

// --- Test Attempt Logic ---
function startTest(test: Test) {
    currentTest = test;
    currentQuestionIndex = 0;
    userAnswers = Array(test.questions.length).fill(null);
    questionStatuses = Array(test.questions.length).fill('notVisited');
    questionStatuses[0] = 'notAnswered';
    timeRemaining = test.duration * 60;
    timePerQuestion = Array(test.questions.length).fill(0);
    questionStartTime = Date.now();

    attemptTestTitle.textContent = test.name;
    
    renderQuestionForAttempt();
    updatePalette();
    startTimer();
    showView(testAttemptView);
}

// Format question text to properly display statement-based questions
function formatQuestionText(text: string): string {
    // Check if it's a statement-based question
    const statementPatterns = [
        /(?:Consider the following|निम्नलिखित कथनों पर विचार|निम्न में से|Which of the following|Select the correct|Choose the correct)/i,
        /(?:Statement|कथन)\s*[\(\[]?[IViv1-9]+[\)\]]?\s*[:.-]/gi,
        /(?:^\s*[IViv]+\s*[\)\.]|^\s*\d+\s*[\)\.])/gm
    ];
    
    const isStatementQuestion = statementPatterns.some(pattern => pattern.test(text));
    
    if (!isStatementQuestion) {
        return `<p class="question-text">${text}</p>`;
    }
    
    // Format statement-based questions
    let formattedText = text;
    
    // Convert numbered statements (1., 2., etc.) to list items
    formattedText = formattedText.replace(/(\d+)\.\s+/g, '<br><strong>$1.</strong> ');
    
    // Convert Roman numeral statements (I., II., etc.) to list items
    formattedText = formattedText.replace(/\b(I{1,3}|IV|V|VI{1,3}|IX|X)\.\s+/gi, '<br><strong>$1.</strong> ');
    
    // Convert Statement I:, Statement II: format
    formattedText = formattedText.replace(/(Statement|कथन)\s*[\(\[]?([IViv1-9]+)[\)\]]?\s*[:.-]\s*/gi, '<br><strong>Statement $2:</strong> ');
    
    // Convert (a), (b), (c), (d) format in question stem
    formattedText = formattedText.replace(/\(([a-d])\)\s*/gi, '<br><strong>($1)</strong> ');
    
    // Convert (1), (2), (3) format
    formattedText = formattedText.replace(/\((\d+)\)\s*/g, '<br><strong>($1)</strong> ');
    
    // Handle "Consider the following statements:" properly
    formattedText = formattedText.replace(/(Consider the following statements?|निम्नलिखित कथनों पर विचार करें?)\s*:?\s*/gi, '<strong>$1:</strong><br>');
    
    // Clean up multiple consecutive line breaks
    formattedText = formattedText.replace(/(<br\s*\/?>){3,}/gi, '<br><br>');
    
    // Remove leading line break if exists
    formattedText = formattedText.replace(/^<br\s*\/?>/, '');
    
    return `<div class="question-text statement-question">${formattedText}</div>`;
}

function renderQuestionForAttempt() {
    const q = currentTest.questions[currentQuestionIndex];
    const formattedQuestion = formatQuestionText(q.question);
    
    questionContentContainer.innerHTML = `
        <div class="question-number-badge">Question ${currentQuestionIndex + 1} of ${currentTest.questions.length}</div>
        ${formattedQuestion}
        <ul class="attempt-options">
            ${q.options.map((opt, index) => `
                <li class="attempt-option-item">
                    <label>
                        <input type="radio" name="option" value="${index}" ${userAnswers[currentQuestionIndex] === index ? 'checked' : ''}>
                        <span class="option-label">${String.fromCharCode(65 + index)}</span>
                        <span class="option-text">${opt}</span>
                    </label>
                </li>
            `).join('')}
        </ul>
    `;
}

function updatePalette() {
    questionPaletteContainer.innerHTML = currentTest.questions.map((_, index) => {
        const status = questionStatuses[index];
        const isCurrent = index === currentQuestionIndex;
        return `<button class="palette-btn ${status} ${isCurrent ? 'current' : ''}" data-index="${index}">${index + 1}</button>`;
    }).join('');
}

questionPaletteContainer.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('palette-btn')) {
        const newIndex = parseInt(target.dataset.index, 10);
        if (newIndex !== currentQuestionIndex) {
            navigateToQuestion(newIndex);
        }
    }
});

function saveCurrentAnswer() {
    const selectedOption = document.querySelector('input[name="option"]:checked') as HTMLInputElement;
    userAnswers[currentQuestionIndex] = selectedOption ? parseInt(selectedOption.value, 10) : null;

    const currentStatus = questionStatuses[currentQuestionIndex];
    if (userAnswers[currentQuestionIndex] !== null) {
        questionStatuses[currentQuestionIndex] = currentStatus === 'marked' || currentStatus === 'markedAndAnswered' ? 'markedAndAnswered' : 'answered';
    } else {
        if (currentStatus !== 'marked' && currentStatus !== 'markedAndAnswered') {
            questionStatuses[currentQuestionIndex] = 'notAnswered';
        }
    }
}

function navigateToQuestion(newIndex: number) {
    // Record time for the current (outgoing) question
    if (currentTest) {
        const timeSpent = (Date.now() - questionStartTime) / 1000;
        timePerQuestion[currentQuestionIndex] += timeSpent;
    }

    saveCurrentAnswer(); // Save answer for the outgoing question

    // Handle navigation limits - if at last question, stay there silently (no popup)
    if (newIndex >= currentTest.questions.length) {
        updatePalette();
        questionStartTime = Date.now();
        // Show a subtle toast instead of alert
        showToast({ message: 'Last question reached. Click Submit when ready.', type: 'info' });
        return;
    }
    if (newIndex < 0) {
        questionStartTime = Date.now();
        showToast({ message: 'You\'re at the first question.', type: 'info' });
        return;
    }

    // Move to the new question
    currentQuestionIndex = newIndex;
    questionStartTime = Date.now(); // Reset timer for the new (incoming) question

    // Update status and render
    if (questionStatuses[currentQuestionIndex] === 'notVisited') {
        questionStatuses[currentQuestionIndex] = 'notAnswered';
    }
    renderQuestionForAttempt();
    updatePalette();
}

const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;

saveNextBtn.addEventListener('click', () => navigateToQuestion(currentQuestionIndex + 1));

prevBtn.addEventListener('click', () => navigateToQuestion(currentQuestionIndex - 1));

clearResponseBtn.addEventListener('click', () => {
    const selectedOption = document.querySelector('input[name="option"]:checked') as HTMLInputElement;
    if (selectedOption) {
        selectedOption.checked = false;
        showToast({ message: 'Response cleared', type: 'info' });
    }
});

markReviewBtn.addEventListener('click', () => {
    const currentStatus = questionStatuses[currentQuestionIndex];
    if (currentStatus === 'answered' || currentStatus === 'markedAndAnswered') {
        questionStatuses[currentQuestionIndex] = 'markedAndAnswered';
    } else {
        questionStatuses[currentQuestionIndex] = 'marked';
    }
    navigateToQuestion(currentQuestionIndex + 1);
});

function handleSubmitTest() {
    try {
        stopTimer();
        
        // Record time for the final question and save the final answer
        const timeSpent = (Date.now() - questionStartTime) / 1000;
        timePerQuestion[currentQuestionIndex] += timeSpent;
        saveCurrentAnswer();

        if (!currentTest) {
            console.error("Submission failed: currentTest is not available.");
            showToast({ message: 'Critical error: Test data is missing. Unable to submit.', type: 'error' });
            showView(mainView); // Go back to the main menu for safety
            return;
        }

        let correctAnswers = 0;
        let incorrectAnswers = 0;
        let unanswered = 0;
        
        currentTest.questions.forEach((q, index) => {
            if (userAnswers[index] === null) {
                unanswered++;
            } else if (userAnswers[index] === q.answer) {
                correctAnswers++;
            } else {
                incorrectAnswers++;
            }
        });

        const marksPerQ = currentTest.marksPerQuestion || 1;
        const negMark = currentTest.negativeMarking || 0;
        const rawScore = (correctAnswers * marksPerQ) - (incorrectAnswers * negMark);
        const totalMaxScore = currentTest.questions.length * marksPerQ;

        // Calculate percentage based on raw score vs potential max score
        const scorePercentage = totalMaxScore > 0 
            ? Math.max(0, (rawScore / totalMaxScore) * 100) 
            : 0;
        
        const attempt: TestAttempt = {
            testId: currentTest.id,
            testName: currentTest.name,
            userAnswers,
            timeTaken: (currentTest.duration * 60) - timeRemaining,
            timePerQuestion,
            completedAt: new Date().toISOString(),
            score: scorePercentage, // Storing percentage for consistency
            totalQuestions: currentTest.questions.length,
            correctAnswers,
            incorrectAnswers,
            unanswered,
            fullTest: currentTest
        };

        const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
        history.unshift(attempt);
        saveToStorage('performanceHistory', history);

        currentTest = null; // Clear the current test state
        
        // Redirect directly to the full report instead of the history list
        renderPerformanceReport(attempt, false);
        showView(performanceReportView);

    } catch (error) {
        console.error("An unexpected error occurred during test submission:", error);
        showToast({ message: 'An unexpected error occurred while submitting your test. Your progress could not be saved.', type: 'error' });
        showView(mainView); // Fallback to main view on error
    }
}

// --- Timer Logic ---
function startTimer() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = window.setInterval(() => {
        timeRemaining--;
        const hours = Math.floor(timeRemaining / 3600);
        const minutes = Math.floor((timeRemaining % 3600) / 60);
        const seconds = timeRemaining % 60;
        timeLeftEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        if (timeRemaining <= 0) {
            stopTimer();
            showToast({ title: 'Time\'s Up!', message: 'Your test will be submitted automatically.', type: 'warning' });
            handleSubmitTest();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
}

// --- Performance Logic ---
let currentResultsFilter = { search: '', sort: 'newest' };

// Results search/filter elements
const resultsSearchInput = document.getElementById('results-search-input') as HTMLInputElement;
const resultsSortSelect = document.getElementById('results-sort-select') as HTMLSelectElement;
const bulkDeleteResultsBtn = document.getElementById('bulk-delete-results-btn');

// Search results event
resultsSearchInput?.addEventListener('input', (e) => {
    currentResultsFilter.search = (e.target as HTMLInputElement).value.toLowerCase();
    renderPerformanceHistory();
});

// Sort results event
resultsSortSelect?.addEventListener('change', (e) => {
    currentResultsFilter.sort = (e.target as HTMLSelectElement).value;
    renderPerformanceHistory();
});

function renderPerformanceHistory() {
    let history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    
    if (history.length === 0) {
        performanceContainer.innerHTML = `<p class="placeholder">You haven't completed any tests yet.</p>`;
        return;
    }
    
    // Apply search filter
    if (currentResultsFilter.search) {
        history = history.filter(attempt => 
            attempt.testName.toLowerCase().includes(currentResultsFilter.search)
        );
    }
    
    // Apply sorting
    const sortedHistory = [...history];
    switch (currentResultsFilter.sort) {
        case 'oldest':
            sortedHistory.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
            break;
        case 'score-high':
            sortedHistory.sort((a, b) => b.score - a.score);
            break;
        case 'score-low':
            sortedHistory.sort((a, b) => a.score - b.score);
            break;
        case 'newest':
        default:
            sortedHistory.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
            break;
    }
    
    // Use sortedHistory for display but keep original indices
    history = sortedHistory;
    
    if (history.length === 0) {
        performanceContainer.innerHTML = `<p class="placeholder">No results match your search.</p>`;
        return;
    }
    
    // Get original history for index mapping
    const originalHistory = getFromStorage<TestAttempt[]>('performanceHistory', []);

    // Calculate overall stats
    const totalTests = history.length;
    const avgScore = history.reduce((sum, a) => sum + a.score, 0) / totalTests;
    const totalCorrect = history.reduce((sum, a) => sum + a.correctAnswers, 0);
    const totalQuestions = history.reduce((sum, a) => sum + a.totalQuestions, 0);
    const overallAccuracy = (totalCorrect / totalQuestions) * 100;
    const bestScore = Math.max(...history.map(a => a.score));
    const recentImprovement = history.length >= 3 ? 
        (history.slice(0, 3).reduce((sum, a) => sum + a.score, 0) / 3) - 
        (history.slice(-3).reduce((sum, a) => sum + a.score, 0) / 3) : 0;

    // Add overview stats at the top
    const overviewHTML = `
        <div class="performance-overview-grid">
            <div class="perf-stat-card">
                <div class="perf-stat-icon"><span class="material-symbols-outlined">history</span></div>
                <div class="perf-stat-content">
                    <div class="perf-stat-value">${totalTests}</div>
                    <div class="perf-stat-label">Tests Completed</div>
                </div>
            </div>
            <div class="perf-stat-card">
                <div class="perf-stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);"><span class="material-symbols-outlined">percent</span></div>
                <div class="perf-stat-content">
                    <div class="perf-stat-value">${avgScore.toFixed(1)}%</div>
                    <div class="perf-stat-label">Average Score</div>
                </div>
            </div>
            <div class="perf-stat-card">
                <div class="perf-stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);"><span class="material-symbols-outlined">emoji_events</span></div>
                <div class="perf-stat-content">
                    <div class="perf-stat-value">${bestScore.toFixed(1)}%</div>
                    <div class="perf-stat-label">Best Score</div>
                </div>
            </div>
            <div class="perf-stat-card">
                <div class="perf-stat-icon" style="background: linear-gradient(135deg, #06b6d4, #0891b2);"><span class="material-symbols-outlined">track_changes</span></div>
                <div class="perf-stat-content">
                    <div class="perf-stat-value">${overallAccuracy.toFixed(1)}%</div>
                    <div class="perf-stat-label">Overall Accuracy</div>
                </div>
            </div>
            <div class="perf-stat-card">
                <div class="perf-stat-icon" style="background: linear-gradient(135deg, ${recentImprovement >= 0 ? '#10b981, #059669' : '#ef4444, #dc2626'});"><span class="material-symbols-outlined">${recentImprovement >= 0 ? 'trending_up' : 'trending_down'}</span></div>
                <div class="perf-stat-content">
                    <div class="perf-stat-value">${recentImprovement >= 0 ? '+' : ''}${recentImprovement.toFixed(1)}%</div>
                    <div class="perf-stat-label">Recent Trend</div>
                </div>
            </div>
        </div>
        
        <div class="section-divider">
            <h3><span class="material-symbols-outlined">list_alt</span> Test History</h3>
        </div>
    `;

    const historyCards = history.map((attempt) => {
        // Find original index for proper deletion
        const originalIndex = originalHistory.findIndex(h => 
            h.completedAt === attempt.completedAt && h.testName === attempt.testName
        );
        
        const dateObj = new Date(attempt.completedAt);
        const date = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const time = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const scoreClass = attempt.score >= 70 ? 'excellent' : attempt.score >= 50 ? 'pass' : 'fail';
        const timeTakenStr = new Date(attempt.timeTaken * 1000).toISOString().substr(11, 8); // HH:MM:SS
        const accuracy = attempt.totalQuestions > 0 ? 
            ((attempt.correctAnswers / (attempt.correctAnswers + attempt.incorrectAnswers)) * 100 || 0) : 0;

        return `
        <div class="history-card enhanced" data-attempt-index="${originalIndex}">
            <div class="history-card-header">
                <div class="history-info">
                    <h3>${attempt.testName}</h3>
                    <div class="history-meta">
                        <span><span class="material-symbols-outlined">calendar_today</span> ${date}</span>
                        <span><span class="material-symbols-outlined">schedule</span> ${time}</span>
                    </div>
                </div>
                <div class="history-score-badge-container">
                    <div class="score-badge-large ${scoreClass}">
                        <div class="score-value">${attempt.score.toFixed(1)}<span class="score-percent">%</span></div>
                        <div class="score-label">Score</div>
                    </div>
                </div>
            </div>
            
            <div class="history-stats-grid">
                <div class="history-stat-item">
                    <span class="material-symbols-outlined" style="color: var(--success-color);">check_circle</span>
                    <div>
                        <div class="stat-value">${attempt.correctAnswers}</div>
                        <div class="stat-label">Correct</div>
                    </div>
                </div>
                <div class="history-stat-item">
                    <span class="material-symbols-outlined" style="color: var(--danger-color);">cancel</span>
                    <div>
                        <div class="stat-value">${attempt.incorrectAnswers}</div>
                        <div class="stat-label">Incorrect</div>
                    </div>
                </div>
                <div class="history-stat-item">
                    <span class="material-symbols-outlined" style="color: var(--text-muted);">help</span>
                    <div>
                        <div class="stat-value">${attempt.unanswered}</div>
                        <div class="stat-label">Unanswered</div>
                    </div>
                </div>
                <div class="history-stat-item">
                    <span class="material-symbols-outlined" style="color: var(--info-color);">timer</span>
                    <div>
                        <div class="stat-value">${timeTakenStr}</div>
                        <div class="stat-label">Time</div>
                    </div>
                </div>
                <div class="history-stat-item">
                    <span class="material-symbols-outlined" style="color: var(--accent-cyan);">track_changes</span>
                    <div>
                        <div class="stat-value">${accuracy.toFixed(0)}%</div>
                        <div class="stat-label">Accuracy</div>
                    </div>
                </div>
                <div class="history-stat-item">
                    <span class="material-symbols-outlined" style="color: var(--warning-color);">speed</span>
                    <div>
                        <div class="stat-value">${(attempt.timeTaken / attempt.totalQuestions).toFixed(0)}s</div>
                        <div class="stat-label">Avg/Q</div>
                    </div>
                </div>
            </div>
            
            <div class="history-card-footer">
                <button class="view-report-btn">
                    <span class="material-symbols-outlined">analytics</span>
                    <span>Analysis</span>
                </button>
                <button class="retry-test-btn" data-index="${originalIndex}" title="Retry this test">
                    <span class="material-symbols-outlined">replay</span>
                    <span>Retry</span>
                </button>
                <button class="delete-result-btn" data-index="${originalIndex}" title="Delete this result">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
    `}).join('');

    performanceContainer.innerHTML = overviewHTML + historyCards;
}

performanceContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Handle View Report Button
    const viewBtn = target.closest('.view-report-btn');
    if (viewBtn) {
        const item = viewBtn.closest('.history-card') as HTMLElement;
        if (item) {
            const index = parseInt(item.dataset.attemptIndex, 10);
            const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
            
            if (isNaN(index) || index < 0 || index >= history.length) {
                showToast({ message: 'Unable to load result. Please try again.', type: 'error' });
                return;
            }
            
            const attempt = history[index];
            if (!attempt) {
                showToast({ message: 'Result data not found.', type: 'error' });
                return;
            }
            
            renderPerformanceReport(attempt, true);
            showView(performanceReportView);
        }
        return;
    }
    
    // Handle Retry Test Button
    const retryBtn = target.closest('.retry-test-btn');
    if (retryBtn) {
        e.stopPropagation();
        const item = retryBtn.closest('.history-card') as HTMLElement;
        if (item) {
            const index = parseInt(item.dataset.attemptIndex, 10);
            const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
            const attempt = history[index];
            
            if (attempt && attempt.fullTest) {
                if (confirm(`🔄 Retry "${attempt.testName}"?\n\nThis will start a fresh attempt of the same test.`)) {
                    // Start the test from the stored test data
                    startTest(attempt.fullTest);
                }
            } else {
                showToast({ message: 'Test data not available for retry.', type: 'warning' });
            }
        }
        return;
    }
    
    // Handle Delete Result Button
    const deleteBtn = target.closest('.delete-result-btn');
    if (deleteBtn) {
        e.stopPropagation();
        const item = deleteBtn.closest('.history-card') as HTMLElement;
        if (item) {
            const index = parseInt(item.dataset.attemptIndex, 10);
            const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
            const attemptName = history[index]?.testName || 'this result';
            
            if (confirm(`🗑️ Delete result for "${attemptName}"?\n\nThis action cannot be undone.`)) {
                history.splice(index, 1);
                saveToStorage('performanceHistory', history);
                renderPerformanceHistory();
                
                // Show brief confirmation
                showToast({ message: 'Result deleted successfully', type: 'success' });
            }
        }
        return;
    }
    
    // Handle clicking on the card itself (outside buttons) - also open report
    const historyCard = target.closest('.history-card') as HTMLElement;
    if (historyCard && !target.closest('button')) {
        const index = parseInt(historyCard.dataset.attemptIndex, 10);
        const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
        
        if (!isNaN(index) && index >= 0 && index < history.length) {
            const attempt = history[index];
            if (attempt) {
                renderPerformanceReport(attempt, true);
                showView(performanceReportView);
            }
        }
    }
});

// Render detailed performance report
function renderPerformanceReport(attempt: TestAttempt, fromHistory: boolean = true) {
    if (!attempt || !attempt.fullTest) {
        showToast({ message: 'Invalid result data. Cannot display report.', type: 'error' });
        return;
    }
    
    currentAttemptForReport = attempt; // Store attempt for deeper analysis
    
    // Update Back button logic based on entry point
    if (fromHistory) {
        reportReturnView = performanceView;
        backToPerformanceListBtn.innerHTML = '<span class="material-symbols-outlined">arrow_back</span> Back to History';
    } else {
        reportReturnView = allTestsView;
        backToPerformanceListBtn.innerHTML = '<span class="material-symbols-outlined">home</span> Back to All Tests';
    }

    performanceReportTitle.textContent = `Result Report for ${attempt.testName}`;
    
    const attemptedCount = attempt.correctAnswers + attempt.incorrectAnswers;
    const accuracy = attemptedCount > 0 ? (attempt.correctAnswers / attemptedCount) * 100 : 0;
    const avgTimePerQ = attempt.totalQuestions > 0 ? (attempt.timeTaken / attempt.totalQuestions) : 0;
    
    // Calculate rank estimate
    const rankCategory = attempt.score >= 80 ? 'Excellent' : attempt.score >= 60 ? 'Good' : attempt.score >= 40 ? 'Average' : 'Needs Work';
    const rankColor = attempt.score >= 80 ? 'var(--success-color)' : attempt.score >= 60 ? 'var(--info-color)' : attempt.score >= 40 ? 'var(--warning-color)' : 'var(--danger-color)';
    
    // 1. Render Summary Cards with enhanced info
    performanceSummaryContainer.innerHTML = `
        <div class="summary-card score">
            <div class="summary-icon"><span class="material-symbols-outlined">percent</span></div>
            <div class="summary-data">
                <div class="summary-value">${attempt.score.toFixed(1)}%</div>
                <div class="summary-label">Score</div>
            </div>
        </div>
         <div class="summary-card accuracy">
            <div class="summary-icon"><span class="material-symbols-outlined">track_changes</span></div>
            <div class="summary-data">
                <div class="summary-value">${accuracy.toFixed(1)}%</div>
                <div class="summary-label">Accuracy</div>
            </div>
        </div>
        <div class="summary-card correct">
            <div class="summary-icon"><span class="material-symbols-outlined">check_circle</span></div>
            <div class="summary-data">
                <div class="summary-value">${attempt.correctAnswers}</div>
                <div class="summary-label">Correct</div>
            </div>
        </div>
        <div class="summary-card incorrect">
            <div class="summary-icon"><span class="material-symbols-outlined">cancel</span></div>
             <div class="summary-data">
                <div class="summary-value">${attempt.incorrectAnswers}</div>
                <div class="summary-label">Incorrect</div>
            </div>
        </div>
        <div class="summary-card unanswered">
            <div class="summary-icon"><span class="material-symbols-outlined">help</span></div>
             <div class="summary-data">
                <div class="summary-value">${attempt.unanswered}</div>
                <div class="summary-label">Unanswered</div>
            </div>
        </div>
        <div class="summary-card time">
             <div class="summary-icon"><span class="material-symbols-outlined">timer</span></div>
             <div class="summary-data">
                 <div class="summary-value">${(attempt.timeTaken / 60).toFixed(1)}m</div>
                 <div class="summary-label">Time Taken</div>
             </div>
        </div>
        <div class="summary-card rank" style="--accent-color: ${rankColor}">
             <div class="summary-icon"><span class="material-symbols-outlined">military_tech</span></div>
             <div class="summary-data">
                 <div class="summary-value" style="color: ${rankColor}; font-size: 1rem;">${rankCategory}</div>
                 <div class="summary-label">Performance</div>
             </div>
        </div>
        <div class="summary-card avgtime">
             <div class="summary-icon"><span class="material-symbols-outlined">speed</span></div>
             <div class="summary-data">
                 <div class="summary-value">${avgTimePerQ.toFixed(1)}s</div>
                 <div class="summary-label">Avg/Question</div>
             </div>
        </div>
    `;

    // 2. Render content into all containers (initially hidden by CSS except active one)
    renderTimeAnalysisCharts(attempt);
    renderSubjectBreakdown(attempt);
    renderTopicWiseAnalysis(attempt);
    renderBiasAnalysis(attempt);
    renderMistakesReview(attempt);
    renderAllQuestionsReview(attempt);
    renderDifficultyAnalysis(attempt);
    
    // 3. Reset Tab State (Default to Mistake Review)
    const reportTabs = document.querySelectorAll('.report-tab-btn');
    const reportPanes = document.querySelectorAll('.report-tab-pane');

    reportTabs.forEach(tab => tab.classList.remove('active'));
    reportPanes.forEach(pane => pane.classList.remove('active'));

    // Default active: Mistakes Review
    const defaultTab = document.querySelector('.report-tab-btn[data-target="mistakes-view"]');
    if (defaultTab) {
        defaultTab.classList.add('active');
        mistakesReviewContainer.classList.add('active');
    }

    downloadReportBtn.onclick = () => handleDownloadReport(attempt);
    
    // Retry from report button
    const retryFromReportBtn = document.getElementById('retry-from-report-btn');
    if (retryFromReportBtn) {
        retryFromReportBtn.onclick = () => {
            if (attempt.fullTest) {
                if (confirm(`🔄 Retry "${attempt.testName}"?\n\nThis will start a fresh attempt of the same test.`)) {
                    startTest(attempt.fullTest);
                }
            } else {
                showToast({ message: 'Test data not available for retry.', type: 'warning' });
            }
        };
    }
    
    // Delete from report button
    const deleteFromReportBtn = document.getElementById('delete-from-report-btn');
    if (deleteFromReportBtn) {
        deleteFromReportBtn.onclick = () => {
            if (confirm(`🗑️ Delete this result for "${attempt.testName}"?\n\nThis action cannot be undone.`)) {
                const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
                const indexToDelete = history.findIndex(h => 
                    h.completedAt === attempt.completedAt && h.testName === attempt.testName
                );
                
                if (indexToDelete !== -1) {
                    history.splice(indexToDelete, 1);
                    saveToStorage('performanceHistory', history);
                    showToast({ message: 'Result deleted successfully', type: 'success' });
                    
                    // Navigate back
                    if (reportReturnView === performanceView) {
                        renderPerformanceHistory();
                    }
                    showView(reportReturnView);
                }
            }
        };
    }
}

// Add event delegation for Tab Switching
document.querySelector('.report-tabs-container')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const tabBtn = target.closest('.report-tab-btn');
    
    if (tabBtn) {
        // Remove active class from all tabs and panes
        document.querySelectorAll('.report-tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.report-tab-pane').forEach(p => p.classList.remove('active'));
        
        // Add active class to clicked tab
        tabBtn.classList.add('active');
        
        // Show corresponding pane
        const targetId = tabBtn.getAttribute('data-target');
        const targetPane = document.getElementById(targetId);
        if (targetPane) {
            targetPane.classList.add('active');
        }
    }
});


function handleDownloadReport(attempt: TestAttempt) {
    let reportContent = `Result Report for: ${attempt.testName}\n`;
    reportContent += `Completed on: ${new Date(attempt.completedAt).toLocaleString()}\n`;
    reportContent += `========================================\n\n`;

    // Overall Summary
    const attempted = attempt.correctAnswers + attempt.incorrectAnswers;
    const accuracy = attempted > 0 ? (attempt.correctAnswers / attempted) * 100 : 0;
    const timeTakenStr = new Date(attempt.timeTaken * 1000).toISOString().substr(11, 8);
    
    reportContent += `--- Overall Summary ---\n`;
    reportContent += `Score: ${attempt.score.toFixed(2)}%\n`;
    reportContent += `Accuracy (on attempted): ${accuracy.toFixed(2)}%\n`;
    reportContent += `Correct Answers: ${attempt.correctAnswers}\n`;
    reportContent += `Incorrect Answers: ${attempt.incorrectAnswers}\n`;
    reportContent += `Unanswered: ${attempt.unanswered}\n`;
    reportContent += `Total Questions: ${attempt.totalQuestions}\n`;
    reportContent += `Time Taken: ${timeTakenStr}\n\n`;

    // Subject Breakdown
    reportContent += `--- Subject & Topic Breakdown ---\n`;
    const subjectStats: { [key: string]: { correct: number, total: number, topics: { [key: string]: { correct: number, total: number } } } } = {};
    attempt.fullTest.questions.forEach((q, i) => {
        const subject = q.subject || 'Uncategorized';
        const topic = q.topic || 'General';
        if (!subjectStats[subject]) subjectStats[subject] = { correct: 0, total: 0, topics: {} };
        if (!subjectStats[subject].topics[topic]) subjectStats[subject].topics[topic] = { correct: 0, total: 0 };
        subjectStats[subject].total++;
        subjectStats[subject].topics[topic].total++;
        if (attempt.userAnswers[i] === q.answer) {
            subjectStats[subject].correct++;
            subjectStats[subject].topics[topic].correct++;
        }
    });

    for (const [subject, stats] of Object.entries(subjectStats)) {
        const subjectAccuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
        reportContent += `${subject} (${subjectAccuracy.toFixed(1)}% Accuracy)\n`;
         for (const [topic, topicStats] of Object.entries(stats.topics)) {
             const topicAccuracy = topicStats.total > 0 ? (topicStats.correct / topicStats.total) * 100 : 0;
             reportContent += `  - ${topic}: ${topicStats.correct}/${topicStats.total} (${topicAccuracy.toFixed(0)}%)\n`;
         }
        reportContent += `\n`;
    }

    // All Questions Review
    reportContent += `--- All Questions Review ---\n\n`;
    attempt.fullTest.questions.forEach((q, index) => {
         const userAnswer = attempt.userAnswers[index];
         let userStatus = '';
         if (userAnswer === q.answer) userStatus = 'Correct';
         else if (userAnswer !== null) userStatus = 'Incorrect';
         else userStatus = 'Unanswered';

        reportContent += `Q${index + 1}: ${q.question} (${userStatus}) - Time: ${attempt.timePerQuestion[index].toFixed(1)}s\n`;
        q.options.forEach((opt, optIndex) => {
            let marker = '[ ]';
            if (optIndex === q.answer && optIndex === userAnswer) marker = '[✓]'; // Correctly answered
            else if (optIndex === q.answer) marker = '[✓]'; // Correct answer
            else if (optIndex === userAnswer) marker = '[✗]'; // User's incorrect answer
            
            reportContent += `  ${marker} ${opt}\n`;
        });
        reportContent += `Explanation: ${q.explanation}\n\n`;
    });
    
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${attempt.testName.replace(/[^a-zA-Z0-9]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderTimeAnalysisCharts(attempt: TestAttempt) {
    const avgTime = attempt.timePerQuestion.reduce((a, b) => a + b, 0) / attempt.timePerQuestion.length;
    const maxTime = Math.max(...attempt.timePerQuestion, 1);
    const minTime = Math.min(...attempt.timePerQuestion);
    const medianTime = [...attempt.timePerQuestion].sort((a, b) => a - b)[Math.floor(attempt.timePerQuestion.length / 2)];
    
    // Calculate time efficiency
    const totalTime = attempt.timeTaken;
    const totalTimeMin = Math.floor(totalTime / 60);
    const totalTimeSec = totalTime % 60;
    const availableTime = attempt.fullTest.duration * 60;
    const timeUtilization = (totalTime / availableTime) * 100;
    const timePerCorrect = attempt.correctAnswers > 0 ? totalTime / attempt.correctAnswers : 0;
    const timePerIncorrect = attempt.incorrectAnswers > 0 ? 
        attempt.fullTest.questions.reduce((sum, q, i) => {
            if (attempt.userAnswers[i] !== null && attempt.userAnswers[i] !== q.answer) {
                return sum + attempt.timePerQuestion[i];
            }
            return sum;
        }, 0) / attempt.incorrectAnswers : 0;
    
    // Time Statistics Cards with Enhanced Metrics
    let timeStatsHTML = `
        <div class="time-stats-grid enhanced">
            <div class="time-stat-card premium">
                <div class="time-stat-icon" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                    <span class="material-symbols-outlined">timer</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${totalTimeMin}m ${totalTimeSec}s</div>
                    <div class="time-stat-label">Total Time</div>
                    <div class="time-stat-sublabel">${timeUtilization.toFixed(0)}% of ${attempt.fullTest.duration} min</div>
                </div>
            </div>
            <div class="time-stat-card premium">
                <div class="time-stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                    <span class="material-symbols-outlined">avg_time</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${avgTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Average per Q</div>
                    <div class="time-stat-sublabel">Median: ${medianTime.toFixed(1)}s</div>
                </div>
            </div>
            <div class="time-stat-card premium">
                <div class="time-stat-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                    <span class="material-symbols-outlined">check_circle</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${timePerCorrect.toFixed(1)}s</div>
                    <div class="time-stat-label">Avg for Correct</div>
                    <div class="time-stat-sublabel">${attempt.correctAnswers} questions</div>
                </div>
            </div>
            <div class="time-stat-card premium">
                <div class="time-stat-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                    <span class="material-symbols-outlined">cancel</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${timePerIncorrect.toFixed(1)}s</div>
                    <div class="time-stat-label">Avg for Incorrect</div>
                    <div class="time-stat-sublabel">${attempt.incorrectAnswers} questions</div>
                </div>
            </div>
            <div class="time-stat-card premium">
                <div class="time-stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                    <span class="material-symbols-outlined">arrow_upward</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${maxTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Longest</div>
                    <div class="time-stat-sublabel">Max time spent</div>
                </div>
            </div>
            <div class="time-stat-card premium">
                <div class="time-stat-icon" style="background: linear-gradient(135deg, #06b6d4, #0891b2);">
                    <span class="material-symbols-outlined">arrow_downward</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${minTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Shortest</div>
                    <div class="time-stat-sublabel">Min time spent</div>
                </div>
            </div>
        </div>
    `;

    // Question Time Chart with Toggle Button
    let perQuestionChartHTML = `
        <div class="chart-section analysis-container">
            <h4><span class="material-symbols-outlined">bar_chart</span> Time Spent Per Question</h4>
            <div class="chart-legend">
                <span class="legend-item"><span class="legend-dot" style="background: var(--success-color);"></span> Correct</span>
                <span class="legend-item"><span class="legend-dot" style="background: var(--danger-color);"></span> Incorrect</span>
                <span class="legend-item"><span class="legend-dot" style="background: var(--text-muted);"></span> Unanswered</span>
            </div>
    `;
    
    perQuestionChartHTML += '<div id="q-chart-container" class="chart question-time-chart" style="max-height: 300px; overflow-y: auto;">';

    attempt.timePerQuestion.forEach((time, index) => {
        const q = attempt.fullTest.questions[index];
        const userAnswer = attempt.userAnswers[index];
        let statusClass = 'bar-unanswered';
        if (userAnswer === q.answer) {
            statusClass = 'bar-correct';
        } else if (userAnswer !== null) {
            statusClass = 'bar-incorrect';
        }
        
        const barWidth = Math.max((time / maxTime) * 100, 2);

        perQuestionChartHTML += `
            <div class="chart-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <div class="chart-label" style="width: 35px; font-size: 0.8rem;">Q${index + 1}</div>
                <div class="chart-bar-container" style="flex: 1; height: 10px; background: var(--card-border-color); border-radius: 5px; overflow: hidden;">
                    <div class="chart-bar ${statusClass}" style="width: ${barWidth}%; height: 100%;" title="Time: ${time.toFixed(1)}s"></div>
                </div>
                <div class="chart-value" style="width: 45px; font-size: 0.8rem; text-align: right;">${time.toFixed(1)}s</div>
            </div>
        `;
    });
    perQuestionChartHTML += '</div>';
    
    // Add the Expand Button
    perQuestionChartHTML += \`<button id="expand-chart-btn" class="expand-chart-btn" style="width: 100%; margin-top: 10px; padding: 8px; border: 1px dashed var(--card-border-color); background: none; color: var(--primary-color); cursor: pointer; border-radius: 6px;"><span class="material-symbols-outlined" style="vertical-align: middle;">unfold_more</span> Show Full Chart</button></div>\`;
    
    // Question Time Chart with Toggle Button
    let perQuestionChartHTML = `
        <div class="chart-section analysis-container">
            <h4><span class="material-symbols-outlined">bar_chart</span> Time Spent Per Question</h4>
            <div class="chart-legend">
                <span class="legend-item"><span class="legend-dot" style="background: var(--success-color);"></span> Correct</span>
                <span class="legend-item"><span class="legend-dot" style="background: var(--danger-color);"></span> Incorrect</span>
                <span class="legend-item"><span class="legend-dot" style="background: var(--text-muted);"></span> Unanswered</span>
            </div>
    `;
    
    perQuestionChartHTML += '<div id="q-chart-container" class="chart question-time-chart" style="max-height: 300px; overflow-y: auto;">';

    attempt.timePerQuestion.forEach((time, index) => {
        const q = attempt.fullTest.questions[index];
        const userAnswer = attempt.userAnswers[index];
        let statusClass = 'bar-unanswered';
        if (userAnswer === q.answer) {
            statusClass = 'bar-correct';
        } else if (userAnswer !== null) {
            statusClass = 'bar-incorrect';
        }
        
        const barWidth = Math.max((time / maxTime) * 100, 2);

        perQuestionChartHTML += `
            <div class="chart-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <div class="chart-label" style="width: 35px; font-size: 0.8rem;">Q${index + 1}</div>
                <div class="chart-bar-container" style="flex: 1; height: 10px; background: var(--bg-color); border-radius: 5px; overflow: hidden;">
                    <div class="chart-bar ${statusClass}" style="width: ${barWidth}%; height: 100%;" title="Time: ${time.toFixed(1)}s"></div>
                </div>
                <div class="chart-value" style="width: 45px; font-size: 0.8rem; text-align: right;">${time.toFixed(1)}s</div>
            </div>
        `;
    });
    perQuestionChartHTML += '</div>';
    
    // Add the Expand Button
    perQuestionChartHTML += `<button id="expand-chart-btn" class="expand-chart-btn" style="width: 100%; margin-top: 10px; padding: 8px; border: 1px dashed var(--card-border-color); background: none; color: var(--primary-color); cursor: pointer; border-radius: 6px;"><span class="material-symbols-outlined" style="vertical-align: middle;">unfold_more</span> Show Full Chart</button></div>`;

    // Subject Time Analysis
    const subjectTimes: { [key: string]: { totalTime: number; count: number; correct: number } } = {};
    attempt.fullTest.questions.forEach((q, i) => {
        const subject = q.subject || 'Uncategorized';
        if (!subjectTimes[subject]) {
            subjectTimes[subject] = { totalTime: 0, count: 0, correct: 0 };
        }
        subjectTimes[subject].totalTime += attempt.timePerQuestion[i];
        subjectTimes[subject].count++;
        if (attempt.userAnswers[i] === q.answer) {
            subjectTimes[subject].correct++;
        }
    });

    const subjectAvgs = Object.entries(subjectTimes).map(([subject, data]) => ({
        subject,
        avgTime: data.totalTime / data.count,
        accuracy: (data.correct / data.count) * 100,
        count: data.count,
        totalTime: data.totalTime
    }));
    
    const maxAvgTime = Math.max(...subjectAvgs.map(s => s.avgTime), 1);
    
    let perSubjectChartHTML = `
        <div class="chart-section">
            <h4><span class="material-symbols-outlined">category</span> Average Time Per Subject</h4>
            <div class="chart subject-time-chart enhanced">
    `;
    subjectAvgs.forEach(({ subject, avgTime, accuracy, count, totalTime }) => {
        const barWidth = (avgTime / maxAvgTime) * 100;
        const barColor = accuracy >= 70 ? 'var(--success-color)' : accuracy >= 50 ? 'var(--warning-color)' : 'var(--danger-color)';
        const totalMin = Math.floor(totalTime / 60);
        const totalSec = Math.round(totalTime % 60);
        perSubjectChartHTML += `
            <div class="chart-row enhanced">
                <div class="chart-label">
                    <div class="chart-label-main">${subject}</div>
                    <div class="chart-label-sub">${count} questions • ${totalMin}m ${totalSec}s total</div>
                </div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="width: ${barWidth}%; background: ${barColor}" title="Avg Time: ${avgTime.toFixed(1)}s | Accuracy: ${accuracy.toFixed(0)}%">
                        <span class="chart-bar-label">${accuracy.toFixed(0)}%</span>
                    </div>
                </div>
                <div class="chart-value">${avgTime.toFixed(1)}s</div>
            </div>
        `;
    });
    perSubjectChartHTML += '</div></div>';
    
    // Time Distribution Analysis
    let timeDistHTML = `
        <div class="chart-section">
            <h4><span class="material-symbols-outlined">donut_large</span> Time Distribution Analysis</h4>
            <div class="time-distribution-grid">
    `;
    
    // Categorize by time ranges
    const quick = attempt.timePerQuestion.filter(t => t < avgTime * 0.5).length;
    const normal = attempt.timePerQuestion.filter(t => t >= avgTime * 0.5 && t <= avgTime * 1.5).length;
    const slow = attempt.timePerQuestion.filter(t => t > avgTime * 1.5).length;
    
    const quickPct = (quick / attempt.totalQuestions) * 100;
    const normalPct = (normal / attempt.totalQuestions) * 100;
    const slowPct = (slow / attempt.totalQuestions) * 100;
    
    timeDistHTML += `
            <div class="time-dist-bar">
                <div class="dist-segment quick" style="width: ${quickPct}%" title="${quick} questions (${quickPct.toFixed(1)}%)"></div>
                <div class="dist-segment normal" style="width: ${normalPct}%" title="${normal} questions (${normalPct.toFixed(1)}%)"></div>
                <div class="dist-segment slow" style="width: ${slowPct}%" title="${slow} questions (${slowPct.toFixed(1)}%)"></div>
            </div>
            <div class="time-dist-legend">
                <div class="dist-legend-item">
                    <span class="dist-dot quick"></span>
                    <div class="dist-legend-text">
                        <strong>Quick</strong> (< ${(avgTime * 0.5).toFixed(0)}s): <strong>${quick}</strong> questions (${quickPct.toFixed(1)}%)
                    </div>
                </div>
                <div class="dist-legend-item">
                    <span class="dist-dot normal"></span>
                    <div class="dist-legend-text">
                        <strong>Normal</strong> (${(avgTime * 0.5).toFixed(0)}-${(avgTime * 1.5).toFixed(0)}s): <strong>${normal}</strong> questions (${normalPct.toFixed(1)}%)
                    </div>
                </div>
                <div class="dist-legend-item">
                    <span class="dist-dot slow"></span>
                    <div class="dist-legend-text">
                        <strong>Slow</strong> (> ${(avgTime * 1.5).toFixed(0)}s): <strong>${slow}</strong> questions (${slowPct.toFixed(1)}%)
                    </div>
                </div>
            </div>
        </div>
        </div>
    `;

    timeAnalysisContainer.innerHTML = timeStatsHTML + perQuestionChartHTML + perSubjectChartHTML + timeDistHTML;

    // Attach listener for Expand Button
    document.getElementById('expand-chart-btn')?.addEventListener('click', (e) => {
        const btn = e.target as HTMLElement;
        const chart = document.getElementById('q-chart-container');
        if (chart) {
            chart.classList.toggle('expanded');
            if (chart.classList.contains('expanded')) {
                btn.textContent = 'Collapse Chart';
            } else {
                btn.textContent = 'Show Full Chart (All Questions)';
            }
        }
    });
}


function renderSubjectBreakdown(attempt: TestAttempt) {
    const subjectStats: { [key: string]: { correct: number, total: number, incorrect: number, unanswered: number, totalTime: number, topics: { [key: string]: { correct: number, total: number } } } } = {};
    
    attempt.fullTest.questions.forEach((q, i) => {
        const subject = q.subject || 'Uncategorized';
        const topic = q.topic || 'General';

        if (!subjectStats[subject]) {
            subjectStats[subject] = { correct: 0, total: 0, incorrect: 0, unanswered: 0, totalTime: 0, topics: {} };
        }
        if (!subjectStats[subject].topics[topic]) {
            subjectStats[subject].topics[topic] = { correct: 0, total: 0 };
        }

        subjectStats[subject].total++;
        subjectStats[subject].totalTime += attempt.timePerQuestion[i] || 0;
        subjectStats[subject].topics[topic].total++;

        if (attempt.userAnswers[i] === null) {
            subjectStats[subject].unanswered++;
        } else if (attempt.userAnswers[i] === q.answer) {
            subjectStats[subject].correct++;
            subjectStats[subject].topics[topic].correct++;
        } else {
            subjectStats[subject].incorrect++;
        }
    });

    // Create visual pie chart representation for each subject
    subjectBreakdownContainer.innerHTML = Object.entries(subjectStats).map(([subject, stats]) => {
        const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
        const avgTime = stats.total > 0 ? (stats.totalTime / stats.total) : 0;
        const correctPct = (stats.correct / stats.total) * 100;
        const incorrectPct = (stats.incorrect / stats.total) * 100;
        const unansweredPct = (stats.unanswered / stats.total) * 100;
        
        return `
            <details class="subject-breakdown-item">
                <summary class="subject-header">
                    <h4>${subject}</h4>
                    <div class="subject-summary-stats">
                        <span class="subject-accuracy" style="--accuracy-color: ${accuracy > 60 ? 'var(--success-color)' : accuracy > 30 ? 'var(--warning-color)' : 'var(--danger-color)'}">${accuracy.toFixed(1)}%</span>
                        <span class="material-symbols-outlined expand-icon">expand_more</span>
                    </div>
                </summary>
                <div class="subject-stats-visual">
                    <div class="mini-donut-chart">
                        <svg viewBox="0 0 36 36" class="donut-svg">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--card-border-color)" stroke-width="3"></circle>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--success-color)" stroke-width="3" 
                                stroke-dasharray="${correctPct} ${100 - correctPct}" 
                                stroke-dashoffset="25"></circle>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--danger-color)" stroke-width="3" 
                                stroke-dasharray="${incorrectPct} ${100 - incorrectPct}" 
                                stroke-dashoffset="${25 - correctPct}"></circle>
                        </svg>
                        <div class="donut-center">${stats.correct}/${stats.total}</div>
                    </div>
                    <div class="subject-detail-stats">
                        <div class="stat-row-mini"><span class="dot-success"></span> Correct: ${stats.correct}</div>
                        <div class="stat-row-mini"><span class="dot-danger"></span> Incorrect: ${stats.incorrect}</div>
                        <div class="stat-row-mini"><span class="dot-muted"></span> Unanswered: ${stats.unanswered}</div>
                        <div class="stat-row-mini"><span class="material-symbols-outlined" style="font-size: 0.8rem;">schedule</span> Avg: ${avgTime.toFixed(1)}s</div>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${accuracy}%; background-color: ${accuracy > 60 ? 'var(--success-color)' : accuracy > 30 ? 'var(--warning-color)' : 'var(--danger-color)'};"></div>
                </div>
                <div class="topic-breakdown">
                    ${Object.entries(stats.topics).map(([topic, topicStats]) => {
                        const topicAccuracy = topicStats.total > 0 ? (topicStats.correct / topicStats.total) * 100 : 0;
                        return `
                            <div class="topic-breakdown-item">
                                <span>${topic}</span>
                                <span class="topic-stats">${topicStats.correct}/${topicStats.total} (${topicAccuracy.toFixed(0)}%)</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </details>
        `;
    }).join('');
}

// Topic-wise analysis with graph
function renderTopicWiseAnalysis(attempt: TestAttempt) {
    const topicWiseContainer = document.getElementById('topic-wise-view');
    if (!topicWiseContainer) return;
    
    const topicStats: { [key: string]: { correct: number, total: number, subject: string, avgTime: number, totalTime: number } } = {};
    
    attempt.fullTest.questions.forEach((q, i) => {
        const topic = q.topic || 'General';
        const subject = q.subject || 'Uncategorized';
        
        if (!topicStats[topic]) {
            topicStats[topic] = { correct: 0, total: 0, subject, avgTime: 0, totalTime: 0 };
        }
        
        topicStats[topic].total++;
        topicStats[topic].totalTime += attempt.timePerQuestion[i] || 0;
        
        if (attempt.userAnswers[i] === q.answer) {
            topicStats[topic].correct++;
        }
    });
    
    // Calculate average time
    Object.values(topicStats).forEach(stat => {
        stat.avgTime = stat.total > 0 ? stat.totalTime / stat.total : 0;
    });
    
    // Calculate overall average time for comparison
    const totalTime = Object.values(topicStats).reduce((sum, stat) => sum + stat.totalTime, 0);
    const totalQuestions = Object.values(topicStats).reduce((sum, stat) => sum + stat.total, 0);
    const avgTime = totalQuestions > 0 ? totalTime / totalQuestions : 0;
    
    // Sort by accuracy
    const sortedTopics = Object.entries(topicStats)
        .map(([topic, stats]) => ({
            topic,
            ...stats,
            accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0
        }))
        .sort((a, b) => b.accuracy - a.accuracy);
    
    // Find strongest and weakest topics
    const strongTopics = sortedTopics.filter(t => t.accuracy >= 70).slice(0, 3);
    const weakTopics = sortedTopics.filter(t => t.accuracy < 50).slice(-3).reverse();
    
    topicWiseContainer.innerHTML = `
        <div class="topic-insights-grid enhanced">
            <div class="insight-card strength">
                <div class="insight-card-header">
                    <span class="material-symbols-outlined">trending_up</span>
                    <h4>Strong Topics</h4>
                </div>
                ${strongTopics.length > 0 ? strongTopics.map((t, idx) => `
                    <div class="insight-item">
                        <div class="insight-rank">#${idx + 1}</div>
                        <div class="insight-content">
                            <div class="topic-name">${t.topic}</div>
                            <div class="topic-meta">
                                <span>${t.subject}</span> • 
                                <span>${t.correct}/${t.total} correct</span> • 
                                <span>${t.avgTime.toFixed(1)}s avg</span>
                            </div>
                        </div>
                        <div class="topic-score success">${t.accuracy.toFixed(0)}%</div>
                    </div>
                `).join('') : '<p class="no-data">Complete more questions to identify strong topics</p>'}
            </div>
            <div class="insight-card weakness">
                <div class="insight-card-header">
                    <span class="material-symbols-outlined">trending_down</span>
                    <h4>Need Improvement</h4>
                </div>
                ${weakTopics.length > 0 ? weakTopics.map((t, idx) => `
                    <div class="insight-item">
                        <div class="insight-rank warn">#${weakTopics.length - idx}</div>
                        <div class="insight-content">
                            <div class="topic-name">${t.topic}</div>
                            <div class="topic-meta">
                                <span>${t.subject}</span> • 
                                <span>${t.correct}/${t.total} correct</span> • 
                                <span>${t.avgTime.toFixed(1)}s avg</span>
                            </div>
                        </div>
                        <div class="topic-score danger">${t.accuracy.toFixed(0)}%</div>
                    </div>
                `).join('') : '<p class="no-data">Great! No weak topics found</p>'}
            </div>
        </div>
        
        <div class="chart-section">
            <h4><span class="material-symbols-outlined">topic</span> All Topics Performance</h4>
            <div class="topic-chart-container enhanced">
                ${sortedTopics.map(t => {
                    const barColor = t.accuracy >= 70 ? 'var(--success-color)' : t.accuracy >= 50 ? 'var(--warning-color)' : 'var(--danger-color)';
                    const timeClass = t.avgTime > avgTime * 1.2 ? 'slow' : t.avgTime < avgTime * 0.8 ? 'fast' : 'normal';
                    return `
                        <div class="topic-chart-row enhanced">
                            <div class="topic-chart-label">
                                <div class="topic-name">${t.topic}</div>
                                <div class="topic-subject">${t.subject} • ${t.total} Q's • ${t.avgTime.toFixed(1)}s avg</div>
                            </div>
                            <div class="topic-chart-bar-container">
                                <div class="topic-chart-bar" style="width: ${t.accuracy}%; background: ${barColor}">
                                    <span class="topic-chart-bar-label">${t.accuracy.toFixed(0)}%</span>
                                </div>
                            </div>
                            <div class="topic-chart-stats">
                                <div class="topic-stat-value">${t.correct}/${t.total}</div>
                                <div class="topic-stat-label">Correct</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Bias Analysis - Detect if user tends to mark same options repeatedly
function renderBiasAnalysis(attempt: TestAttempt) {
    const biasContainer = document.getElementById('bias-analysis-view');
    if (!biasContainer) return;
    
    // Count option selections
    const optionCounts = [0, 0, 0, 0]; // A, B, C, D
    const correctOptionCounts = [0, 0, 0, 0];
    let consecutiveSame = 0;
    let maxConsecutive = 0;
    let prevAnswer: number | null = null;
    let totalAnswered = 0;
    
    // Track pattern of answers
    const answerPattern: string[] = [];
    
    attempt.userAnswers.forEach((answer, i) => {
        if (answer !== null) {
            optionCounts[answer]++;
            totalAnswered++;
            answerPattern.push(String.fromCharCode(65 + answer));
            
            // Track consecutive same answers
            if (answer === prevAnswer) {
                consecutiveSame++;
                maxConsecutive = Math.max(maxConsecutive, consecutiveSame);
            } else {
                consecutiveSame = 1;
            }
            prevAnswer = answer;
        }
        
        // Track correct answer distribution
        const correctAns = attempt.fullTest.questions[i].answer;
        correctOptionCounts[correctAns]++;
    });
    
    // Calculate bias metrics
    const expectedPct = 25; // Expected if random
    const optionPcts = optionCounts.map(c => totalAnswered > 0 ? (c / totalAnswered) * 100 : 0);
    const correctPcts = correctOptionCounts.map(c => (c / attempt.totalQuestions) * 100);
    
    // Detect bias - if any option is selected significantly more than 30%
    const biasedOptions = optionPcts
        .map((pct, i) => ({ option: String.fromCharCode(65 + i), pct, count: optionCounts[i] }))
        .filter(o => o.pct > 35);
    
    const hasBias = biasedOptions.length > 0;
    const avoidedOptions = optionPcts
        .map((pct, i) => ({ option: String.fromCharCode(65 + i), pct, count: optionCounts[i] }))
        .filter(o => o.pct < 15 && totalAnswered > 10);
    
    // Calculate change rate (how often user changes option type)
    let changeCount = 0;
    for (let i = 1; i < attempt.userAnswers.length; i++) {
        if (attempt.userAnswers[i] !== null && attempt.userAnswers[i-1] !== null && 
            attempt.userAnswers[i] !== attempt.userAnswers[i-1]) {
            changeCount++;
        }
    }
    const changeRate = totalAnswered > 1 ? (changeCount / (totalAnswered - 1)) * 100 : 0;
    
    // Generate bias report
    let biasReport = '';
    let biasLevel = 'low';
    let biasColor = 'var(--success-color)';
    
    if (hasBias) {
        biasLevel = biasedOptions[0].pct > 45 ? 'high' : 'moderate';
        biasColor = biasLevel === 'high' ? 'var(--danger-color)' : 'var(--warning-color)';
        biasReport = `You tend to select option <strong>${biasedOptions[0].option}</strong> more frequently (${biasedOptions[0].pct.toFixed(1)}% of answers).`;
    } else {
        biasReport = 'Your answer distribution is well-balanced across all options.';
    }
    
    if (maxConsecutive >= 4) {
        biasReport += ` You selected the same option <strong>${maxConsecutive} times in a row</strong>, which might indicate guessing.`;
    }
    
    biasContainer.innerHTML = `
        <div class="bias-summary-card" style="border-left-color: ${biasColor}">
            <div class="bias-header">
                <span class="material-symbols-outlined">${hasBias ? 'psychology_alt' : 'verified'}</span>
                <h4>Answer Bias: <span style="color: ${biasColor}">${biasLevel.charAt(0).toUpperCase() + biasLevel.slice(1)}</span></h4>
            </div>
            <p class="bias-description">${biasReport}</p>
        </div>
        
        <div class="bias-charts-grid">
            <div class="bias-chart-card">
                <h5>Your Answer Distribution</h5>
                <div class="option-distribution">
                    ${['A', 'B', 'C', 'D'].map((opt, i) => `
                        <div class="option-dist-item">
                            <div class="option-label-box ${optionPcts[i] > 35 ? 'biased' : ''}">${opt}</div>
                            <div class="option-bar-container">
                                <div class="option-bar user-bar" style="width: ${optionPcts[i]}%; background: ${optionPcts[i] > 35 ? 'var(--warning-color)' : 'var(--primary-color)'}"></div>
                            </div>
                            <span class="option-pct">${optionPcts[i].toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="bias-chart-card">
                <h5>Correct Answer Distribution</h5>
                <div class="option-distribution">
                    ${['A', 'B', 'C', 'D'].map((opt, i) => `
                        <div class="option-dist-item">
                            <div class="option-label-box correct-dist">${opt}</div>
                            <div class="option-bar-container">
                                <div class="option-bar correct-bar" style="width: ${correctPcts[i]}%; background: var(--success-color)"></div>
                            </div>
                            <span class="option-pct">${correctPcts[i].toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <div class="bias-stats-row">
            <div class="bias-stat">
                <span class="bias-stat-value">${changeRate.toFixed(0)}%</span>
                <span class="bias-stat-label">Answer Variety</span>
            </div>
            <div class="bias-stat">
                <span class="bias-stat-value">${maxConsecutive}</span>
                <span class="bias-stat-label">Max Consecutive Same</span>
            </div>
            <div class="bias-stat">
                <span class="bias-stat-value">${avoidedOptions.length > 0 ? avoidedOptions.map(o => o.option).join(', ') : 'None'}</span>
                <span class="bias-stat-label">Avoided Options</span>
            </div>
        </div>
        
        <div class="bias-tip">
            <span class="material-symbols-outlined">lightbulb</span>
            <p><strong>Pro Tip:</strong> In competitive exams, correct answers are usually evenly distributed. If you find yourself always avoiding an option, reconsider those questions!</p>
        </div>
    `;
}

// Difficulty Analysis
function renderDifficultyAnalysis(attempt: TestAttempt) {
    const difficultyContainer = document.getElementById('difficulty-analysis-view');
    if (!difficultyContainer) return;
    
    // Categorize questions by time taken (as proxy for difficulty)
    const avgTime = attempt.timePerQuestion.reduce((a, b) => a + b, 0) / attempt.timePerQuestion.length;
    
    const quickQuestions: { idx: number, time: number, correct: boolean }[] = [];
    const normalQuestions: { idx: number, time: number, correct: boolean }[] = [];
    const slowQuestions: { idx: number, time: number, correct: boolean }[] = [];
    
    attempt.timePerQuestion.forEach((time, i) => {
        const correct = attempt.userAnswers[i] === attempt.fullTest.questions[i].answer;
        const item = { idx: i, time, correct };
        
        if (time < avgTime * 0.6) {
            quickQuestions.push(item);
        } else if (time > avgTime * 1.5) {
            slowQuestions.push(item);
        } else {
            normalQuestions.push(item);
        }
    });
    
    const quickAccuracy = quickQuestions.length > 0 ? (quickQuestions.filter(q => q.correct).length / quickQuestions.length) * 100 : 0;
    const normalAccuracy = normalQuestions.length > 0 ? (normalQuestions.filter(q => q.correct).length / normalQuestions.length) * 100 : 0;
    const slowAccuracy = slowQuestions.length > 0 ? (slowQuestions.filter(q => q.correct).length / slowQuestions.length) * 100 : 0;
    
    // Determine if more time = better accuracy
    const timeVsAccuracyTrend = slowAccuracy > quickAccuracy ? 'positive' : slowAccuracy < quickAccuracy ? 'negative' : 'neutral';
    
    difficultyContainer.innerHTML = `
        <div class="difficulty-overview">
            <h4><span class="material-symbols-outlined">analytics</span> Time vs Accuracy Analysis</h4>
            <p class="analysis-description">Understanding how time spent correlates with your accuracy</p>
        </div>
        
        <div class="difficulty-grid">
            <div class="difficulty-card quick">
                <div class="difficulty-header">
                    <span class="material-symbols-outlined">bolt</span>
                    <h5>Quick Answers</h5>
                </div>
                <div class="difficulty-stats">
                    <div class="big-stat">${quickQuestions.length}</div>
                    <div class="stat-detail">Questions < ${(avgTime * 0.6).toFixed(0)}s</div>
                </div>
                <div class="difficulty-accuracy">
                    <div class="accuracy-bar" style="--accuracy: ${quickAccuracy}%">
                        <div class="accuracy-fill" style="background: ${quickAccuracy >= 60 ? 'var(--success-color)' : 'var(--danger-color)'}"></div>
                    </div>
                    <span>${quickAccuracy.toFixed(0)}% accurate</span>
                </div>
            </div>
            
            <div class="difficulty-card normal">
                <div class="difficulty-header">
                    <span class="material-symbols-outlined">timer</span>
                    <h5>Normal Pace</h5>
                </div>
                <div class="difficulty-stats">
                    <div class="big-stat">${normalQuestions.length}</div>
                    <div class="stat-detail">Average time questions</div>
                </div>
                <div class="difficulty-accuracy">
                    <div class="accuracy-bar" style="--accuracy: ${normalAccuracy}%">
                        <div class="accuracy-fill" style="background: ${normalAccuracy >= 60 ? 'var(--success-color)' : 'var(--warning-color)'}"></div>
                    </div>
                    <span>${normalAccuracy.toFixed(0)}% accurate</span>
                </div>
            </div>
            
            <div class="difficulty-card slow">
                <div class="difficulty-header">
                    <span class="material-symbols-outlined">hourglass_top</span>
                    <h5>Time-Consuming</h5>
                </div>
                <div class="difficulty-stats">
                    <div class="big-stat">${slowQuestions.length}</div>
                    <div class="stat-detail">Questions > ${(avgTime * 1.5).toFixed(0)}s</div>
                </div>
                <div class="difficulty-accuracy">
                    <div class="accuracy-bar" style="--accuracy: ${slowAccuracy}%">
                        <div class="accuracy-fill" style="background: ${slowAccuracy >= 60 ? 'var(--success-color)' : 'var(--danger-color)'}"></div>
                    </div>
                    <span>${slowAccuracy.toFixed(0)}% accurate</span>
                </div>
            </div>
        </div>
        
        <div class="insight-box ${timeVsAccuracyTrend}">
            <span class="material-symbols-outlined">${timeVsAccuracyTrend === 'positive' ? 'trending_up' : timeVsAccuracyTrend === 'negative' ? 'trending_down' : 'trending_flat'}</span>
            <div class="insight-content">
                <h5>${timeVsAccuracyTrend === 'positive' ? 'Taking Time Helps!' : timeVsAccuracyTrend === 'negative' ? 'Quick Instincts Work!' : 'Balanced Performance'}</h5>
                <p>${timeVsAccuracyTrend === 'positive' 
                    ? 'You perform better when you take more time to think. Consider slowing down on difficult questions.' 
                    : timeVsAccuracyTrend === 'negative' 
                    ? 'Your quick answers are more accurate! Trust your first instinct and avoid overthinking.' 
                    : 'Your accuracy is consistent regardless of time spent. Great balanced approach!'}</p>
            </div>
        </div>
    `;
}

function createQuestionReviewHTML(q: Question, index: number, attempt: TestAttempt): string {
    const userAnswer = attempt.userAnswers[index];
    let userStatus = 'Unanswered';
    let statusClass = 'unanswered';
    let isIncorrect = false;

    if (userAnswer === q.answer) {
        userStatus = 'Correct';
        statusClass = 'correct';
    } else if (userAnswer !== null) {
        userStatus = 'Incorrect';
        statusClass = 'incorrect';
        isIncorrect = true;
    }

    const optionsHTML = q.options.map((opt, optIndex) => {
        let li_class = 'detail-option-item';
        if (optIndex === q.answer) li_class += ' correct';
        if (optIndex === userAnswer && isIncorrect) li_class += ' user-incorrect';
        return `<li class="${li_class}">${opt}</li>`;
    }).join('');

    const analysisButtonHTML = isIncorrect ? `
        <button class="deeper-analysis-btn" data-question-index="${index}">
            <span class="material-symbols-outlined">psychology</span> Get Deeper AI Analysis
        </button>
    ` : '';

    return `
        <details class="results-detail-item status-${statusClass}">
            <summary class="question-summary-header">
                <div class="summary-left">
                    <span class="q-number">Q${index + 1}</span>
                    <span class="status-dot ${statusClass}"></span>
                    <span class="q-preview">${q.question}</span>
                </div>
                <div class="summary-right">
                    <span class="summary-meta">${q.subject}</span>
                    <span class="material-symbols-outlined expand-icon">expand_more</span>
                </div>
            </summary>
            <div class="question-content-body">
                <div class="question-header-full">
                     <span class="status-badge ${statusClass}">${userStatus}</span>
                     <span class="question-meta-full">${q.subject} > ${q.topic}</span>
                     <span class="time-spent-badge">Time: ${attempt.timePerQuestion[index].toFixed(1)}s</span>
                </div>
                <p class="question-text-full">${q.question}</p>
                <ul class="detail-options">${optionsHTML}</ul>
                <div class="explanation-box">
                    <h4>Explanation</h4>
                    <p>${q.explanation}</p>
                </div>
                <div class="deeper-analysis-controls">${analysisButtonHTML}</div>
                <div class="deeper-analysis-container hidden" data-analysis-for="${index}"></div>
            </div>
        </details>
    `;
}

function renderMistakesReview(attempt: TestAttempt) {
    const mistakesHTML = attempt.fullTest.questions
        .map((q, index) => {
            const userAnswer = attempt.userAnswers[index];
            const isMistake = userAnswer !== null && userAnswer !== q.answer;
            return isMistake ? createQuestionReviewHTML(q, index, attempt) : '';
        })
        .join('');

    if (!mistakesHTML) {
        mistakesReviewContainer.innerHTML = `<p class="placeholder">No incorrect answers to review. Great job!</p>`;
        return;
    }

    mistakesReviewContainer.innerHTML = mistakesHTML;
}

function renderAllQuestionsReview(attempt: TestAttempt) {
    allQuestionsReviewContainer.innerHTML = attempt.fullTest.questions
        .map((q, index) => createQuestionReviewHTML(q, index, attempt))
        .join('');
}


async function handleDeeperAnalysis(button: HTMLElement) {
    if (!ai || !currentAttemptForReport) return;

    const questionIndex = parseInt(button.dataset.questionIndex, 10);
    const question = currentAttemptForReport.fullTest.questions[questionIndex];
    const userAnswerIndex = currentAttemptForReport.userAnswers[questionIndex];

    if (userAnswerIndex === null) return; // Should not happen if button is only on incorrect answers

    const controlsContainer = button.parentElement;
    const analysisContainer = controlsContainer.nextElementSibling as HTMLElement;

    controlsContainer.innerHTML = `<div class="spinner-small"></div><span>Analyzing...</span>`;

    try {
        const userAnswerText = question.options[userAnswerIndex];
        const correctAnswerText = question.options[question.answer];
        const otherOptions = question.options.filter((_, i) => i !== question.answer && i !== userAnswerIndex);

        const prompt = `
            Analyze the following competitive exam (UPSC-style) question. The user incorrectly chose the option: "${userAnswerText}". The correct answer is: "${correctAnswerText}".
            
            Question: "${question.question}"

            Please provide a detailed analysis in a simple JSON format. The analysis should explain:
            1.  Why the user's selected answer ("${userAnswerText}") is incorrect.
            2.  A brief analysis of why each of the other incorrect options are also wrong.
            
            Do not explain why the correct answer is correct, as the user already has a separate explanation for that. Focus only on the incorrect options.
        `;

        const analysisSchema = {
            type: Type.OBJECT,
            properties: {
                userAnswerAnalysis: { 
                    type: Type.STRING, 
                    description: `A detailed explanation of why the user's choice, '${userAnswerText}', is incorrect.`
                },
                otherOptionsAnalysis: {
                    type: Type.ARRAY,
                    description: "An analysis of the other incorrect options.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            option: { type: Type.STRING, description: "The text of the incorrect option." },
                            reason: { type: Type.STRING, description: "The reason why this option is incorrect." }
                        },
                         required: ["option", "reason"]
                    }
                }
            },
            required: ["userAnswerAnalysis", "otherOptionsAnalysis"]
        };

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: analysisSchema,
            },
        });

        const result = JSON.parse(response.text);

        let analysisHTML = `
            <h4><span class="material-symbols-outlined">neurology</span> AI Deeper Analysis</h4>
            <div class="analysis-section">
                <h5>Analysis of Your Answer ("${userAnswerText}")</h5>
                <p>${result.userAnswerAnalysis}</p>
            </div>
        `;
        
        if (result.otherOptionsAnalysis && result.otherOptionsAnalysis.length > 0) {
             analysisHTML += `
                <div class="analysis-section">
                    <h5>Analysis of Other Options</h5>
                    <ul>
                        ${result.otherOptionsAnalysis.map(opt => `<li><strong>${opt.option}:</strong> ${opt.reason}</li>`).join('')}
                    </ul>
                </div>
             `;
        }

        analysisContainer.innerHTML = analysisHTML;
        analysisContainer.classList.remove('hidden');
        controlsContainer.classList.add('hidden'); // Hide the button/loader

    } catch (error) {
        console.error("Deeper Analysis Error:", error);
        analysisContainer.innerHTML = `<p class="error">Could not generate analysis. Please try again later.</p>`;
        analysisContainer.classList.remove('hidden');
        controlsContainer.innerHTML = ''; // Clear loader
        controlsContainer.appendChild(button); // Restore button
    }
}


// --- Analytics View Logic ---

// Type definitions for Analytics Aggregation
interface SubjectAnalytics {
    correct: number;
    total: number;
    totalTime: number; // in seconds
    topics: { [key: string]: { correct: number; total: number } };
}

// Global variable to store aggregated data for the modal
let aggregatedSubjectData: { [key: string]: SubjectAnalytics } = {};

function renderAnalyticsDashboard() {
    try {
        const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
        
        // Clear any existing trend graph to prevent duplicates
        const existingTrend = document.querySelector('.score-trend-card');
        if (existingTrend) {
            existingTrend.remove();
        }
        
        if (history.length === 0) {
            analyticsStatsGrid.innerHTML = `<p class="placeholder" style="grid-column: 1/-1;">No data available. Complete some tests to see your analytics.</p>`;
            subjectMasteryContainer.innerHTML = '';
            return;
        }

    // Reset Aggregation
    aggregatedSubjectData = {};
    let totalTests = history.length;
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalScoreSum = 0;
    let totalTimeTaken = 0;
    
    // Calculate streak
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    // Sort history by date for streak calculation
    const sortedHistory = [...history].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    
    sortedHistory.forEach((attempt, index) => {
        if (attempt.score >= 50) {
            tempStreak++;
            bestStreak = Math.max(bestStreak, tempStreak);
            if (index === 0 || (index > 0 && sortedHistory[index - 1].score >= 50)) {
                currentStreak = tempStreak;
            }
        } else {
            if (index === 0) currentStreak = 0;
            tempStreak = 0;
        }
    });

    // Calculate improvement trend
    let improvementTrend = 0;
    if (history.length >= 2) {
        const recentScores = sortedHistory.slice(0, Math.min(5, sortedHistory.length)).map(a => a.score);
        const olderScores = sortedHistory.slice(-Math.min(5, sortedHistory.length)).map(a => a.score);
        const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
        improvementTrend = recentAvg - olderAvg;
    }

    history.forEach(attempt => {
        totalQuestions += attempt.totalQuestions;
        totalCorrect += attempt.correctAnswers;
        totalScoreSum += attempt.score;
        totalTimeTaken += attempt.timeTaken;

        // Aggregate Subject and Topic Stats
        attempt.fullTest.questions.forEach((q, i) => {
            const subject = q.subject || 'Uncategorized';
            const topic = q.topic || 'General';
            
            // --- Subject Aggregation ---
            if (!aggregatedSubjectData[subject]) {
                aggregatedSubjectData[subject] = { correct: 0, total: 0, totalTime: 0, topics: {} };
            }
            aggregatedSubjectData[subject].total++;
            aggregatedSubjectData[subject].totalTime += attempt.timePerQuestion[i] || 0;
            
            // --- Topic Aggregation (Nested in Subject) ---
            if (!aggregatedSubjectData[subject].topics[topic]) {
                aggregatedSubjectData[subject].topics[topic] = { correct: 0, total: 0 };
            }
            aggregatedSubjectData[subject].topics[topic].total++;

            if (attempt.userAnswers[i] === q.answer) {
                aggregatedSubjectData[subject].correct++;
                aggregatedSubjectData[subject].topics[topic].correct++;
            }
        });
    });

    const avgScore = totalScoreSum / totalTests;
    const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    const totalTimeHours = Math.floor(totalTimeTaken / 3600);
    const totalTimeMinutes = Math.floor((totalTimeTaken % 3600) / 60);
    
    const trendIcon = improvementTrend > 2 ? 'trending_up' : improvementTrend < -2 ? 'trending_down' : 'trending_flat';
    const trendColor = improvementTrend > 2 ? 'var(--success-color)' : improvementTrend < -2 ? 'var(--danger-color)' : 'var(--text-muted)';

    // Render Stats Grid with Pro Features
    analyticsStatsGrid.innerHTML = `
        <div class="stat-card">
            <span class="material-symbols-outlined stat-icon">history</span>
            <div class="stat-value">${totalTests}</div>
            <div class="stat-label">Tests Taken</div>
        </div>
        <div class="stat-card">
            <span class="material-symbols-outlined stat-icon">percent</span>
            <div class="stat-value">${avgScore.toFixed(1)}%</div>
            <div class="stat-label">Avg. Score</div>
        </div>
        <div class="stat-card">
            <span class="material-symbols-outlined stat-icon">check_circle</span>
            <div class="stat-value">${overallAccuracy.toFixed(1)}%</div>
            <div class="stat-label">Overall Accuracy</div>
        </div>
        <div class="stat-card">
            <span class="material-symbols-outlined stat-icon">timer</span>
            <div class="stat-value">${totalTimeHours}h ${totalTimeMinutes}m</div>
            <div class="stat-label">Study Time</div>
        </div>
        <div class="stat-card streak">
            <span class="material-symbols-outlined stat-icon" style="color: var(--warning-color);">local_fire_department</span>
            <div class="stat-value" style="color: var(--warning-color);">${currentStreak}</div>
            <div class="stat-label">Current Streak</div>
        </div>
        <div class="stat-card best-streak">
            <span class="material-symbols-outlined stat-icon" style="color: var(--accent-emerald);">emoji_events</span>
            <div class="stat-value" style="color: var(--accent-emerald);">${bestStreak}</div>
            <div class="stat-label">Best Streak</div>
        </div>
        <div class="stat-card trend">
            <span class="material-symbols-outlined stat-icon" style="color: ${trendColor};">${trendIcon}</span>
            <div class="stat-value" style="color: ${trendColor};">${improvementTrend > 0 ? '+' : ''}${improvementTrend.toFixed(1)}%</div>
            <div class="stat-label">Trend</div>
        </div>
        <div class="stat-card questions">
            <span class="material-symbols-outlined stat-icon" style="color: var(--info-color);">quiz</span>
            <div class="stat-value" style="color: var(--info-color);">${totalQuestions}</div>
            <div class="stat-label">Questions Done</div>
        </div>
    `;
    
    // Add Score Trend Graph
    renderScoreTrendGraph(sortedHistory);

    // 4. Render Subject Mastery Cards (Interactive)
    const sortedSubjects = Object.entries(aggregatedSubjectData)
        .map(([subject, stats]) => ({
            subject,
            accuracy: (stats.correct / stats.total) * 100,
            count: stats.total,
            stats: stats
        }))
        .sort((a, b) => b.accuracy - a.accuracy);

    subjectMasteryContainer.innerHTML = sortedSubjects.map(s => {
        const accuracyColor = s.accuracy > 60 ? 'var(--success-color)' : s.accuracy > 40 ? 'var(--warning-color)' : 'var(--danger-color)';
        return `
        <div class="subject-analytics-card" data-subject="${s.subject}">
            <div class="subject-card-header">
                <h4>${s.subject}</h4>
                <span class="material-symbols-outlined" style="opacity: 0.5;">chevron_right</span>
            </div>
            <div class="subject-card-stats">
                <div class="stat-row">
                    <span>Accuracy</span>
                    <span style="color: ${accuracyColor}; font-weight: bold;">${s.accuracy.toFixed(1)}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${s.accuracy}%; background-color: ${accuracyColor}"></div>
                </div>
                <div class="stat-mini">
                    <span>${s.count} Questions Attempted</span>
                </div>
            </div>
        </div>
    `}).join('');
    } catch (error) {
        console.error('Error rendering analytics dashboard:', error);
        analyticsStatsGrid.innerHTML = `<p class="placeholder" style="grid-column: 1/-1;">Error loading analytics. Please try again.</p>`;
        subjectMasteryContainer.innerHTML = '';
    }
}

// Score Trend Graph
function renderScoreTrendGraph(sortedHistory: TestAttempt[]) {
    // Remove any existing score trend card to prevent duplication
    const existingTrend = document.querySelector('.score-trend-card');
    if (existingTrend) {
        existingTrend.remove();
    }
    
    const trendContainer = document.createElement('div');
    trendContainer.className = 'report-card score-trend-card';
    trendContainer.id = 'score-trend-graph'; // Add ID for easy identification
    
    // Enhanced score trend with more features
    const recentTests = sortedHistory.slice(0, 10).reverse();
    const avgScore = recentTests.reduce((sum, a) => sum + a.score, 0) / recentTests.length;
    const maxScore = Math.max(...recentTests.map(a => a.score));
    const minScore = Math.min(...recentTests.map(a => a.score));
    const improvement = recentTests.length >= 2 ? recentTests[recentTests.length - 1].score - recentTests[0].score : 0;
    
    trendContainer.innerHTML = `
        <div class="score-trend-header">
            <h3><span class="material-symbols-outlined">show_chart</span> Score Trend Analysis</h3>
            <div class="trend-stats-mini">
                <div class="trend-stat"><span>Avg:</span> <strong>${avgScore.toFixed(1)}%</strong></div>
                <div class="trend-stat"><span>Peak:</span> <strong style="color: var(--success-color);">${maxScore.toFixed(1)}%</strong></div>
                <div class="trend-stat"><span>Low:</span> <strong style="color: var(--danger-color);">${minScore.toFixed(1)}%</strong></div>
                <div class="trend-stat">
                    <span>Trend:</span> 
                    <strong style="color: ${improvement >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                        ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%
                    </strong>
                </div>
            </div>
        </div>
        <div class="score-trend-graph enhanced">
            ${recentTests.map((attempt, i) => {
                const height = Math.max(attempt.score, 5);
                const barColor = attempt.score >= 70 ? 'var(--success-color)' : attempt.score >= 50 ? 'var(--info-color)' : attempt.score >= 40 ? 'var(--warning-color)' : 'var(--danger-color)';
                const date = new Date(attempt.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                return `
                    <div class="trend-bar-container" title="${attempt.testName}: ${attempt.score.toFixed(1)}%">
                        <div class="trend-bar" style="height: ${height}%; background: ${barColor}">
                            <span class="trend-bar-value">${attempt.score.toFixed(0)}%</span>
                        </div>
                        <span class="trend-label">${date}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="trend-insights">
            <p><strong>Last ${Math.min(sortedHistory.length, 10)} tests performance</strong></p>
            ${improvement > 5 ? '<p class="insight-positive">📈 Great improvement! Your scores are trending upward.</p>' : 
              improvement < -5 ? '<p class="insight-negative">📉 Scores declining. Review weak areas and practice more.</p>' : 
              '<p class="insight-neutral">➡️ Scores are stable. Focus on consistency and weak topics.</p>'}
        </div>
    `;
    
    // Insert after stats grid
    analyticsStatsGrid.parentNode?.insertBefore(trendContainer, analyticsStatsGrid.nextSibling);
}

// Add Event delegation for Subject Cards
subjectMasteryContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.subject-analytics-card') as HTMLElement;
    if (card) {
        const subject = card.dataset.subject;
        openSubjectModal(subject);
    }
});

function openSubjectModal(subject: string) {
    const data = aggregatedSubjectData[subject];
    if (!data) {
        showToast({ message: 'Subject data not available.', type: 'warning' });
        return;
    }

    modalSubjectTitle.textContent = `${subject} Analysis`;
    const accuracy = (data.correct / data.total) * 100;
    const avgTime = data.total > 0 ? (data.totalTime / data.total) : 0;
    const accuracyColor = accuracy > 60 ? 'var(--success-color)' : accuracy > 40 ? 'var(--warning-color)' : 'var(--danger-color)';

    // Sort topics by accuracy
    const sortedTopics = Object.entries(data.topics)
        .map(([topic, stats]) => ({
            topic,
            accuracy: (stats.correct / stats.total) * 100,
            correct: stats.correct,
            total: stats.total
        }))
        .sort((a, b) => b.accuracy - a.accuracy);

    modalBody.innerHTML = `
        <div class="modal-summary-grid">
            <div class="modal-stat-box">
                <span class="label">Overall Accuracy</span>
                <span class="value" style="color: ${accuracyColor}">${accuracy.toFixed(1)}%</span>
            </div>
            <div class="modal-stat-box">
                <span class="label">Total Questions</span>
                <span class="value">${data.total}</span>
            </div>
            <div class="modal-stat-box">
                <span class="label">Avg Time/Question</span>
                <span class="value">${avgTime.toFixed(1)}s</span>
            </div>
        </div>

        <h4 style="margin-top: 1.5rem; border-bottom: 1px solid var(--card-border-color); padding-bottom: 0.5rem;">Topic Performance</h4>
        <div class="topic-grid-container">
            ${sortedTopics.map(t => {
                const topicColor = t.accuracy > 60 ? 'var(--success-color)' : t.accuracy > 40 ? 'var(--warning-color)' : 'var(--danger-color)';
                return `
                <div class="topic-stat-card">
                    <div class="topic-header">
                        <span class="topic-name">${t.topic}</span>
                        <span class="topic-score" style="color: ${topicColor}">${t.accuracy.toFixed(0)}%</span>
                    </div>
                    <div class="progress-bar small">
                        <div class="progress-bar-fill" style="width: ${t.accuracy}%; background-color: ${topicColor}"></div>
                    </div>
                    <div class="topic-details">
                        ${t.correct}/${t.total} Correct
                    </div>
                </div>
            `}).join('')}
        </div>
    `;

    analyticsModal.classList.remove('hidden');
}