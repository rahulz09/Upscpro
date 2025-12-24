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
        showToast(result.message, 'error');
    }
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = registerNameInput.value.trim();
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value;
    const confirm = registerConfirmInput.value;
    
    if (password !== confirm) {
        showToast('Passwords do not match!', 'error');
        return;
    }
    
    const result = registerUser(name, username, password);
    
    if (result.success) {
        showToast(result.message, 'success');
        // Auto-login after registration
        const authResult = authenticateUser(username, password);
        if (authResult.success && authResult.user) {
            loginUser(authResult.user, false);
        } else {
            showLoginForm();
        }
    } else {
        showToast(result.message, 'error');
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
try {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} catch (e) {
    console.error("Failed to initialize GoogleGenAI", e);
    // AI initialization failed - Bulk Import still works without AI
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
        console.error(`Error writing to localStorage key "${key}":`, error);
    }
}

// --- Backend Sync Configuration & Functions ---
interface BackendConfig {
    url: string;
    apiKey: string;
    autoSync: boolean;
    syncResults: boolean;
    syncTests: boolean;
    connected: boolean;
    lastSync: string | null;
}

const defaultBackendConfig: BackendConfig = {
    url: '',
    apiKey: '',
    autoSync: true,
    syncResults: true,
    syncTests: true,
    connected: false,
    lastSync: null
};

function getBackendConfig(): BackendConfig {
    try {
        const config = localStorage.getItem('backendConfig');
        return config ? { ...defaultBackendConfig, ...JSON.parse(config) } : defaultBackendConfig;
    } catch {
        return defaultBackendConfig;
    }
}

function saveBackendConfig(config: BackendConfig): void {
    localStorage.setItem('backendConfig', JSON.stringify(config));
    updateSyncStatusUI(config);
}

function updateSyncStatusUI(config: BackendConfig): void {
    const syncStatus = document.getElementById('sync-status');
    const backendStatus = document.getElementById('backend-status');
    
    if (syncStatus) {
        if (config.connected && config.url) {
            syncStatus.textContent = 'Synced';
            syncStatus.classList.add('connected');
        } else {
            syncStatus.textContent = 'Local';
            syncStatus.classList.remove('connected');
        }
    }
    
    if (backendStatus) {
        const dot = backendStatus.querySelector('.status-dot');
        const text = backendStatus.querySelector('.status-text');
        if (config.connected && config.url) {
            dot?.classList.remove('disconnected', 'error', 'connecting');
            dot?.classList.add('connected');
            if (text) text.textContent = `Connected to ${new URL(config.url).hostname}`;
        } else {
            dot?.classList.remove('connected', 'error', 'connecting');
            dot?.classList.add('disconnected');
            if (text) text.textContent = 'Not Connected';
        }
    }
}

async function testBackendConnection(url: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const response = await fetch(`${url}/api/health`, {
            method: 'GET',
            headers,
            mode: 'cors'
        });
        
        if (response.ok) {
            const data = await response.json();
            return { success: true, message: `Connected! Server status: ${data.status || 'OK'}` };
        } else {
            return { success: false, message: `Server responded with status: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Connection failed: ${(error as Error).message}` };
    }
}

async function syncToBackend(): Promise<{ success: boolean; message: string }> {
    const config = getBackendConfig();
    if (!config.url || !config.connected) {
        return { success: false, message: 'Backend not configured' };
    }
    
    const syncBtn = document.getElementById('sync-btn');
    syncBtn?.classList.add('syncing');
    
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        
        const results: string[] = [];
        
        // Sync tests
        if (config.syncTests) {
            const tests = getFromStorage<Test[]>('tests', []);
            const testsResponse = await fetch(`${config.url}/api/tests`, {
                method: 'POST',
                headers,
                body: JSON.stringify(tests),
                mode: 'cors'
            });
            if (testsResponse.ok) {
                results.push('Tests synced');
            } else {
                results.push('Failed to sync tests');
            }
        }
        
        // Sync history/results
        if (config.syncResults) {
            const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
            const historyResponse = await fetch(`${config.url}/api/history`, {
                method: 'POST',
                headers,
                body: JSON.stringify(history),
                mode: 'cors'
            });
            if (historyResponse.ok) {
                results.push('Results synced');
            } else {
                results.push('Failed to sync results');
            }
        }
        
        config.lastSync = new Date().toISOString();
        saveBackendConfig(config);
        
        return { success: true, message: results.join(', ') };
    } catch (error) {
        return { success: false, message: `Sync failed: ${(error as Error).message}` };
    } finally {
        syncBtn?.classList.remove('syncing');
    }
}

async function syncFromBackend(): Promise<{ success: boolean; message: string }> {
    const config = getBackendConfig();
    if (!config.url || !config.connected) {
        return { success: false, message: 'Backend not configured' };
    }
    
    try {
        const headers: Record<string, string> = {};
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        
        // Fetch tests from backend
        if (config.syncTests) {
            const testsResponse = await fetch(`${config.url}/api/tests`, {
                method: 'GET',
                headers,
                mode: 'cors'
            });
            if (testsResponse.ok) {
                const remoteTests = await testsResponse.json();
                if (Array.isArray(remoteTests) && remoteTests.length > 0) {
                    const localTests = getFromStorage<Test[]>('tests', []);
                    const merged = [...remoteTests, ...localTests];
                    const unique = Array.from(new Map(merged.map(t => [t.id, t])).values());
                    saveToStorage('tests', unique);
                }
            }
        }
        
        // Fetch history from backend
        if (config.syncResults) {
            const historyResponse = await fetch(`${config.url}/api/history`, {
                method: 'GET',
                headers,
                mode: 'cors'
            });
            if (historyResponse.ok) {
                const remoteHistory = await historyResponse.json();
                if (Array.isArray(remoteHistory) && remoteHistory.length > 0) {
                    const localHistory = getFromStorage<TestAttempt[]>('performanceHistory', []);
                    const merged = [...remoteHistory, ...localHistory];
                    saveToStorage('performanceHistory', merged);
                }
            }
        }
        
        return { success: true, message: 'Data pulled from server' };
    } catch (error) {
        return { success: false, message: `Pull failed: ${(error as Error).message}` };
    }
}

// Auto-sync after test completion (called from submit logic)
async function autoSyncAfterTest(): Promise<void> {
    const config = getBackendConfig();
    if (config.connected && config.autoSync) {
        await syncToBackend();
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

                    showToast("Data restored successfully!", 'success');
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

                    showToast(`Test "${data.name}" imported successfully!`, 'success');
                    if (!allTestsView.classList.contains('hidden')) renderAllTests();
                }
            } 
            else {
                throw new Error("Invalid file format. Please upload a valid Backup JSON or a single Test JSON.");
            }

        } catch (error) {
            console.error("Error restoring data:", error);
            showToast(`Failed to restore data. ${error.message}`, 'error');
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

// --- Settings Modal & Backend Sync Event Listeners ---
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const syncBtn = document.getElementById('sync-btn');
const backendUrlInput = document.getElementById('backend-url') as HTMLInputElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const testConnectionBtn = document.getElementById('test-connection-btn');
const connectBackendBtn = document.getElementById('connect-backend-btn');
const connectionResult = document.getElementById('connection-result');
const autoSyncCheckbox = document.getElementById('auto-sync') as HTMLInputElement;
const syncResultsCheckbox = document.getElementById('sync-results') as HTMLInputElement;
const syncTestsCheckbox = document.getElementById('sync-tests') as HTMLInputElement;
const manualSyncBtn = document.getElementById('manual-sync-btn');
const exportDataBtn = document.getElementById('export-data-btn');
const importDataBtn = document.getElementById('import-data-btn');

// Open settings modal
settingsBtn?.addEventListener('click', () => {
    loadSettingsToModal();
    settingsModal?.classList.remove('hidden');
});

// Close settings modal
closeSettingsBtn?.addEventListener('click', () => {
    settingsModal?.classList.add('hidden');
});

// Close settings modal when clicking outside
settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
    }
});

// Load settings into modal inputs
function loadSettingsToModal(): void {
    const config = getBackendConfig();
    if (backendUrlInput) backendUrlInput.value = config.url;
    if (apiKeyInput) apiKeyInput.value = config.apiKey;
    if (autoSyncCheckbox) autoSyncCheckbox.checked = config.autoSync;
    if (syncResultsCheckbox) syncResultsCheckbox.checked = config.syncResults;
    if (syncTestsCheckbox) syncTestsCheckbox.checked = config.syncTests;
    updateSyncStatusUI(config);
}

// Test connection button
testConnectionBtn?.addEventListener('click', async () => {
    const url = backendUrlInput?.value.trim().replace(/\/+$/, ''); // Remove trailing slashes
    const apiKey = apiKeyInput?.value.trim();
    
    if (!url) {
        showConnectionResult('Please enter a backend URL', false);
        return;
    }
    
    testConnectionBtn.textContent = 'Testing...';
    (testConnectionBtn as HTMLButtonElement).disabled = true;
    
    const result = await testBackendConnection(url, apiKey);
    showConnectionResult(result.message, result.success);
    
    testConnectionBtn.innerHTML = '<span class="material-symbols-outlined">wifi_tethering</span> Test Connection';
    (testConnectionBtn as HTMLButtonElement).disabled = false;
});

// Connect & Sync button
connectBackendBtn?.addEventListener('click', async () => {
    const url = backendUrlInput?.value.trim().replace(/\/+$/, '');
    const apiKey = apiKeyInput?.value.trim();
    
    if (!url) {
        showConnectionResult('Please enter a backend URL', false);
        return;
    }
    
    connectBackendBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Connecting...';
    (connectBackendBtn as HTMLButtonElement).disabled = true;
    
    // Test connection first
    const testResult = await testBackendConnection(url, apiKey);
    
    if (testResult.success) {
        // Save configuration
        const config: BackendConfig = {
            url,
            apiKey,
            autoSync: autoSyncCheckbox?.checked ?? true,
            syncResults: syncResultsCheckbox?.checked ?? true,
            syncTests: syncTestsCheckbox?.checked ?? true,
            connected: true,
            lastSync: null
        };
        saveBackendConfig(config);
        
        // Sync data
        const syncResult = await syncToBackend();
        
        if (syncResult.success) {
            showConnectionResult(`Connected and synced! ${syncResult.message}`, true);
            showToast('Backend connected successfully!', 'success');
        } else {
            showConnectionResult(`Connected but sync failed: ${syncResult.message}`, false);
        }
    } else {
        showConnectionResult(testResult.message, false);
    }
    
    connectBackendBtn.innerHTML = '<span class="material-symbols-outlined">cloud_done</span> Connect & Sync';
    (connectBackendBtn as HTMLButtonElement).disabled = false;
});

// Show connection result
function showConnectionResult(message: string, success: boolean): void {
    if (connectionResult) {
        connectionResult.textContent = message;
        connectionResult.classList.remove('hidden', 'success', 'error');
        connectionResult.classList.add(success ? 'success' : 'error');
    }
}

// Save sync options when changed
autoSyncCheckbox?.addEventListener('change', updateSyncOptions);
syncResultsCheckbox?.addEventListener('change', updateSyncOptions);
syncTestsCheckbox?.addEventListener('change', updateSyncOptions);

function updateSyncOptions(): void {
    const config = getBackendConfig();
    config.autoSync = autoSyncCheckbox?.checked ?? true;
    config.syncResults = syncResultsCheckbox?.checked ?? true;
    config.syncTests = syncTestsCheckbox?.checked ?? true;
    saveBackendConfig(config);
}

// Manual sync button
manualSyncBtn?.addEventListener('click', async () => {
    const config = getBackendConfig();
    if (!config.connected) {
        showToast('Please connect to a backend first', 'error');
        return;
    }
    
    manualSyncBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Syncing...';
    (manualSyncBtn as HTMLButtonElement).disabled = true;
    
    // Pull from backend first, then push
    await syncFromBackend();
    const result = await syncToBackend();
    
    if (result.success) {
        showToast('Sync completed successfully!', 'success');
    } else {
        showToast(`Sync failed: ${result.message}`, 'error');
    }
    
    manualSyncBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Manual Sync Now';
    (manualSyncBtn as HTMLButtonElement).disabled = false;
    
    // Refresh current view if needed
    if (!allTestsView.classList.contains('hidden')) renderAllTests();
    if (!performanceView.classList.contains('hidden')) renderPerformanceHistory();
});

// Export data button
exportDataBtn?.addEventListener('click', () => {
    const tests = getFromStorage<Test[]>('tests', []);
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    const config = getBackendConfig();
    
    const exportData = {
        tests,
        performanceHistory: history,
        exportedAt: new Date().toISOString(),
        version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upsc_test_generator_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully!', 'success');
});

// Import data button (triggers file input)
importDataBtn?.addEventListener('click', () => {
    restoreFileInput.click();
});

// Sync button in header
syncBtn?.addEventListener('click', async () => {
    const config = getBackendConfig();
    
    if (!config.connected) {
        // Open settings modal if not connected
        loadSettingsToModal();
        settingsModal?.classList.remove('hidden');
        return;
    }
    
    // Perform manual sync
    syncBtn.classList.add('syncing');
    
    await syncFromBackend();
    const result = await syncToBackend();
    
    syncBtn.classList.remove('syncing');
    
    if (result.success) {
        showToast('Synced!', 'success');
    } else {
        showToast(`Sync failed: ${result.message}`, 'error');
    }
});

// Collapsible section toggle
document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const content = toggle.nextElementSibling;
        const icon = toggle.querySelector('.toggle-icon');
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        
        toggle.setAttribute('aria-expanded', (!isExpanded).toString());
        content?.classList.toggle('hidden');
        
        if (icon) {
            icon.textContent = isExpanded ? 'expand_more' : 'expand_less';
        }
    });
});

// Initialize sync status on page load
document.addEventListener('DOMContentLoaded', () => {
    updateSyncStatusUI(getBackendConfig());
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

// ===== BULK IMPORT PARSER - Works without AI =====
function parseManualQuestions(text: string): Question[] {
    const questions: Question[] = [];
    
    // Split by question patterns
    // Supports: 1. Question, Q1. Question, Q.1 Question, 1) Question, (1) Question
    const questionBlocks = text.split(/(?=(?:^|\n)\s*(?:\d+[\.\)]\s*|\(?Q?\.?\d*\)?\.?\s*|Q\s*\.?\s*\d*\.?\s*)(?=[A-Z]))/i)
        .filter(block => block.trim());
    
    questionBlocks.forEach((block, blockIndex) => {
        try {
            const lines = block.trim();
            if (!lines || lines.length < 10) return;
            
            // Extract question text - everything before options start
            let questionText = '';
            let optionsText = '';
            let answerText = '';
            let explanationText = '';
            let subjectText = '';
            let topicText = '';
            
            // Split into sections
            const answerMatch = lines.match(/(?:Answer|Ans|उत्तर|सही उत्तर)\s*[:.-]?\s*([a-dA-D1-4])/i);
            const explanationMatch = lines.match(/(?:Explanation|Exp|व्याख्या|विवरण)\s*[:.-]?\s*([\s\S]*?)(?=(?:Subject|Topic|विषय|$))/i);
            const subjectMatch = lines.match(/(?:Subject|विषय)\s*[:.-]?\s*([^||\n]+)/i);
            const topicMatch = lines.match(/(?:Topic|टॉपिक)\s*[:.-]?\s*([^||\n]+)/i);
            
            // Extract answer
            if (answerMatch) {
                const ans = answerMatch[1].toLowerCase();
                answerText = ans;
            }
            
            // Extract explanation
            if (explanationMatch) {
                explanationText = explanationMatch[1].trim();
            }
            
            // Extract subject and topic
            if (subjectMatch) {
                subjectText = subjectMatch[1].trim();
            }
            if (topicMatch) {
                topicText = topicMatch[1].trim();
            }
            
            // Parse options - supports multiple formats
            // Format 1: a) option  b) option OR A) option B) option
            // Format 2: a. option  b. option
            // Format 3: (a) option (b) option
            // Format 4: 1) option 2) option
            const optionPatterns = [
                /([a-d])\s*[\)\.\]]\s*([^a-d\)\.\]]*?)(?=(?:[a-d]\s*[\)\.\]]|Answer|Ans|Explanation|Subject|Topic|$))/gi,
                /\(([a-d])\)\s*([^()]*?)(?=(?:\([a-d]\)|Answer|Ans|Explanation|Subject|Topic|$))/gi,
                /([1-4])\s*[\)\.\]]\s*([^1-4\)\.\]]*?)(?=(?:[1-4]\s*[\)\.\]]|Answer|Ans|Explanation|Subject|Topic|$))/gi,
            ];
            
            let options: string[] = [];
            let optionsEndIndex = lines.length;
            
            // Try to find options
            for (const pattern of optionPatterns) {
                const matches = [...lines.matchAll(pattern)];
                if (matches.length >= 2) {
                    options = [];
                    matches.forEach(match => {
                        const optText = match[2].trim()
                            .replace(/Answer.*$/i, '')
                            .replace(/Explanation.*$/i, '')
                            .replace(/Subject.*$/i, '')
                            .replace(/Topic.*$/i, '')
                            .trim();
                        if (optText) {
                            options.push(optText);
                        }
                    });
                    
                    if (options.length >= 2) {
                        // Find where options start
                        const firstOptMatch = lines.match(/([a-d1-4])\s*[\)\.\]]/i);
                        if (firstOptMatch) {
                            optionsEndIndex = firstOptMatch.index || 0;
                        }
                        break;
                    }
                }
            }
            
            // Extract question text (everything before options)
            questionText = lines.substring(0, optionsEndIndex)
                .replace(/^[\s\d\.\)\(Q]+/i, '') // Remove question number prefix
                .replace(/\s+/g, ' ')
                .trim();
            
            // Ensure we have at least 4 options (pad if needed)
            while (options.length < 4) {
                options.push(`Option ${options.length + 1}`);
            }
            options = options.slice(0, 4); // Keep only first 4
            
            // Convert answer to index
            let answerIndex = 0;
            if (answerText) {
                if (/[a-d]/i.test(answerText)) {
                    answerIndex = answerText.toLowerCase().charCodeAt(0) - 97; // a=0, b=1, etc.
                } else if (/[1-4]/.test(answerText)) {
                    answerIndex = parseInt(answerText) - 1;
                }
            }
            answerIndex = Math.max(0, Math.min(3, answerIndex));
            
            // Only add if we have valid question and options
            if (questionText && questionText.length > 5 && options.filter(o => o && o.length > 0).length >= 2) {
                questions.push({
                    question: questionText,
                    options: options,
                    answer: answerIndex,
                    explanation: explanationText || 'No explanation provided.',
                    subject: subjectText || 'General',
                    topic: topicText || 'Miscellaneous'
                });
            }
        } catch (e) {
            console.warn(`Failed to parse question block ${blockIndex}:`, e);
        }
    });
    
    return questions;
}

async function handleGenerateTest() {
    const numQuestions = parseInt(questionsSlider.value, 10);
    const language = languageSelect.value;
    const testName = testNameInput.value.trim();
    const marks = parseFloat(marksInput.value) || 1;
    const negative = parseFloat(negativeInput.value) || 0;

    // Handle Bulk Import WITHOUT AI
    if (activeTabInput.type === 'manual') {
        const manualText = manualInput.value.trim();
        if (!manualText) {
            showToast('Please paste your questions in the text area.', 'error');
            return;
        }
        
        loader.classList.remove('hidden');
        generateTestBtn.disabled = true;
        
        try {
            // Parse questions locally without AI
            const parsedQuestions = parseManualQuestions(manualText);
            
            if (parsedQuestions.length === 0) {
                throw new Error('Could not parse any questions. Please check the format and try again.');
            }
            
            currentTest = {
                id: `test_${Date.now()}`,
                name: testName || `Bulk Import Test`,
                questions: parsedQuestions,
                duration: parseInt(durationInput.value, 10),
                language: language,
                createdAt: new Date().toISOString(),
                marksPerQuestion: marks,
                negativeMarking: negative
            };
            
            showToast(`Successfully imported ${parsedQuestions.length} questions!`, 'success');
            renderEditableTest(currentTest);
            showView(editTestView);
            
        } catch (error) {
            console.error("Error parsing questions:", error);
            showToast(`Failed to import: ${error.message}`, 'error');
        } finally {
            loader.classList.add('hidden');
            generateTestBtn.disabled = false;
        }
        return;
    }

    // For AI-based generation
    if (!ai) {
        showToast("AI Service is not available. Use Bulk Import for manual questions.", 'error');
        return;
    }

    loader.classList.remove('hidden');
    generateTestBtn.disabled = true;

    let source = "Custom Input";
    let contentsForApi;

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
        showToast(`Failed to generate test. ${error.message}`, 'error');
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
        showToast('Test updated successfully!', 'success');
    } else {
        tests.unshift(currentTest);
        showToast('Test created and saved!', 'success');
    }
    
    saveToStorage('tests', tests);
    renderAllTests();
    showView(allTestsView);
});


// --- All Tests & Test Detail Logic ---
function renderAllTests() {
    const tests = getFromStorage<Test[]>('tests', []);
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    
    if (tests.length === 0) {
        allTestsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <span class="material-symbols-outlined">library_books</span>
                </div>
                <h3>No Tests Yet</h3>
                <p>Create your first test to get started!</p>
                <button class="action-btn save-btn" onclick="document.querySelector('.card[aria-labelledby=\\'create-test-title\\']').click()">
                    <span class="material-symbols-outlined">add</span> Create Test
                </button>
            </div>`;
        return;
    }
    
    // Calculate stats for each test
    const testStats: { [id: string]: { attempts: number, bestScore: number, lastAttempt: string | null } } = {};
    tests.forEach(test => {
        const attempts = history.filter(h => h.testId === test.id);
        testStats[test.id] = {
            attempts: attempts.length,
            bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : 0,
            lastAttempt: attempts.length > 0 ? attempts[0].completedAt : null
        };
    });
    
    allTestsContainer.innerHTML = tests.map((test, index) => {
        const dateObj = new Date(test.createdAt);
        const date = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const stats = testStats[test.id];
        const totalMarks = test.questions.length * (test.marksPerQuestion || 1);
        const subjects = [...new Set(test.questions.map(q => q.subject))].filter(s => s).slice(0, 2);
        
        return `
        <div class="saved-test-item animated-card" data-testid="${test.id}" style="animation-delay: ${index * 50}ms">
            <div class="test-card-header">
                <div class="test-badge">${test.language}</div>
                <div class="test-number">#${tests.length - index}</div>
            </div>
            <div class="test-card-body">
                <h3>${test.name}</h3>
                <p class="test-date">
                    <span class="material-symbols-outlined">calendar_today</span> Created ${date}
                </p>
                ${subjects.length > 0 ? `
                <div class="test-subjects">
                    ${subjects.map(s => `<span class="subject-tag">${s}</span>`).join('')}
                    ${[...new Set(test.questions.map(q => q.subject))].length > 2 ? `<span class="subject-tag more">+${[...new Set(test.questions.map(q => q.subject))].length - 2}</span>` : ''}
                </div>
                ` : ''}
            </div>
            <div class="test-stats-grid">
                <div class="test-stat-item">
                    <span class="material-symbols-outlined">quiz</span>
                    <div class="stat-content">
                        <span class="stat-num">${test.questions.length}</span>
                        <span class="stat-text">Questions</span>
                    </div>
                </div>
                <div class="test-stat-item">
                    <span class="material-symbols-outlined">timer</span>
                    <div class="stat-content">
                        <span class="stat-num">${test.duration}</span>
                        <span class="stat-text">Minutes</span>
                    </div>
                </div>
                <div class="test-stat-item">
                    <span class="material-symbols-outlined">stars</span>
                    <div class="stat-content">
                        <span class="stat-num">${totalMarks}</span>
                        <span class="stat-text">Marks</span>
                    </div>
                </div>
                <div class="test-stat-item ${stats.attempts > 0 ? 'has-attempts' : ''}">
                    <span class="material-symbols-outlined">history</span>
                    <div class="stat-content">
                        <span class="stat-num">${stats.attempts}</span>
                        <span class="stat-text">Attempts</span>
                    </div>
                </div>
            </div>
            ${stats.attempts > 0 ? `
            <div class="test-performance-preview">
                <div class="best-score">
                    <span class="label">Best Score</span>
                    <span class="value ${stats.bestScore >= 60 ? 'good' : stats.bestScore >= 40 ? 'avg' : 'low'}">${stats.bestScore.toFixed(1)}%</span>
                </div>
                <div class="mini-progress-bar">
                    <div class="mini-progress-fill" style="width: ${stats.bestScore}%; background: ${stats.bestScore >= 60 ? 'var(--success-color)' : stats.bestScore >= 40 ? 'var(--warning-color)' : 'var(--danger-color)'}"></div>
                </div>
            </div>
            ` : ''}
            <div class="test-card-actions">
                <button class="start-btn primary-action" aria-label="Start Test" title="Start Test">
                    <span class="material-symbols-outlined">play_arrow</span>
                    <span class="btn-label">Start Test</span>
                </button>
                <div class="secondary-actions">
                    <button class="edit-btn icon-action" aria-label="Edit Test" title="Edit Test">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="download-test-btn icon-action" aria-label="Download JSON" title="Download">
                        <span class="material-symbols-outlined">download</span>
                    </button>
                    <button class="delete-btn icon-action danger" aria-label="Delete Test" title="Delete">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
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

            showToast(`Test "${newTest.name}" imported successfully!`, 'success');
            renderAllTests();

        } catch (error) {
            console.error("Error importing test:", error);
            showToast(`Failed to import test. ${error.message}`, 'error');
        } finally {
            // Reset input value to allow re-uploading the same file
            input.value = '';
        }
    };
    reader.onerror = () => {
         showToast('Error reading the file.', 'error');
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
            showToast('Test deleted.', 'info');
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
        showToast("Last question reached. Click Submit when ready.", "info");
        return;
    }
    if (newIndex < 0) {
        questionStartTime = Date.now();
        showToast("You're at the first question.", "info");
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

// Toast notification system
function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${type === 'info' ? 'info' : type === 'success' ? 'check_circle' : type === 'warning' ? 'warning' : 'error'}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 2.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;

saveNextBtn.addEventListener('click', () => navigateToQuestion(currentQuestionIndex + 1));

prevBtn.addEventListener('click', () => navigateToQuestion(currentQuestionIndex - 1));

clearResponseBtn.addEventListener('click', () => {
    const selectedOption = document.querySelector('input[name="option"]:checked') as HTMLInputElement;
    if (selectedOption) {
        selectedOption.checked = false;
        showToast("Response cleared", "info");
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
            showToast("Critical error: Test data missing. Unable to submit.", 'error');
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

        // Auto-sync to backend if configured
        autoSyncAfterTest();

        currentTest = null; // Clear the current test state
        
        // Redirect directly to the full report instead of the history list
        renderPerformanceReport(attempt, false);
        showView(performanceReportView);

    } catch (error) {
        console.error("An unexpected error occurred during test submission:", error);
        showToast("Error submitting test. Progress may not be saved.", 'error');
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
            showToast("⏰ Time's up! Submitting your test...", 'warning');
            handleSubmitTest();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
}

// --- Performance Logic ---
function renderPerformanceHistory() {
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    if (history.length === 0) {
        performanceContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <span class="material-symbols-outlined">assessment</span>
                </div>
                <h3>No Results Yet</h3>
                <p>Complete a test to see your performance history!</p>
                <button class="action-btn save-btn" onclick="document.querySelector('.card[aria-labelledby=\\'all-tests-title\\']').click()">
                    <span class="material-symbols-outlined">library_books</span> View Tests
                </button>
            </div>`;
        return;
    }

    // Calculate overall stats
    const totalTests = history.length;
    const avgScore = history.reduce((sum, h) => sum + h.score, 0) / totalTests;
    const bestScore = Math.max(...history.map(h => h.score));
    const totalQuestions = history.reduce((sum, h) => sum + h.totalQuestions, 0);
    const totalCorrect = history.reduce((sum, h) => sum + h.correctAnswers, 0);
    
    // Quick stats header
    let headerHTML = `
        <div class="results-overview-header">
            <div class="overview-stat">
                <span class="material-symbols-outlined">history</span>
                <div class="overview-content">
                    <span class="overview-value">${totalTests}</span>
                    <span class="overview-label">Tests Completed</span>
                </div>
            </div>
            <div class="overview-stat">
                <span class="material-symbols-outlined">percent</span>
                <div class="overview-content">
                    <span class="overview-value">${avgScore.toFixed(1)}%</span>
                    <span class="overview-label">Avg Score</span>
                </div>
            </div>
            <div class="overview-stat">
                <span class="material-symbols-outlined">emoji_events</span>
                <div class="overview-content">
                    <span class="overview-value best">${bestScore.toFixed(1)}%</span>
                    <span class="overview-label">Best Score</span>
                </div>
            </div>
            <div class="overview-stat">
                <span class="material-symbols-outlined">check_circle</span>
                <div class="overview-content">
                    <span class="overview-value">${totalCorrect}/${totalQuestions}</span>
                    <span class="overview-label">Correct Answers</span>
                </div>
            </div>
        </div>
    `;

    let historyHTML = history.map((attempt, index) => {
        const dateObj = new Date(attempt.completedAt);
        const date = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const time = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const scoreClass = attempt.score >= 60 ? 'excellent' : attempt.score >= 40 ? 'good' : 'poor';
        const timeTakenMins = Math.floor(attempt.timeTaken / 60);
        const timeTakenSecs = attempt.timeTaken % 60;
        const accuracy = attempt.correctAnswers + attempt.incorrectAnswers > 0 
            ? (attempt.correctAnswers / (attempt.correctAnswers + attempt.incorrectAnswers)) * 100 
            : 0;
        
        // Calculate performance trend indicator
        const prevAttempts = history.slice(index + 1, index + 4).filter(h => h.testId === attempt.testId);
        let trendIcon = '';
        let trendClass = '';
        if (prevAttempts.length > 0) {
            const prevAvg = prevAttempts.reduce((sum, h) => sum + h.score, 0) / prevAttempts.length;
            if (attempt.score > prevAvg + 5) {
                trendIcon = 'trending_up';
                trendClass = 'trend-up';
            } else if (attempt.score < prevAvg - 5) {
                trendIcon = 'trending_down';
                trendClass = 'trend-down';
            } else {
                trendIcon = 'trending_flat';
                trendClass = 'trend-flat';
            }
        }

        return `
        <div class="history-card enhanced" data-attempt-index="${index}" style="animation-delay: ${index * 50}ms">
            <div class="history-card-content">
                <div class="history-header">
                    <div class="history-title-area">
                        <h3>${attempt.testName}</h3>
                        <div class="history-meta">
                            <span class="meta-item">
                                <span class="material-symbols-outlined">schedule</span>
                                ${date} • ${time}
                            </span>
                        </div>
                    </div>
                    <div class="score-ring ${scoreClass}">
                        <svg viewBox="0 0 36 36">
                            <path class="score-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                            <path class="score-ring-fill" stroke-dasharray="${attempt.score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                        </svg>
                        <div class="score-ring-value">${attempt.score.toFixed(0)}%</div>
                        ${trendIcon ? `<span class="trend-indicator ${trendClass}" title="Performance trend"><span class="material-symbols-outlined">${trendIcon}</span></span>` : ''}
                    </div>
                </div>
                
                <div class="history-stats-bar">
                    <div class="stat-segment correct" style="flex: ${attempt.correctAnswers}">
                        <span class="segment-value">${attempt.correctAnswers}</span>
                    </div>
                    <div class="stat-segment incorrect" style="flex: ${attempt.incorrectAnswers}">
                        <span class="segment-value">${attempt.incorrectAnswers}</span>
                    </div>
                    <div class="stat-segment unanswered" style="flex: ${attempt.unanswered}">
                        <span class="segment-value">${attempt.unanswered}</span>
                    </div>
                </div>
                
                <div class="history-details-grid">
                    <div class="detail-item">
                        <span class="material-symbols-outlined">quiz</span>
                        <span class="detail-value">${attempt.totalQuestions}</span>
                        <span class="detail-label">Questions</span>
                    </div>
                    <div class="detail-item">
                        <span class="material-symbols-outlined">timer</span>
                        <span class="detail-value">${timeTakenMins}m ${timeTakenSecs}s</span>
                        <span class="detail-label">Time</span>
                    </div>
                    <div class="detail-item">
                        <span class="material-symbols-outlined">track_changes</span>
                        <span class="detail-value">${accuracy.toFixed(0)}%</span>
                        <span class="detail-label">Accuracy</span>
                    </div>
                    <div class="detail-item">
                        <span class="material-symbols-outlined">speed</span>
                        <span class="detail-value">${(attempt.timeTaken / attempt.totalQuestions).toFixed(1)}s</span>
                        <span class="detail-label">Avg/Q</span>
                    </div>
                </div>
            </div>
            
            <button class="view-analysis-btn">
                <span>View Detailed Analysis</span>
                <span class="material-symbols-outlined">arrow_forward</span>
            </button>
        </div>
    `}).join('');

    performanceContainer.innerHTML = headerHTML + `<div class="history-grid">${historyHTML}</div>`;
}

performanceContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.history-card') as HTMLElement; 
    if (item) {
        const index = parseInt(item.dataset.attemptIndex, 10);
        const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
        renderPerformanceReport(history[index], true);
        showView(performanceReportView);
    }
});

function renderPerformanceReport(attempt: TestAttempt, fromHistory: boolean = true) {
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
    const sortedTimes = [...attempt.timePerQuestion].sort((a, b) => a - b);
    const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const totalTime = attempt.timePerQuestion.reduce((a, b) => a + b, 0);
    
    // Calculate standard deviation for consistency analysis
    const variance = attempt.timePerQuestion.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / attempt.timePerQuestion.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = Math.max(0, 100 - (stdDev / avgTime) * 100);
    
    // Time efficiency - how much time was wasted on incorrect answers
    let timeOnCorrect = 0, timeOnIncorrect = 0, timeOnUnanswered = 0;
    attempt.timePerQuestion.forEach((time, i) => {
        if (attempt.userAnswers[i] === null) {
            timeOnUnanswered += time;
        } else if (attempt.userAnswers[i] === attempt.fullTest.questions[i].answer) {
            timeOnCorrect += time;
        } else {
            timeOnIncorrect += time;
        }
    });
    
    const timeEfficiency = totalTime > 0 ? (timeOnCorrect / totalTime) * 100 : 0;
    
    // Time Statistics Cards - Enhanced
    let timeStatsHTML = `
        <div class="time-analysis-header">
            <h4><span class="material-symbols-outlined">schedule</span> Time Performance Overview</h4>
        </div>
        <div class="time-stats-grid enhanced">
            <div class="time-stat-card highlight">
                <div class="stat-icon-wrapper primary">
                    <span class="material-symbols-outlined">avg_time</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${avgTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Average per Question</div>
                </div>
            </div>
            <div class="time-stat-card">
                <div class="stat-icon-wrapper danger">
                    <span class="material-symbols-outlined">arrow_upward</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${maxTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Slowest Question</div>
                </div>
            </div>
            <div class="time-stat-card">
                <div class="stat-icon-wrapper success">
                    <span class="material-symbols-outlined">arrow_downward</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${minTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Fastest Question</div>
                </div>
            </div>
            <div class="time-stat-card">
                <div class="stat-icon-wrapper info">
                    <span class="material-symbols-outlined">vertical_align_center</span>
                </div>
                <div class="time-stat-content">
                    <div class="time-stat-value">${medianTime.toFixed(1)}s</div>
                    <div class="time-stat-label">Median Time</div>
                </div>
            </div>
        </div>
        
        <div class="time-efficiency-section">
            <h4><span class="material-symbols-outlined">pie_chart</span> Time Allocation</h4>
            <div class="time-pie-chart">
                <div class="pie-visual">
                    <svg viewBox="0 0 36 36" class="circular-chart">
                        <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                        <path class="circle correct" stroke-dasharray="${(timeOnCorrect/totalTime*100)}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                    </svg>
                    <div class="pie-center">
                        <span class="efficiency-value">${timeEfficiency.toFixed(0)}%</span>
                        <span class="efficiency-label">Efficient</span>
                    </div>
                </div>
                <div class="time-breakdown-list">
                    <div class="breakdown-item correct">
                        <div class="breakdown-indicator"></div>
                        <div class="breakdown-info">
                            <span class="breakdown-label">Time on Correct</span>
                            <span class="breakdown-value">${Math.floor(timeOnCorrect / 60)}m ${(timeOnCorrect % 60).toFixed(0)}s</span>
                        </div>
                        <span class="breakdown-pct">${(timeOnCorrect/totalTime*100).toFixed(0)}%</span>
                    </div>
                    <div class="breakdown-item incorrect">
                        <div class="breakdown-indicator"></div>
                        <div class="breakdown-info">
                            <span class="breakdown-label">Time on Incorrect</span>
                            <span class="breakdown-value">${Math.floor(timeOnIncorrect / 60)}m ${(timeOnIncorrect % 60).toFixed(0)}s</span>
                        </div>
                        <span class="breakdown-pct">${(timeOnIncorrect/totalTime*100).toFixed(0)}%</span>
                    </div>
                    <div class="breakdown-item unanswered">
                        <div class="breakdown-indicator"></div>
                        <div class="breakdown-info">
                            <span class="breakdown-label">Time on Unanswered</span>
                            <span class="breakdown-value">${Math.floor(timeOnUnanswered / 60)}m ${(timeOnUnanswered % 60).toFixed(0)}s</span>
                        </div>
                        <span class="breakdown-pct">${(timeOnUnanswered/totalTime*100).toFixed(0)}%</span>
                    </div>
                </div>
            </div>
            
            <div class="consistency-meter">
                <div class="consistency-header">
                    <span class="consistency-title"><span class="material-symbols-outlined">balance</span> Time Consistency</span>
                    <span class="consistency-score ${consistencyScore >= 70 ? 'good' : consistencyScore >= 40 ? 'avg' : 'poor'}">${consistencyScore.toFixed(0)}%</span>
                </div>
                <div class="consistency-bar">
                    <div class="consistency-fill" style="width: ${consistencyScore}%; background: ${consistencyScore >= 70 ? 'var(--success-color)' : consistencyScore >= 40 ? 'var(--warning-color)' : 'var(--danger-color)'}"></div>
                </div>
                <p class="consistency-tip">${consistencyScore >= 70 
                    ? '✨ Great! You maintain a consistent pace throughout the test.' 
                    : consistencyScore >= 40 
                    ? '💡 Your time varies. Try to maintain a more consistent pace.' 
                    : '⚠️ High variance in time spent. Practice maintaining steady pace.'}</p>
            </div>
        </div>
    `;
    
    // Question Time Chart with Toggle Button
    let perQuestionChartHTML = '<h4 style="margin-top: 1.5rem;">Time Spent Per Question</h4><div class="chart-legend"><span class="legend-item"><span class="palette-indicator answered"></span> Correct</span><span class="legend-item"><span class="palette-indicator not-answered"></span> Incorrect</span><span class="legend-item"><span class="palette-indicator not-visited"></span> Unanswered</span></div>';
    
    perQuestionChartHTML += '<div id="q-chart-container" class="chart question-time-chart">';

    attempt.timePerQuestion.forEach((time, index) => {
        const q = attempt.fullTest.questions[index];
        const userAnswer = attempt.userAnswers[index];
        let statusClass = 'bar-unanswered';
        if (userAnswer === q.answer) {
            statusClass = 'bar-correct';
        } else if (userAnswer !== null) {
            statusClass = 'bar-incorrect';
        }
        
        const barWidth = (time / maxTime) * 100;

        perQuestionChartHTML += `
            <div class="chart-row">
                <div class="chart-label">Q${index + 1}</div>
                <div class="chart-bar-container">
                    <div class="chart-bar ${statusClass}" style="width: ${barWidth}%" title="Time: ${time.toFixed(1)}s"></div>
                </div>
                <div class="chart-value">${time.toFixed(1)}s</div>
            </div>
        `;
    });
    perQuestionChartHTML += '</div>';
    
    // Add the Expand Button
    perQuestionChartHTML += `<button id="expand-chart-btn" class="expand-chart-btn">Show Full Chart (All Questions)</button>`;

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
        accuracy: (data.correct / data.count) * 100
    }));
    
    const maxAvgTime = Math.max(...subjectAvgs.map(s => s.avgTime), 1);
    
    let perSubjectChartHTML = '<br><br><h4>Average Time Per Subject</h4><div class="chart subject-time-chart">';
    subjectAvgs.forEach(({ subject, avgTime, accuracy }) => {
        const barWidth = (avgTime / maxAvgTime) * 100;
        const barColor = accuracy >= 70 ? 'var(--success-color)' : accuracy >= 50 ? 'var(--warning-color)' : 'var(--danger-color)';
        perSubjectChartHTML += `
            <div class="chart-row">
                <div class="chart-label">${subject}</div>
                <div class="chart-bar-container">
                    <div class="chart-bar" style="width: ${barWidth}%; background: ${barColor}" title="Avg Time: ${avgTime.toFixed(1)}s | Accuracy: ${accuracy.toFixed(0)}%"></div>
                </div>
                <div class="chart-value">${avgTime.toFixed(1)}s</div>
            </div>
        `;
    });
    perSubjectChartHTML += '</div>';
    
    // Time Distribution Analysis
    let timeDistHTML = `
        <h4 style="margin-top: 2rem;">Time Distribution Insights</h4>
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
                <div class="dist-segment quick" style="width: ${quickPct}%"></div>
                <div class="dist-segment normal" style="width: ${normalPct}%"></div>
                <div class="dist-segment slow" style="width: ${slowPct}%"></div>
            </div>
            <div class="time-dist-legend">
                <div class="dist-legend-item"><span class="dist-dot quick"></span> Quick (< ${(avgTime * 0.5).toFixed(0)}s): ${quick}</div>
                <div class="dist-legend-item"><span class="dist-dot normal"></span> Normal: ${normal}</div>
                <div class="dist-legend-item"><span class="dist-dot slow"></span> Slow (> ${(avgTime * 1.5).toFixed(0)}s): ${slow}</div>
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

// Topic-wise analysis with graph - Enhanced
function renderTopicWiseAnalysis(attempt: TestAttempt) {
    const topicWiseContainer = document.getElementById('topic-wise-view');
    if (!topicWiseContainer) return;
    
    const topicStats: { [key: string]: { correct: number, total: number, incorrect: number, subject: string, avgTime: number, totalTime: number } } = {};
    
    attempt.fullTest.questions.forEach((q, i) => {
        const topic = q.topic || 'General';
        const subject = q.subject || 'Uncategorized';
        
        if (!topicStats[topic]) {
            topicStats[topic] = { correct: 0, total: 0, incorrect: 0, subject, avgTime: 0, totalTime: 0 };
        }
        
        topicStats[topic].total++;
        topicStats[topic].totalTime += attempt.timePerQuestion[i] || 0;
        
        if (attempt.userAnswers[i] === q.answer) {
            topicStats[topic].correct++;
        } else if (attempt.userAnswers[i] !== null) {
            topicStats[topic].incorrect++;
        }
    });
    
    // Calculate average time
    Object.values(topicStats).forEach(stat => {
        stat.avgTime = stat.total > 0 ? stat.totalTime / stat.total : 0;
    });
    
    // Sort by accuracy
    const sortedTopics = Object.entries(topicStats)
        .map(([topic, stats]) => ({
            topic,
            ...stats,
            accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0
        }))
        .sort((a, b) => b.accuracy - a.accuracy);
    
    // Calculate overall topic stats
    const totalTopics = sortedTopics.length;
    const masteredTopics = sortedTopics.filter(t => t.accuracy >= 70).length;
    const weakTopics = sortedTopics.filter(t => t.accuracy < 50);
    const strongTopics = sortedTopics.filter(t => t.accuracy >= 70).slice(0, 3);
    const avgTopicAccuracy = sortedTopics.reduce((sum, t) => sum + t.accuracy, 0) / totalTopics;
    
    topicWiseContainer.innerHTML = `
        <div class="topic-overview-stats">
            <div class="topic-overview-card">
                <div class="topic-overview-icon mastered">
                    <span class="material-symbols-outlined">workspace_premium</span>
                </div>
                <div class="topic-overview-content">
                    <span class="topic-overview-value">${masteredTopics}/${totalTopics}</span>
                    <span class="topic-overview-label">Topics Mastered (≥70%)</span>
                </div>
            </div>
            <div class="topic-overview-card">
                <div class="topic-overview-icon avg">
                    <span class="material-symbols-outlined">percent</span>
                </div>
                <div class="topic-overview-content">
                    <span class="topic-overview-value">${avgTopicAccuracy.toFixed(0)}%</span>
                    <span class="topic-overview-label">Avg Topic Accuracy</span>
                </div>
            </div>
            <div class="topic-overview-card">
                <div class="topic-overview-icon weak">
                    <span class="material-symbols-outlined">warning</span>
                </div>
                <div class="topic-overview-content">
                    <span class="topic-overview-value">${weakTopics.length}</span>
                    <span class="topic-overview-label">Topics Need Work (<50%)</span>
                </div>
            </div>
        </div>
        
        <div class="topic-insights-grid">
            <div class="insight-card strength">
                <h4><span class="material-symbols-outlined">emoji_events</span> Top Performing Topics</h4>
                ${strongTopics.length > 0 ? strongTopics.map((t, i) => `
                    <div class="insight-item ranked">
                        <span class="rank-badge">#${i + 1}</span>
                        <div class="insight-details">
                            <span class="topic-name">${t.topic}</span>
                            <span class="topic-subject-tag">${t.subject}</span>
                        </div>
                        <div class="insight-score-container">
                            <span class="topic-score success">${t.accuracy.toFixed(0)}%</span>
                            <span class="topic-ratio">${t.correct}/${t.total}</span>
                        </div>
                    </div>
                `).join('') : '<p class="no-data">Complete more questions to see your strong topics</p>'}
            </div>
            <div class="insight-card weakness">
                <h4><span class="material-symbols-outlined">priority_high</span> Focus Areas</h4>
                ${weakTopics.length > 0 ? weakTopics.slice(0, 3).map((t, i) => `
                    <div class="insight-item ranked">
                        <span class="rank-badge danger">${i + 1}</span>
                        <div class="insight-details">
                            <span class="topic-name">${t.topic}</span>
                            <span class="topic-subject-tag">${t.subject}</span>
                        </div>
                        <div class="insight-score-container">
                            <span class="topic-score danger">${t.accuracy.toFixed(0)}%</span>
                            <span class="topic-ratio">${t.correct}/${t.total}</span>
                        </div>
                    </div>
                `).join('') : '<p class="no-data success-message">🎉 Great job! All topics above 50%</p>'}
            </div>
        </div>
        
        <div class="topic-full-breakdown">
            <h4><span class="material-symbols-outlined">bar_chart</span> Complete Topic Breakdown</h4>
            <div class="topic-table-container">
                <table class="topic-table">
                    <thead>
                        <tr>
                            <th>Topic</th>
                            <th>Subject</th>
                            <th>Performance</th>
                            <th>Score</th>
                            <th>Avg Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedTopics.map(t => {
                            const statusClass = t.accuracy >= 70 ? 'excellent' : t.accuracy >= 50 ? 'good' : 'poor';
                            return `
                                <tr class="${statusClass}">
                                    <td class="topic-cell">${t.topic}</td>
                                    <td class="subject-cell">${t.subject}</td>
                                    <td class="performance-cell">
                                        <div class="mini-performance-bar">
                                            <div class="mini-bar-fill" style="width: ${t.accuracy}%; background: ${t.accuracy >= 70 ? 'var(--success-color)' : t.accuracy >= 50 ? 'var(--warning-color)' : 'var(--danger-color)'}"></div>
                                        </div>
                                    </td>
                                    <td class="score-cell">
                                        <span class="accuracy-badge ${statusClass}">${t.accuracy.toFixed(0)}%</span>
                                        <span class="ratio">(${t.correct}/${t.total})</span>
                                    </td>
                                    <td class="time-cell">${t.avgTime.toFixed(1)}s</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
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
    const history = getFromStorage<TestAttempt[]>('performanceHistory', []);
    
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
}

// Score Trend Graph - Fixed to prevent duplicates
function renderScoreTrendGraph(sortedHistory: TestAttempt[]) {
    // Remove existing trend card if present
    const existingTrendCard = document.querySelector('.score-trend-card');
    if (existingTrendCard) {
        existingTrendCard.remove();
    }
    
    // Remove any existing additional analysis cards
    const existingCards = document.querySelectorAll('.analytics-additional-card');
    existingCards.forEach(card => card.remove());
    
    if (sortedHistory.length < 2) return; // Need at least 2 tests for trend
    
    // Calculate trend data
    const recentTests = sortedHistory.slice(0, 10).reverse();
    const avgScore = recentTests.reduce((sum, t) => sum + t.score, 0) / recentTests.length;
    const maxScore = Math.max(...recentTests.map(t => t.score));
    const minScore = Math.min(...recentTests.map(t => t.score));
    
    // Calculate improvement from first to last
    const improvement = recentTests.length >= 2 
        ? recentTests[recentTests.length - 1].score - recentTests[0].score 
        : 0;
    
    // Calculate streak of passing tests
    let passingStreak = 0;
    for (let i = recentTests.length - 1; i >= 0; i--) {
        if (recentTests[i].score >= 50) passingStreak++;
        else break;
    }
    
    const trendContainer = document.createElement('div');
    trendContainer.className = 'report-card score-trend-card';
    trendContainer.innerHTML = `
        <div class="trend-header">
            <h3><span class="material-symbols-outlined">show_chart</span> Performance Trend</h3>
            <div class="trend-meta">
                <span class="trend-indicator ${improvement >= 0 ? 'positive' : 'negative'}">
                    <span class="material-symbols-outlined">${improvement >= 0 ? 'trending_up' : 'trending_down'}</span>
                    ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%
                </span>
            </div>
        </div>
        
        <div class="trend-stats-row">
            <div class="trend-stat">
                <span class="trend-stat-value">${avgScore.toFixed(1)}%</span>
                <span class="trend-stat-label">Average</span>
            </div>
            <div class="trend-stat">
                <span class="trend-stat-value best">${maxScore.toFixed(1)}%</span>
                <span class="trend-stat-label">Best</span>
            </div>
            <div class="trend-stat">
                <span class="trend-stat-value">${minScore.toFixed(1)}%</span>
                <span class="trend-stat-label">Lowest</span>
            </div>
            <div class="trend-stat">
                <span class="trend-stat-value streak">${passingStreak}</span>
                <span class="trend-stat-label">Pass Streak</span>
            </div>
        </div>
        
        <div class="score-trend-graph">
            <div class="graph-y-axis">
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
            </div>
            <div class="graph-content">
                <div class="graph-grid-lines">
                    <div class="grid-line" style="bottom: 100%"></div>
                    <div class="grid-line pass-line" style="bottom: 50%"></div>
                    <div class="grid-line" style="bottom: 0%"></div>
                </div>
                <div class="graph-bars">
                    ${recentTests.map((attempt, i) => {
                        const height = Math.max(attempt.score, 3);
                        const barColor = attempt.score >= 60 ? 'var(--success-color)' : attempt.score >= 40 ? 'var(--warning-color)' : 'var(--danger-color)';
                        const date = new Date(attempt.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        return `
                            <div class="trend-bar-wrapper" title="${attempt.testName}: ${attempt.score.toFixed(1)}%">
                                <div class="trend-bar-value">${attempt.score.toFixed(0)}%</div>
                                <div class="trend-bar" style="height: ${height}%; background: ${barColor}"></div>
                                <span class="trend-bar-label">${date}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
        
        <div class="trend-insight">
            <span class="material-symbols-outlined">${improvement >= 5 ? 'celebration' : improvement >= 0 ? 'thumb_up' : 'psychology'}</span>
            <p>${improvement >= 5 
                ? 'Excellent progress! Your scores are consistently improving.' 
                : improvement >= 0 
                ? 'Good job! Keep practicing to continue improving.' 
                : 'Your recent scores have dropped. Focus on your weak areas to improve.'}</p>
        </div>
    `;
    
    // Insert after stats grid
    const statsGrid = document.getElementById('analytics-stats-grid');
    if (statsGrid && statsGrid.parentNode) {
        statsGrid.parentNode.insertBefore(trendContainer, statsGrid.nextSibling);
    }
    
    // Add weekly activity heatmap
    renderWeeklyActivity(sortedHistory);
}

// Weekly Activity Heatmap
function renderWeeklyActivity(sortedHistory: TestAttempt[]) {
    // Get tests from last 4 weeks
    const fourWeeksAgo = Date.now() - (28 * 24 * 60 * 60 * 1000);
    const recentTests = sortedHistory.filter(t => new Date(t.completedAt).getTime() > fourWeeksAgo);
    
    // Group by day
    const dayActivity: { [key: string]: { count: number, avgScore: number } } = {};
    
    for (let i = 0; i < 28; i++) {
        const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
        const dateKey = date.toISOString().split('T')[0];
        dayActivity[dateKey] = { count: 0, avgScore: 0 };
    }
    
    recentTests.forEach(test => {
        const dateKey = new Date(test.completedAt).toISOString().split('T')[0];
        if (dayActivity[dateKey]) {
            dayActivity[dateKey].count++;
            dayActivity[dateKey].avgScore = (dayActivity[dateKey].avgScore * (dayActivity[dateKey].count - 1) + test.score) / dayActivity[dateKey].count;
        }
    });
    
    const days = Object.entries(dayActivity).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
    const maxCount = Math.max(...days.map(d => d[1].count), 1);
    
    // Calculate weekly totals
    const thisWeekTests = recentTests.filter(t => {
        const testDate = new Date(t.completedAt);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return testDate > weekAgo;
    }).length;
    
    const activityCard = document.createElement('div');
    activityCard.className = 'report-card analytics-additional-card activity-card';
    activityCard.innerHTML = `
        <h3><span class="material-symbols-outlined">calendar_month</span> Study Activity (Last 4 Weeks)</h3>
        <div class="activity-summary">
            <div class="activity-stat">
                <span class="activity-value">${recentTests.length}</span>
                <span class="activity-label">Tests in 4 Weeks</span>
            </div>
            <div class="activity-stat">
                <span class="activity-value">${thisWeekTests}</span>
                <span class="activity-label">This Week</span>
            </div>
            <div class="activity-stat">
                <span class="activity-value">${(recentTests.length / 4).toFixed(1)}</span>
                <span class="activity-label">Avg per Week</span>
            </div>
        </div>
        <div class="activity-heatmap">
            <div class="heatmap-labels">
                <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
            <div class="heatmap-grid">
                ${days.map(([date, data]) => {
                    const intensity = data.count > 0 ? Math.min(data.count / maxCount, 1) : 0;
                    const bgColor = data.count === 0 
                        ? 'rgba(255,255,255,0.05)' 
                        : `rgba(99, 102, 241, ${0.2 + intensity * 0.8})`;
                    const dayName = new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
                    return `<div class="heatmap-cell" style="background: ${bgColor}" title="${dayName}: ${data.count} test(s)${data.count > 0 ? ` (Avg: ${data.avgScore.toFixed(0)}%)` : ''}"></div>`;
                }).join('')}
            </div>
            <div class="heatmap-legend">
                <span>Less</span>
                <div class="legend-scale">
                    <div style="background: rgba(255,255,255,0.05)"></div>
                    <div style="background: rgba(99, 102, 241, 0.3)"></div>
                    <div style="background: rgba(99, 102, 241, 0.6)"></div>
                    <div style="background: rgba(99, 102, 241, 0.9)"></div>
                </div>
                <span>More</span>
            </div>
        </div>
    `;
    
    const subjectCard = document.querySelector('.report-card:has(#subject-mastery-container)') || document.querySelector('#subject-mastery-container')?.parentNode;
    if (subjectCard) {
        subjectCard.parentNode?.insertBefore(activityCard, subjectCard);
    }
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
    if (!data) return;

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