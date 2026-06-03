// ============================================================================
// CORE CONFIGURATION (Local AI)
// ============================================================================
const AI_ENDPOINT = 'http://localhost:11434/api/chat';
const MODEL_NAME = 'qwen2.5-coder:7b'; 

async function askLocalAI(systemPrompt, userPrompt) {
    try {
        const response = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: false
            })
        });
        const data = await response.json();
        return data.message.content;
    } catch (error) {
        console.error("Local AI is unreachable.", error);
        return "System Offline: AI engine not responding. Connect to local host.";
    }
}

// ============================================================================
// BASE HABIT TRACKER CORE
// ============================================================================
document.getElementById('add-btn').addEventListener('click', addHabit);
document.getElementById('habit-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') addHabit();
});

function addHabit() {
    const input = document.getElementById('habit-input');
    const habitText = input.value.trim();

    if (habitText !== '') {
        const ul = document.getElementById('habit-list');
        const li = document.createElement('li');
        
        // Use a span to isolate text for easy reading later
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = habitText;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                li.classList.add('completed');
                completeHabitQuest(habitText); // Trigger AI and rewards
                updateTodayHeatmap(); // Mark today as active
            } else {
                li.classList.remove('completed');
            }
        });
        
        li.appendChild(checkbox);
        li.appendChild(textSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => ul.removeChild(li));
        li.appendChild(deleteBtn);

        ul.appendChild(li);
        input.value = '';
    }
} 

// ============================================================================
// FEATURE 1: GOODS DROP SYSTEM
// ============================================================================
let userCurrency = parseInt(localStorage.getItem('currency')) || 0;
document.getElementById('credit-display').innerText = userCurrency;

const GOODS_POOL = [
    { name: 'Jordan 1 Lows', rarity: 'Grail', rate: 0.05 },
    { name: 'Oversized Army Green Hoodie', rarity: 'Premium', rate: 0.15 },
    { name: 'Adidas VL Court 3.0', rarity: 'Premium', rate: 0.15 },
    { name: 'Boxy-Fit Sweatshirt', rarity: 'Standard', rate: 0.20 },
    { name: 'Parachute Cargo Pants', rarity: 'Standard', rate: 0.20 },
    { name: 'Buffalo Bacon Pizza Slice', rarity: 'Provisions', rate: 0.10 },
    { name: 'Iced Matcha Latte', rarity: 'Provisions', rate: 0.15 }
];

async function completeHabitQuest(habitName) {
    userCurrency += 50; 
    localStorage.setItem('currency', userCurrency);
    document.getElementById('credit-display').innerText = userCurrency;

    const systemPrompt = "You are an Urban Drop Coordinator. A user just completed a daily task. Keep the response to 2 short sentences, praising their hustle and letting them know credits have been wired to their account.";
    const userPrompt = `Task completed: ${habitName}.`;
    
    const questLog = document.getElementById('quest-log');
    if (questLog) questLog.innerText = "Coordinator is typing...";
    
    const aiResponse = await askLocalAI(systemPrompt, userPrompt);
    if (questLog) questLog.innerText = aiResponse;
}

function executeGoodsDrop() {
    if (userCurrency < 100) return alert("Insufficient credits. Complete more tasks!");
    userCurrency -= 100;
    localStorage.setItem('currency', userCurrency);
    document.getElementById('credit-display').innerText = userCurrency;

    const roll = Math.random();
    let cumulativeRate = 0;
    let pulledItem = GOODS_POOL[GOODS_POOL.length - 1]; 

    for (const item of GOODS_POOL) {
        cumulativeRate += item.rate;
        if (roll <= cumulativeRate) {
            pulledItem = item;
            break;
        }
    }
    alert(`📦 DROP SECURED: You received [${pulledItem.rarity}] ${pulledItem.name}!`);
}

// ============================================================================
// FEATURE 2: HEATMAP & WEEKLY TACTICAL DEBRIEF (NEW)
// ============================================================================
// Initialize a mock 28-day history if it doesn't exist
let habitHistory = JSON.parse(localStorage.getItem('habitHistory'));
if (!habitHistory || habitHistory.length < 28) {
    // Generate 28 random days to make the heatmap look good for the demo
    habitHistory = Array.from({length: 28}, () => Math.random() > 0.4 ? 1 : 0);
    // Make sure today (the last day) is 0 initially
    habitHistory[27] = 0; 
    localStorage.setItem('habitHistory', JSON.stringify(habitHistory));
}

function renderHeatmap() {
    const grid = document.getElementById('heatmap');
    if (!grid) return;
    grid.innerHTML = '';
    habitHistory.forEach(status => {
        const cell = document.createElement('div');
        cell.className = `heatmap-cell ${status === 1 ? 'active' : ''}`;
        grid.appendChild(cell);
    });
}

function updateTodayHeatmap() {
    habitHistory[27] = 1; // Mark the last day (today) as active
    localStorage.setItem('habitHistory', JSON.stringify(habitHistory));
    renderHeatmap();
}

async function requestTacticalDebrief() {
    const output = document.getElementById('debrief-output');
    output.innerText = "Analyzing 7-day tactical history...";
    
    const recent7Days = habitHistory.slice(-7);
    const completedCount = recent7Days.filter(day => day === 1).length;
    
    const systemPrompt = "You are a strict, analytical AI performance coach. Provide a harsh but fair tactical debrief based on the data provided. Keep it to exactly 3 sentences.";
    const userPrompt = `Over the last 7 days, my task completion array was [${recent7Days.join(', ')}] (1=completed, 0=missed). Total completed: ${completedCount}/7. Analyze my consistency.`;
    
    const response = await askLocalAI(systemPrompt, userPrompt);
    output.innerText = response;
}

// ============================================================================
// FEATURE 3: DYNAMIC CHALLENGING TASKS (NEW)
// ============================================================================
async function generateChallengingTask() {
    const btn = document.getElementById('challenge-btn');
    btn.innerText = "🔥 Generating...";
    
    // Scrape existing tasks to give the AI context
    const existingTasks = Array.from(document.querySelectorAll('.task-text'))
                               .map(span => span.textContent)
                               .join(', ');
    
    const context = existingTasks ? existingTasks : "general productivity";
    
    const systemPrompt = "You are a hardcore productivity AI. Based on the user's current tasks, generate ONE highly challenging, specific 1-day task to push their limits. Make it sound like a military objective. Output ONLY the task text, nothing else.";
    const userPrompt = `Current tasks: ${context}. Give me a boss-level challenge.`;
    
    const bossTask = await askLocalAI(systemPrompt, userPrompt);
    
    // Inject it directly into the input and trigger the add function
    const input = document.getElementById('habit-input');
    input.value = "🔥 CHALLENGE: " + bossTask.replace(/["']/g, ""); // Clean up any quotes
    addHabit();
    
    btn.innerText = "🔥 Generate Challenging Task";
}

// ============================================================================
// FEATURE 4: MASTER TEACHING PROTOCOL GENERATOR
// ============================================================================
async function generateStudyProtocol(rawText) {
    const outputField = document.getElementById('protocol-output');
    if (outputField) outputField.innerText = "Processing fundamental mechanics...";
    
    const systemPrompt = `You are an elite academic assistant. Break the user's raw text strictly into:
        1. Fundamental Mechanics
        2. Architectural Derivations
        Keep the output concise and highly technical.`;
    
    const structuredNotes = await askLocalAI(systemPrompt, rawText);
    if (outputField) outputField.innerText = " " + structuredNotes;
}

// ============================================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================================
document.getElementById('pull-btn')?.addEventListener('click', executeGoodsDrop);
document.getElementById('debrief-btn')?.addEventListener('click', requestTacticalDebrief);
document.getElementById('challenge-btn')?.addEventListener('click', generateChallengingTask);
document.getElementById('process-notes-btn')?.addEventListener('click', () => {
    const rawData = document.getElementById('raw-notes-input')?.value || "";
    generateStudyProtocol(rawData);
});

window.addEventListener('load', () => {
    renderHeatmap();
    // Re-run your existing anomaly check from the previous logic
    const missedCount = habitHistory.slice(-3).filter(status => status === 0).length;
    if (missedCount >= 2) {
        askLocalAI("You are a motivational AI.", "The user missed 2 of their last 3 days. Write a short 1-sentence urgent push.")
            .then(msg => alert(`🚨 Streak Anomaly Detected: ${msg}`));
    }
});