// Global State
const state = {
    questions: [],
    sections: [],
    responses: {},
    status: {},
    timeLog: {},
    currentQIndex: 0,
    startTime: null,
    examStartTime: null,
    totalDuration: 0,
    timerInterval: null
};

// DOM Elements
const screens = {
    start: document.getElementById('start-screen'),
    exam: document.getElementById('exam-screen'),
    result: document.getElementById('result-screen'),
    admin: document.getElementById('admin-screen')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch Config
    try {
        const res = await fetch('/api/exam-config');
        const data = await res.json();

        // Store data simply
        processData(data);

        // Render Admin List
        renderAdminQuestionList(data.sections);
    } catch (e) {
        console.error("Failed to load config", e);
    }

    // Event Listeners
    // Start Screen
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', () => startExam(true));

    const adminBtn = document.getElementById('admin-panel-btn');
    if (adminBtn) adminBtn.addEventListener('click', () => switchScreen('admin'));

    // Admin Screen
    const backBtn = document.getElementById('back-home-btn');
    if (backBtn) backBtn.addEventListener('click', () => switchScreen('start'));

    const startAdminBtn = document.getElementById('start-exam-admin-btn');
    if (startAdminBtn) startAdminBtn.addEventListener('click', () => startExam(false));

    // Exam Screen
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.addEventListener('click', () => navigate(1));

    const prevBtn = document.getElementById('prev-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => navigate(-1));

    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearResponse);

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', submitExam);

    const markCheck = document.getElementById('mark-review-check');
    if (markCheck) markCheck.addEventListener('change', toggleMark);

    // Result Screen
    const pdfBtn = document.getElementById('download-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', downloadPDF);
});

function processData(data) {
    let qFlat = [];
    data.sections.forEach(sec => {
        sec.questions.forEach(q => {
            qFlat.push({ ...q, section: sec.name });
            if (!state.timeLog[q.id]) state.timeLog[q.id] = 0;
            if (!state.status[q.id]) state.status[q.id] = 'not_visited';
        });
    });

    state.questions = qFlat;
    state.sections = data.sections;
    state.totalDuration = data.durationSeconds;

    const totalQEl = document.getElementById('start-total-q');
    if (totalQEl) totalQEl.textContent = state.questions.length;

    const durationEl = document.getElementById('start-duration');
    if (durationEl) durationEl.textContent = Math.floor(state.totalDuration / 60) + ' min';

    // Admin Inputs
    const adminTotal = document.getElementById('admin-total-q');
    if (adminTotal) adminTotal.textContent = state.questions.length;

    const adminDur = document.getElementById('admin-duration');
    if (adminDur) adminDur.value = Math.floor(state.totalDuration / 60);
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (screens[screenName]) screens[screenName].classList.add('active');
}

function startExam(useDefaultTime) {
    // Override duration if from Admin
    if (!useDefaultTime) {
        const adminDur = document.getElementById('admin-duration');
        if (adminDur) {
            const mins = parseInt(adminDur.value, 10);
            state.totalDuration = mins * 60;
        }
    }

    switchScreen('exam');
    state.examStartTime = Date.now();
    state.currentQIndex = 0;

    startTimer(state.totalDuration);
    renderPalette();
    loadQuestion(0);
}

// Timer Logic
function startTimer(duration) {
    let timer = duration;
    const display = document.getElementById('timer');
    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
        const h = Math.floor(timer / 3600);
        const m = Math.floor((timer % 3600) / 60);
        const s = timer % 60;

        if (display) {
            display.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (timer < 300) display.classList.add('warning');
            else display.classList.remove('warning');
        }

        const currentQ = state.questions[state.currentQIndex];
        if (currentQ) {
            state.timeLog[currentQ.id] = (state.timeLog[currentQ.id] || 0) + 1;
        }

        if (--timer < 0) {
            clearInterval(state.timerInterval);
            alert("Time's up! Submitting exam.");
            submitExam();
        }
    }, 1000);
}

// Navigation & rendering
function loadQuestion(index) {
    if (index < 0 || index >= state.questions.length) return;

    state.currentQIndex = index;
    const q = state.questions[index];

    if (state.status[q.id] === 'not_visited') {
        state.status[q.id] = 'visited';
    }
    updatePaletteStatus(q.id);

    const qNum = document.getElementById('question-number');
    if (qNum) qNum.textContent = `Q${index + 1}`;

    const qText = document.getElementById('q-text');
    if (qText) qText.textContent = q.text;

    const secName = document.getElementById('section-name');
    if (secName) secName.textContent = q.section;

    const container = document.getElementById('options-container');
    if (container) {
        container.innerHTML = '';
        q.options.forEach(opt => {
            const el = document.createElement('div');
            el.className = `option-card ${state.responses[q.id] === opt.id ? 'selected' : ''}`;
            el.innerHTML = `<div class="option-id">${opt.id}</div> <div>${opt.text}</div>`;
            el.onclick = () => selectOption(q.id, opt.id);
            container.appendChild(el);
        });
    }

    const markBox = document.getElementById('mark-review-check');
    if (markBox) markBox.checked = state.status[q.id].includes('marked');

    const prevBtn = document.getElementById('prev-btn');
    if (prevBtn) prevBtn.disabled = index === 0;

    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.textContent = index === state.questions.length - 1 ? 'Finish Section' : 'Save & Next';

    document.querySelectorAll('.p-item').forEach(el => el.classList.remove('current'));
    const pItem = document.querySelector(`.p-item[data-qid="${q.id}"]`);
    if (pItem) {
        pItem.classList.add('current');
        pItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function selectOption(qId, optId) {
    state.responses[qId] = optId;
    state.status[qId] = 'answered';
    loadQuestion(state.currentQIndex);
    updatePaletteStatus(qId);
}

function clearResponse() {
    const q = state.questions[state.currentQIndex];
    delete state.responses[q.id];
    state.status[q.id] = 'visited';
    loadQuestion(state.currentQIndex);
    updatePaletteStatus(q.id);
}

function toggleMark(e) {
    const q = state.questions[state.currentQIndex];
    const isMarked = e.target.checked;
    const hasAnswer = !!state.responses[q.id];

    if (isMarked) {
        state.status[q.id] = hasAnswer ? 'marked_answered' : 'marked';
    } else {
        state.status[q.id] = hasAnswer ? 'answered' : 'visited';
    }
    updatePaletteStatus(q.id);
}

function navigate(dir) {
    loadQuestion(state.currentQIndex + dir);
}

function renderPalette() {
    const container = document.getElementById('palette-container');
    if (!container) return;
    container.innerHTML = '';

    // Group by section logic or flattened, let's keep flattened for sidebar
    // but maybe add separators if we want, but sticking to simple grid for now
    state.questions.forEach((q, idx) => {
        const btn = document.createElement('div');
        btn.className = 'p-item';
        btn.textContent = idx + 1;
        btn.dataset.qid = q.id;
        btn.dataset.idx = idx;
        btn.title = q.section;
        btn.onclick = () => loadQuestion(parseInt(btn.dataset.idx));
        container.appendChild(btn);
    });
}

function updatePaletteStatus(qId) {
    const el = document.querySelector(`.p-item[data-qid="${qId}"]`);
    if (!el) return;

    el.className = 'p-item';
    if (state.currentQIndex === parseInt(el.dataset.idx)) el.classList.add('current');

    const st = state.status[qId];
    if (st === 'answered') el.classList.add('answered');
    else if (st === 'marked') el.classList.add('marked');
    else if (st === 'marked_answered') el.classList.add('marked-answered');
    else if (st === 'visited') el.classList.add('not-answered');
    else el.classList.add('not-visit');
}

// Submission
async function submitExam() {
    if (!confirm("Are you sure you want to submit?")) return;
    clearInterval(state.timerInterval);

    const payload = {
        responses: state.responses,
        timeLog: state.timeLog
    };

    try {
        const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const analytics = await res.json();
        showResults(analytics);
    } catch (e) {
        alert("Submission failed!");
        console.error(e);
    }
}

function showResults(data) {
    switchScreen('result');

    // Questions Correct Count
    const tScore = document.getElementById('total-score');
    if (tScore) tScore.textContent = data.correctCount;

    const mScore = document.getElementById('max-score');
    if (mScore) mScore.textContent = data.totalQuestions;

    // Net Score (+4/-1)
    const netVal = document.getElementById('net-score-val');
    if (netVal) netVal.textContent = data.netScore;

    const maxPoss = document.getElementById('max-possible-score');
    if (maxPoss) maxPoss.textContent = data.maxPossibleScore;

    // New Stats
    const stAns = document.getElementById('stats-answered');
    if (stAns) stAns.textContent = data.countAnswered;

    const stMis = document.getElementById('stats-missed');
    if (stMis) stMis.textContent = data.countMissed;

    // Update PDF Date/Score
    const pdfDate = document.getElementById('pdf-date');
    if (pdfDate) pdfDate.textContent = new Date().toLocaleString();

    const pdfScore = document.getElementById('pdf-score');
    if (pdfScore) pdfScore.textContent = `${data.correctCount}/${data.totalQuestions} Correct | Net Score: ${data.netScore} / ${data.maxPossibleScore}`;

    // Statistics
    const grid = document.getElementById('analytics-grid');
    if (grid) {
        grid.innerHTML = '';
        data.sections.forEach(sec => {
            const card = document.createElement('div');
            card.className = 'stat-card';

            // Calculate extended metrics
            const avgTime = sec.total > 0 ? (sec.timeTaken / sec.total).toFixed(1) : "0.0";
            const accuracy = sec.total > 0 ? Math.round((sec.correct / sec.total) * 100) : 0;

            card.innerHTML = `
                <h4>${sec.name}</h4>
                <div class="val">${sec.correct}/${sec.total} <span style="font-size:0.5em; color:var(--text-muted)">(${accuracy}%)</span></div>
                <div class="sub">Points: <span style="color:${sec.score >= 0 ? 'var(--status-answer)' : 'var(--status-not-answer)'}">${sec.score > 0 ? '+' : ''}${sec.score}</span></div>
                <div class="sub">Avg Time/Q: ${avgTime}s</div>
            `;
            grid.appendChild(card);
        });
    }

    renderReviewList(data.questionAnalysis);
}

function renderReviewList(questions) {
    const list = document.getElementById('review-list');
    if (!list) return;
    list.innerHTML = '';

    questions.forEach(q => {
        const item = document.createElement('div');
        item.className = `review-item ${q.status}`;

        let optionsHtml = '';
        q.options.forEach(opt => {
            let classes = 'review-opt';
            // Correct and User Selected logic coloring
            if (opt.id === q.correctAnswer) classes += ' is-correct';
            if (opt.id === q.userAnswer) classes += ' user-selected';

            optionsHtml += `<div class="${classes}">
                <b>${opt.id}.</b> ${opt.text}
            </div>`;
        });

        // Removed Time Badge as per user request
        item.innerHTML = `
            <div class="review-meta">
                <span>${q.section}</span>
            </div>
            <div class="review-q">Q${q.id}. ${q.text}</div>
            <div class="review-opts">${optionsHtml}</div>
        `;
        list.appendChild(item);
    });
}

// Admin Display
function renderAdminQuestionList(sections) {
    const list = document.getElementById('admin-q-list');
    if (!list) return;
    list.innerHTML = '';

    sections.forEach(sec => {
        sec.questions.forEach(q => {
            const el = document.createElement('div');
            el.className = 'list-q-item';
            el.innerHTML = `
                <div class="list-q-txt">[${sec.name}] ${q.text}</div>
                ${q.options.map(o => `<div class="list-opt">- ${o.id}) ${o.text}</div>`).join('')}
            `;
            list.appendChild(el);
        });
    });
}

// PDF Generation
function downloadPDF() {
    const element = document.getElementById('pdf-content-area');
    if (!element) return; // Ensure element exists before querying its children
    const header = element.querySelector('.pdf-header');

    // Apply compact mode
    element.classList.add('pdf-mode');
    if (header) header.style.display = 'block';

    const opt = {
        margin: 0.3, // Reduced margin
        filename: 'exam-result.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } // Better page break handling
    };

    html2pdf().set(opt).from(element).save().then(() => {
        // Cleanup
        if (header) header.style.display = 'none';
        element.classList.remove('pdf-mode');
    });
}
