# GIDE-Hackathon
# ⚡ Offline Habit Armor & Intel Lab

A hardcore, offline-first productivity OS that turns daily discipline into a gamified tactical loop. Designed for developers and operators, this system uses **local Large Language Models (LLMs)** to act as an autonomous, private operating system for your habits—guaranteeing zero latency, zero API costs, and 100% data privacy.

## 🚀 Overview

Traditional habit trackers rely on cloud APIs and simple checkboxes. **Offline Habit Armor** treats productivity as a tactical mission. By integrating a local LLM directly into the browser via vanilla JavaScript, the app provides real-time, in-character feedback, dynamic challenge generation, data digestion, and a weighted Gacha reward system—all running completely offline.

## ✨ Core Features

*   **📝 Dynamic Task Management:** Log daily tasks and check them off to earn credits and log deep-work hours. 
*   **🔥 Boss-Level Challenges:** The AI reads your current task list and generates a highly difficult, military-style objective to push your limits.
*   **📦 Goods & Provisions Drop(reward system):** Spend your earned credits on a weighted RNG loot system to pull for real-world rewards (from an *Iced Matcha Latte* to *Jordan 1 Lows*).
*   **📊 Interactive Tactical Heatmap:** A 28-day visual tracker. Click any cell to log your deep work hours. Watch the matrix-green intensity scale dynamically.
*   **📡 AI Tactical Debriefs:** The AI analyzes your rolling 7-day work volume and delivers a harsh, analytical performance review.
*   **🧠 Master Teaching Lab:** Paste dense documentation, codebase snippets, or academic text, and the AI will strictly format it into fundamental mechanics and architectural derivations.
*   **🚨 Anomaly Detection:** The system silently monitors your 3-day history on load. If you drop your streak, it triggers an urgent background AI alert to break your slump.

## 🛠️ Tech Stack

*   **Frontend:** Pure HTML5, CSS3 (CSS Grid/Flexbox), and Vanilla JavaScript.
*   **State Management:** Browser `localStorage` (No database required).
*   **AI Engine:** [Ollama](https://ollama.com/) (Local HTTP API).
*   **Default Model:** `qwen2.5-coder:7b` (Optimized for coding and logical reasoning).

## ⚙️ Prerequisites & Installation

Because this app relies on local AI, you must have an LLM server running on your machine.

### 1. Install Ollama
Download and install Ollama from [ollama.com](https://ollama.com/).

### 2. Pull the AI Model
Open your terminal and pull the required model (or your model of choice):
```bash
ollama run qwen2.5-coder:7b
