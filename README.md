# GIDE-Hackathon

Offline-first PWA built in GIDE. Two apps share one dark "Intel Lab" theme:

- **`index.html`** — Offline Habit Armor (gamified habit tracker + local AI coach).
- **`doc-qa.html`** — **Grounded Doc Q&A**: drop in a PDF, ask a question, get an
  answer with the **exact source passage highlighted** and a page number. Fully
  offline — PDF parsing, embeddings, retrieval, and answer generation all run on
  `localhost`. Nothing leaves the machine.

## Run it

Everything runs locally. You need [Ollama](https://ollama.com) with two models pulled once:

```bash
ollama pull nomic-embed-text     # embeddings (~274 MB)
ollama pull llama3.1:8b          # answer generation / document analysis (~4.9 GB)
ollama serve                     # starts the local engine on http://localhost:11434
```

(The habit tracker `index.html` separately uses `qwen2.5-coder:7b`; pull it too if you want that page.)

Then serve the folder from its root and open the page:

```bash
python3 -m http.server 8000
# open http://localhost:8000/doc-qa.html
```

## Prove it's offline

1. Open `doc-qa.html` and click **Run offline self-test** → returns a 768-dim vector
   from the local embeddings endpoint (no cloud).
2. Turn wifi **off** (loopback keeps working), upload a PDF, ask a question.
3. The answer appears with the cited passage highlighted and its page number —
   verifiable by opening the PDF yourself.

## How it works (pipeline)

`PDF → pdf.js (vendored, local) → per-page chunks → local embeddings →
  • small docs:  feed the WHOLE document (with page markers) → local model analyzes it
  • large docs:  cosine top-K retrieval → most relevant passages → local model
→ grounded answer (temperature 0, cites page numbers) + the matching passage highlighted`

Small documents (≤ ~24k chars, controlled by `WHOLE_DOC_CHAR_BUDGET` in `doc-qa.js`) are sent in
full so the model can actually summarize/analyze/cross-reference rather than seeing only 3 snippets.
Embedding retrieval still runs to power the verifiable highlighted citations. The vector store is a
plain in-memory JS array (`{text, embedding, page, charStart, charEnd}`), persisted to IndexedDB so
an indexed document survives a reload. `pdf.js` is vendored in `vendor/` (not a CDN) so parsing works
with the network disabled.

## Config

Model names live at the top of `doc-qa.js` (`EMBED_MODEL`, `CHAT_MODEL`) — change them
there to swap models. Known limitation: text-based PDFs only (no OCR for scanned images).
