// ============================================================================
//  Grounded Doc Q&A — fully offline pipeline
//  PDF -> chunk -> local embeddings -> cosine retrieval -> local grounded answer
//  All inference via http://localhost:11434 (Ollama). No cloud calls at runtime.
// ============================================================================

// ---- Config -----------------------------------------------------------------
const OLLAMA       = 'http://localhost:11434';
const EMBED_MODEL  = 'nomic-embed-text';
const CHAT_MODEL   = 'llama3.1:8b';               // general instruct model — strong at analyzing prose
const CHARS_PER_TOKEN = 4;                         // rough heuristic
const CHUNK_CHARS   = 500 * CHARS_PER_TOKEN;       // ~500 tokens  -> ~2000 chars
const OVERLAP_CHARS = 50  * CHARS_PER_TOKEN;       // ~50  tokens  -> ~200 chars
const MIN_PAGE_CHARS = 20;                         // skip near-empty / scanned pages
const CITE_K        = 3;                           // passages shown as highlighted citations
const RETRIEVE_K    = 6;                           // passages fed to the model when a doc is too big for whole-doc mode
const NUM_CTX       = 8192;                         // model context window (Ollama defaults to 4096 — too small for whole docs)
const WHOLE_DOC_CHAR_BUDGET = 24000;               // ~6000 tokens: at/below this we feed the ENTIRE document, not just snippets

const SYSTEM_PROMPT =
    'You are a careful document analyst. Answer using ONLY the document text provided by the user. ' +
    'Do not use outside knowledge and never invent facts. ' +
    'If the document does not contain the answer, say you could not find it in the document. ' +
    'Quote exact wording where helpful and cite the page number(s) you used like (p.3). ' +
    'Write a clear, well-structured answer.';

// ---- State ------------------------------------------------------------------
let store = [];      // [{ id, text, page, charStart, charEnd, embedding }]
let pageTexts = {};  // page(number) -> normalized full-page text
let docName = '';
let busy = false;

// ---- Tiny DOM helpers -------------------------------------------------------
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// ============================================================================
//  Local model calls
// ============================================================================
async function embed(text) {
    const r = await fetch(`${OLLAMA}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: text })
    });
    if (!r.ok) throw new Error(`Embeddings HTTP ${r.status}`);
    const d = await r.json();
    if (Array.isArray(d.embedding)) return d.embedding;
    if (Array.isArray(d.embeddings) && Array.isArray(d.embeddings[0])) return d.embeddings[0]; // newer /api/embed shape
    throw new Error('No embedding returned');
}

// Streaming chat so a slow local model never looks frozen. Falls back gracefully.
async function chatStream(system, user, onToken, options) {
    const body = {
        model: CHAT_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        stream: true
    };
    if (options) body.options = options;   // e.g. { temperature: 0, num_ctx: 8192 }
    const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`Chat HTTP ${r.status}`);
    if (!r.body) { // environment without streaming body — read whole thing
        const d = await r.json();
        const full = d.message?.content || '';
        onToken(full);
        return full;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let obj; try { obj = JSON.parse(line); } catch { continue; }
            const tok = obj.message?.content || '';
            if (tok) { full += tok; onToken(full); }
            if (obj.done) return full;
        }
    }
    // flush a trailing object that wasn't newline-terminated (don't drop the last token)
    const tail = buf.trim();
    if (tail) {
        try { const obj = JSON.parse(tail); const tok = obj.message?.content || ''; if (tok) { full += tok; onToken(full); } } catch { /* ignore */ }
    }
    return full;
}

// ============================================================================
//  PDF parsing  (vendored pdf.js — no CDN)
// ============================================================================
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';

async function parsePdf(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const raw = content.items.map((it) => it.str).join(' ');
        const text = raw.replace(/\s+/g, ' ').trim();   // normalize whitespace
        pages.push({ page: p, text });
    }
    return pages;
}

// ============================================================================
//  Chunking — sliding window within each page (keeps page attribution exact)
// ============================================================================
function chunkPage(pageNum, text) {
    const chunks = [];
    if (text.length <= CHUNK_CHARS) {
        chunks.push({ page: pageNum, text, charStart: 0, charEnd: text.length });
        return chunks;
    }
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + CHUNK_CHARS, text.length);
        if (end < text.length) {
            // prefer to break on a sentence/space boundary near the window end
            const slice = text.slice(start, end);
            const brk = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(' '));
            if (brk > CHUNK_CHARS * 0.6) end = start + brk + 1;
        }
        // store the exact slice (no trim) so charStart/charEnd line up perfectly with the highlight
        chunks.push({ page: pageNum, text: text.slice(start, end), charStart: start, charEnd: end });
        if (end >= text.length) break;
        start = Math.max(0, end - OVERLAP_CHARS);
    }
    return chunks;
}

// ============================================================================
//  Indexing pipeline
// ============================================================================
async function indexPdf(file) {
    if (busy) return;
    busy = true;
    setControlsEnabled(false);
    resetSources();
    $('answer-box').textContent = 'Index a document, then ask a question.';
    docName = file.name;
    $('dz-file').textContent = `📎 ${file.name}`;
    setIndexStatus('', false);

    try {
        showProgress(true, 'Parsing PDF…', 0);
        if (file.size === 0) throw new Error('That file is empty.');
        const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (!(head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) { // "%PDF"
            throw new Error('That doesn’t look like a PDF (missing %PDF header).');
        }
        const pages = await parsePdf(await file.arrayBuffer());

        const rawChunks = [];
        let skipped = 0;
        pageTexts = {};
        for (const { page, text } of pages) {
            pageTexts[page] = text;
            if (text.replace(/\s/g, '').length < MIN_PAGE_CHARS) { skipped++; continue; }
            rawChunks.push(...chunkPage(page, text));
        }

        if (rawChunks.length === 0) {
            showProgress(false);
            setIndexStatus(`No extractable text found across ${pages.length} page(s). This looks like a scanned / image-only PDF (no OCR here).`, true);
            return;
        }

        store = [];
        for (let i = 0; i < rawChunks.length; i++) {
            showProgress(true, `Embedding ${i + 1} / ${rawChunks.length} chunks…`, (i / rawChunks.length) * 100);
            const embedding = await embed(rawChunks[i].text);
            store.push({ id: i, ...rawChunks[i], embedding });
        }
        showProgress(true, 'Done', 100);
        setTimeout(() => showProgress(false), 400);

        const note = skipped ? ` (${skipped} empty/scanned page${skipped > 1 ? 's' : ''} skipped)` : '';
        setIndexStatus(`✅ Indexed ${store.length} chunks from ${pages.length} pages${note}.`, false);
        setControlsEnabled(true);
        $('question-input').focus();
        persist();
    } catch (err) {
        console.error(err);
        showProgress(false);
        if (isModelUnreachable(err)) {
            setIndexStatus('⚠️ Local model engine not responding. Start it with "ollama serve" and ensure ' + EMBED_MODEL + ' is pulled.', true);
        } else {
            setIndexStatus('⚠️ Could not index this PDF: ' + err.message, true);
        }
    } finally {
        busy = false;
    }
}

// ============================================================================
//  Retrieval + grounded answer
// ============================================================================
function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function docCharCount() {
    return Object.values(pageTexts).reduce((n, t) => n + (t ? t.length : 0), 0);
}

// The entire document with page markers — used when the doc is small enough to analyze whole.
function wholeDocContext() {
    return Object.keys(pageTexts)
        .map(Number).sort((a, b) => a - b)
        .filter((p) => pageTexts[p])
        .map((p) => `[Page ${p}]\n${pageTexts[p]}`)
        .join('\n\n');
}

async function ask(question) {
    if (busy || !question.trim()) return;
    if (store.length === 0) { setIndexStatus('Index a document first.', true); return; }
    busy = true;
    setControlsEnabled(false, /*keepText*/ true);
    const ans = $('answer-box');
    ans.classList.remove('err');
    ans.classList.add('thinking');
    ans.textContent = 'Embedding question & retrieving sources…';

    try {
        // Always retrieve for the citation panel (verifiable, highlighted passages).
        const qEmb = await embed(question);
        const ranked = store
            .map((c) => ({ c, score: cosine(qEmb, c.embedding) }))
            .sort((a, b) => b.score - a.score);
        renderCitations(ranked.slice(0, CITE_K));

        // Decide how much of the document to give the model.
        // Small docs: feed the WHOLE document so it can truly analyze it.
        // Large docs: fall back to the most relevant passages.
        const pageCount = Object.keys(pageTexts).length;
        const wholeDoc = docCharCount() <= WHOLE_DOC_CHAR_BUDGET;

        let context, mode;
        if (wholeDoc) {
            context = wholeDocContext();
            mode = `🧠 Analyzing the full document (${pageCount} page${pageCount > 1 ? 's' : ''}).`;
        } else {
            const top = ranked.slice(0, RETRIEVE_K);
            context = top.map((r) => `[Page ${r.c.page}]\n${r.c.text}`).join('\n\n');
            mode = `🔎 Large document — answering from the ${top.length} most relevant passages.`;
        }
        setModeNote(mode);

        const userPrompt =
            `DOCUMENT:\n${context}\n\n` +
            `QUESTION: ${question}\n\n` +
            `Answer the question using only the document above. Cite the page number(s) you used like (p.3). ` +
            `If the document does not contain the answer, say you could not find it in the document.`;

        ans.classList.remove('thinking');
        ans.textContent = '';
        await chatStream(SYSTEM_PROMPT, userPrompt, (full) => { ans.innerHTML = renderAnswer(full); },
            { temperature: 0, num_ctx: NUM_CTX });
    } catch (err) {
        console.error(err);
        ans.classList.remove('thinking');
        ans.classList.add('err');
        if (isModelUnreachable(err)) {
            ans.textContent = '⚠️ Local model engine not responding. Make sure Ollama is running and "' + CHAT_MODEL + '" is pulled, then ask again.';
        } else {
            ans.textContent = '⚠️ Something went wrong generating the answer: ' + err.message;
        }
    } finally {
        busy = false;
        setControlsEnabled(true, true);
    }
}

// Lightly format the answer: highlight (p.N) and [N] citation references.
function renderAnswer(text) {
    return esc(text)
        .replace(/\(p\.?\s*(\d+)\)/gi, '<span class="cite-ref">(p.$1)</span>')
        .replace(/\[(\d+)\]/g, '<span class="cite-ref">[$1]</span>');
}

// ============================================================================
//  Citation rendering — show the exact retrieved passage, page, and highlight
// ============================================================================
function renderCitations(ranked) {
    const el = $('citations');
    if (!ranked.length) { resetSources(); return; }
    el.innerHTML = '';
    ranked.forEach((r, i) => {
        const div = document.createElement('div');
        div.className = 'cite';
        div.innerHTML =
            `<div class="cite-head">
                <span class="cite-page">[${i + 1}] · page ${r.c.page}</span>
                <span class="cite-score">similarity ${r.score.toFixed(3)}</span>
             </div>
             <div class="cite-snippet">${highlightInPage(r.c)}</div>`;
        el.appendChild(div);
    });
}

// Render a window of the source page with the retrieved passage <mark>ed.
function highlightInPage(chunk) {
    const full = pageTexts[chunk.page] || chunk.text;
    const ctx = 280;
    const s = Math.max(0, chunk.charStart - ctx);
    const e = Math.min(full.length, chunk.charEnd + ctx);
    const before = esc(full.slice(s, chunk.charStart));
    const hit    = esc(full.slice(chunk.charStart, chunk.charEnd)) || esc(chunk.text);
    const after  = esc(full.slice(chunk.charEnd, e));
    const lead = s > 0 ? '<span class="cite-ellipsis">… </span>' : '';
    const tail = e < full.length ? '<span class="cite-ellipsis"> …</span>' : '';
    return `${lead}${before}<mark>${hit}</mark>${after}${tail}`;
}

function resetSources() {
    $('citations').innerHTML = '<div class="empty-state">Sources will appear here after you ask a question.</div>';
}

// ============================================================================
//  UI state helpers
// ============================================================================
function setControlsEnabled(on, keepText) {
    $('question-input').disabled = !on;
    $('ask-btn').disabled = !on;
    if (on && !keepText) $('question-input').value = $('question-input').value;
}
function showProgress(show, label, pct) {
    $('index-progress').hidden = !show;
    if (label != null) $('progress-label').textContent = label;
    if (pct != null) $('progress-bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function setIndexStatus(msg, isErr) {
    const el = $('index-status');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
}
function setModeNote(msg) {
    const el = $('mode-note');
    if (el) el.textContent = msg || '';
}
function isModelUnreachable(err) {
    return err instanceof TypeError || /Failed to fetch|NetworkError|HTTP 5\d\d/.test(err.message || '');
}

// ============================================================================
//  Phase 0 self-test + model readiness pills
// ============================================================================
async function checkModels() {
    try {
        const r = await fetch(`${OLLAMA}/api/tags`);
        const d = await r.json();
        const names = (d.models || []).map((m) => m.name);
        const has = (base) => names.some((n) => n === base || n.startsWith(base + ':') || n.startsWith(base));
        setPill('embed-pill', has(EMBED_MODEL), `embeddings: ${EMBED_MODEL}`);
        setPill('chat-pill', has(CHAT_MODEL.split(':')[0]), `chat: ${CHAT_MODEL}`);
    } catch {
        setPill('embed-pill', false, 'embeddings: offline?');
        setPill('chat-pill', false, 'chat: offline?');
    }
}
function setPill(id, ok, label) {
    const el = $(id);
    el.textContent = (ok ? '✓ ' : '× ') + label;
    el.className = 'pill ' + (ok ? 'pill-green' : 'pill-red');
}

async function selfTest() {
    const out = $('selftest-out');
    out.hidden = false;
    out.textContent = 'Calling local embeddings endpoint…';
    const t0 = performance.now();
    try {
        const v = await embed('hello world');
        const ms = Math.round(performance.now() - t0);
        out.textContent =
            `✅ OFFLINE EMBEDDINGS OK\n` +
            `   endpoint : ${OLLAMA}/api/embeddings  (127.0.0.1 — local only)\n` +
            `   model    : ${EMBED_MODEL}\n` +
            `   vector   : ${v.length} dims  ·  ${ms} ms\n` +
            `   sample   : [${v.slice(0, 3).map((x) => x.toFixed(4)).join(', ')} …]\n` +
            `\nNo network required — turn wifi off and run this again.`;
        try { localStorage.setItem('docqa_selftest', JSON.stringify({ ok: true, dims: v.length, at: Date.now() })); } catch {}
    } catch (err) {
        out.textContent =
            `❌ Local embeddings unreachable.\n   ${err.message}\n\n` +
            `Start the engine:  ollama serve\nPull the model:    ollama pull ${EMBED_MODEL}`;
    }
}

// ============================================================================
//  IndexedDB persistence (survives reload, fully offline)
// ============================================================================
const DB_NAME = 'docqa', STORE_NAME = 'docs';
function idbOpen() {
    return new Promise((res, rej) => {
        const rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore(STORE_NAME);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    });
}
async function persist() {
    try {
        const db = await idbOpen();
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ docName, store, pageTexts }, 'current');
    } catch (e) { console.warn('persist failed (non-fatal):', e); }
}
async function restore() {
    try {
        const db = await idbOpen();
        const rq = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('current');
        return await new Promise((res) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
    } catch { return null; }
}

// ============================================================================
//  Wiring
// ============================================================================
function setNetPill() {
    const el = $('net-pill');
    if (navigator.onLine) { el.textContent = '● LOCAL'; el.className = 'pill pill-green'; el.title = 'Online — but answers stay local'; }
    else                  { el.textContent = '🔒 OFFLINE'; el.className = 'pill pill-amber'; el.title = 'Network disabled — still fully functional'; }
}

function wire() {
    const input = $('pdf-input');
    const dz = $('dropzone');

    input.addEventListener('change', (e) => { if (e.target.files[0]) indexPdf(e.target.files[0]); });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
    dz.addEventListener('drop', (e) => {
        const f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') indexPdf(f);
        else setIndexStatus('Please drop a PDF file.', true);
    });

    $('ask-btn').addEventListener('click', () => ask($('question-input').value));
    $('question-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') ask($('question-input').value); });
    $('selftest-btn').addEventListener('click', selfTest);

    window.addEventListener('online', setNetPill);
    window.addEventListener('offline', setNetPill);
    setNetPill();
    checkModels();

    // Surface a previously-passed offline self-test so the proof survives a reload
    try {
        const st = JSON.parse(localStorage.getItem('docqa_selftest') || 'null');
        if (st && st.ok) {
            const out = $('selftest-out');
            out.hidden = false;
            out.textContent = `✓ Offline self-test previously passed — ${st.dims}-dim vector, ${new Date(st.at).toLocaleString()}.\nClick “Run offline self-test” to verify live.`;
        }
    } catch {}

    // Offer to restore the last indexed document
    restore().then((saved) => {
        if (saved && saved.store && saved.store.length) {
            store = saved.store; pageTexts = saved.pageTexts || {}; docName = saved.docName || '';
            $('dz-file').textContent = `📎 ${docName} (restored)`;
            setIndexStatus(`✅ Restored ${store.length} chunks from a previous session — ask away.`, false);
            setControlsEnabled(true);
        }
    });
}

document.addEventListener('DOMContentLoaded', wire);
