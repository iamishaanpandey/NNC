# NeuraNote: AI-Powered Document Intelligence

![React](https://img.shields.io/badge/React-UI-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)
![Generative AI](https://img.shields.io/badge/Generative%20AI-Groq%20LLMs-purple)

## 📌 Project Overview
NeuraNote is an advanced, AI-driven notes digitization solution designed to bridge the gap between physical meetings and enterprise CRM systems. It eliminates administrative bottlenecks by automatically capturing, transcribing, and structuring free-form diary notes and whiteboard discussions into highly organized, searchable digital records.

## 🚀 Key Features
* **Multi-Modal Input:** Upload images via drag-and-drop, capture whiteboards live via webcam, or paste raw text. Includes multi-image merging for long meeting sessions.
* **High-Speed AI Inference:** Powered by Groq's LPU architecture, utilizing `llama-3.2-11b-vision-preview` for complex OCR and high-parameter NLP models for parsing business context.
* **Offline-First Storage:** Utilizes a local SQLite database for strict data privacy and offline history tracking, categorizing files hierarchically.
* **One-Click Export & CRM Integration:** Instantly generate corporate-branded PDFs, export structured CSVs for bulk CRM uploads, or draft automated emails via native Outlook COM integration.

## 🛠️ Tech Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui
* **Backend:** Python, FastAPI, SQLite, Pandas, FPDF
* **AI Engine:** Groq API (Vision & Text LLMs)
* **Packaging:** PyWebView, PyInstaller (Standalone Windows Executable)

## 💻 Installation & Local Development

### 1. Prerequisites
* **Node.js** (v18+)
* **Python** (3.10+)
* *Note: Windows OS is recommended for native Outlook email integration capabilities.*

### 2. Clone the Repository
```bash
git clone [https://github.com/your-username/neuranote.git](https://github.com/your-username/neuranote.git)
cd neuranote
