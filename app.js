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
        li.textContent = habitText;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                li.classList.add('completed');
                completeHabitQuest(habitText); // Trigger AI and rewards
            } else {
                li.classList.remove('completed');
            }
        });
        li.prepend(checkbox);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', function() {
            ul.removeChild(li);
        });
        li.appendChild(deleteBtn);

        ul.appendChild(li);
        input.value = '';
    }
} 

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
// FEATURE 2: MASTER TEACHING PROTOCOL GENERATOR
// ============================================================================
async function generateStudyProtocol(rawText) {
    const outputField = document.getElementById('protocol-output');
    if (outputField) outputField.innerText = "Processing fundamental mechanics...";
    
    const systemPrompt = `
        You are an elite academic assistant. The user will provide raw text. 
        You must re-engineer this into a structured Master Teaching Protocol.
        Break the information down strictly into:
        1. Fundamental Mechanics
        2. Architectural Derivations
        Keep the output concise and highly technical.
    `;
    
    const structuredNotes = await askLocalAI(systemPrompt, rawText);
    if (outputField) outputField.innerText = " " + structuredNotes;
}

// ============================================================================
// FEATURE 3: LOCAL ANOMALY DETECTION & INTERVENTION
// ============================================================================
function detectDropoffAnomaly(completionHistory) {
    if (completionHistory.length < 7) return false;
    const recentDays = completionHistory.slice(-3);
    const missedCount = recentDays.filter(status => status === 0).length;
    return missedCount >= 2;
}

async function runInterventionCheck() {
    const history = JSON.parse(localStorage.getItem('habitHistory')) || [1, 1, 1, 0, 1, 0, 0]; 
    
    if (detectDropoffAnomaly(history)) {
        const systemPrompt = "You are a motivational AI. The user is on the verge of breaking their habit streak. Write a short, urgent, but encouraging 1-sentence push to get them to complete their tasks today.";
        const interventionMessage = await askLocalAI(systemPrompt, "The user's completion rate anomaly triggered.");
        alert(`🚨 Streak Anomaly Detected: ${interventionMessage}`);
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
document.getElementById('pull-btn')?.addEventListener('click', executeGoodsDrop);
document.getElementById('process-notes-btn')?.addEventListener('click', () => {
    const rawData = document.getElementById('raw-notes-input')?.value || "";
    generateStudyProtocol(rawData);
});

window.addEventListener('load', runInterventionCheck);