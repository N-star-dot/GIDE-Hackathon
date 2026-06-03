const habitInput = document.getElementById('habit-input');
const addBtn = document.getElementById('add-btn');
const habitList = document.getElementById('habit-list');

// Load habits from LocalStorage on startup
let habits = JSON.parse(localStorage.getItem('habits')) || [];

function renderHabits() {
    habitList.innerHTML = '';
    habits.forEach((habit, index) => {
        const li = document.createElement('li');
        li.textContent = habit;
        li.addEventListener('click', () => deleteHabit(index));
        habitList.appendChild(li);
    });
}

function addHabit() {
    const text = habitInput.value.trim();
    if (text) {
        habits.push(text);
        localStorage.setItem('habits', JSON.stringify(habits));
        renderHabits();
        habitInput.value = '';
    }
}

function deleteHabit(index) {
    habits.splice(index, 1);
    localStorage.setItem('habits', JSON.stringify(habits));
    renderHabits();
}

addBtn.addEventListener('click', addHabit);
renderHabits();