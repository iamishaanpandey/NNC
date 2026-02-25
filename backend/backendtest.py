import sqlite3
import json
import base64
import os
import sys
import threading
import time
import socket
import getpass
import shutil
import traceback
import csv
import io
import pandas as pd
import subprocess
from datetime import datetime
from typing import List, Optional

# GUI Library
import webview

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fpdf import FPDF
import requests
import urllib3
import uvicorn

# --- ENV SETUP ---
os.environ["PYWEBVIEW_CHROMIUM_ARGS"] = "--disable-features=msWebOOUI --use-fake-ui-for-media-stream --disable-notifications --allow-file-access-from-files"

# --- PROXY CONFIGURATION ---
PROXY_URL = "http://gateway.zscaler.net:80"
PROXIES = {"http": PROXY_URL, "https": PROXY_URL}
urllib3.disable_warnings()

# --- OUTLOOK ---
try:
    import win32com.client as win32
    import pythoncom 
    OUTLOOK_AVAILABLE = True
except ImportError:
    OUTLOOK_AVAILABLE = False
    print("WARNING: pywin32 not installed. Outlook features disabled.")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- PORTABLE PATH LOGIC ---
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
    DATA_DIR = os.path.join(os.environ["LOCALAPPDATA"], "ST_NeuraNote")
    EXE_LOCATION = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_DIR = BASE_DIR
    EXE_LOCATION = BASE_DIR

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

# --- VISIBLE REPORTS FOLDER LOGIC ---
REPORTS_DIR = os.path.join(EXE_LOCATION, "reports")
if not os.path.exists(REPORTS_DIR):
    os.makedirs(REPORTS_DIR)

# --- PATHS ---
STATIC_DIR = os.path.join(BASE_DIR, "dist") 
LOGO_PATH = os.path.join(BASE_DIR, "logo.png")
DB_FILE = os.path.join(DATA_DIR, "stm_notes_final.db")
API_KEY_FILE = os.path.join(DATA_DIR, "api_key.txt")
PROMPTS_FILE = os.path.join(DATA_DIR, "saved_prompts.json")
SAVED_NOTES_DIR = os.path.join(DATA_DIR, "saved_notes")

# --- DATABASE ---
def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        if not os.path.exists(SAVED_NOTES_DIR): os.makedirs(SAVED_NOTES_DIR)
        conn = get_db()
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT, created_at TEXT, is_favorite BOOLEAN DEFAULT 0)''')
        try: c.execute("SELECT is_favorite FROM folders LIMIT 1")
        except: c.execute("ALTER TABLE folders ADD COLUMN is_favorite BOOLEAN DEFAULT 0")
        c.execute('''CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, folder_id INTEGER, image_path TEXT, json_data TEXT, created_at TEXT, FOREIGN KEY(folder_id) REFERENCES folders(id))''')
        conn.commit()
        conn.close()
    except Exception as e: print(f"DB Init Error: {e}")

init_db()

# --- UTILS ---
def clean_text(text):
    if isinstance(text, dict): 
        text = ", ".join([f"{k.title()}: {v}" for k, v in text.items()])
    if isinstance(text, list): 
        text = ", ".join(map(str, text))
    if text is None: 
        return "N/A"
    text = str(text)
    text = text.replace('\u20b9', 'Rs.').replace('\u2013', '-').replace('\u2014', '--')
    text = text.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
    return text.encode('latin-1', 'replace').decode('latin-1')

# --- PDF GENERATOR ---
class CorporatePDF(FPDF):
    def header(self):
        if os.path.exists(LOGO_PATH): self.image(LOGO_PATH, 170, 8, 33) 
        self.set_font('Arial', 'B', 24); self.set_text_color(3, 35, 75); self.cell(0, 10, 'Meeting Report', 0, 1, 'L')
        self.set_font('Arial', 'I', 10); self.set_text_color(100, 100, 100); self.cell(0, 10, f'Generated on: {datetime.now().strftime("%B %d, %Y")}', 0, 1, 'L')
        self.set_draw_color(60, 180, 231); self.set_line_width(1); self.line(10, 30, 200, 30); self.ln(10)
    def footer(self):
        self.set_y(-15); self.set_font('Arial', 'I', 8); self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
    def chapter_title(self, label):
        self.set_font('Arial', 'B', 12); self.set_text_color(255, 255, 255); self.set_fill_color(3, 35, 75); self.cell(0, 8, f"  {label.upper()}", 0, 1, 'L', 1); self.ln(4)
    def chapter_body(self, body):
        self.set_font('Arial', '', 11); self.set_text_color(50, 50, 50); self.multi_cell(0, 6, clean_text(body)); self.ln(6)

def build_pdf_data(data, filepath):
    pdf = CorporatePDF()
    pdf.add_page()
    sections = [("Executive Summary", data.get('executive_summary')), ("Customer Info", data.get('customer_information')), ("Product & Specs", data.get('product_details')), ("Pricing", data.get('pricing_information'))]
    for title, content in sections:
        if content:
            pdf.chapter_title(title); pdf.chapter_body(content)
    actions = data.get('action_items')
    if isinstance(actions, list) and actions:
        pdf.chapter_title("Action Items"); pdf.set_font("Arial", '', 11); pdf.set_text_color(50, 50, 50)
        for item in actions:
            pdf.cell(5); pdf.cell(0, 6, f"[ ] {clean_text(item)}", ln=True)
    pdf.output(filepath)

class PDFRequest(BaseModel):
    note_id: int

class EmailRequest(BaseModel):
    note_id: int
    mode: str

class PromptRequest(BaseModel):
    name: str
    content: str

class FavoriteRequest(BaseModel):
    is_favorite: bool

# --- PREMIUM SETUP SCREEN HTML ---
SETUP_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ST NeuraNote</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        body { 
            display: flex; 
            height: 100vh; 
            width: 100vw; 
            overflow: hidden; 
            background: #fff; 
            user-select: none;
        }

        /* --- TITLE BAR (For Dragging & Controls) --- */
        .title-bar {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 32px;
            z-index: 9999;
            display: flex;
            justify-content: flex-end;
            align-items: center;
            background: transparent; /* Invisible but functional */
            -webkit-app-region: drag; /* Makes the div draggable */
        }
        
        .window-controls {
            display: flex;
            -webkit-app-region: no-drag; /* Buttons must be clickable */
        }
        
        .control-btn {
            width: 46px;
            height: 32px;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 14px;
            color: #666;
            cursor: pointer;
            transition: all 0.2s;
        }

        .control-btn:hover { background: #e5e5e5; color: #000; }
        .control-btn.close:hover { background: #E81123; color: white; }
        
        /* Left Side - Branding */
        .brand-section {
            flex: 1.1;
            background: linear-gradient(145deg, #03234B 0%, #00152e 100%);
            color: white;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 80px 60px;
            position: relative;
            overflow: hidden;
        }
        
        /* Subtle abstract tech pattern */
        .brand-section::after {
            content: '';
            position: absolute;
            right: -10%;
            bottom: -10%;
            width: 500px;
            height: 500px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(60, 180, 231, 0.08) 0%, transparent 70%);
            z-index: 1;
        }

        .brand-content { position: relative; z-index: 2; max-width: 520px; }
        h1 { font-size: 3.2rem; font-weight: 700; margin-bottom: 24px; letter-spacing: -0.02em; line-height: 1; }
        .tagline { font-size: 1.25rem; opacity: 0.85; font-weight: 300; margin-bottom: 50px; line-height: 1.5; }
        
        .features { list-style: none; margin-top: 20px;}
        .features li { 
            margin-bottom: 18px; 
            font-size: 1rem; 
            display: flex; 
            align-items: center; 
            opacity: 0.9; 
            font-weight: 400;
        }
        .features li svg { margin-right: 15px; width: 20px; height: 20px; fill: #3CB4E7; }

        /* Right Side - Form */
        .form-section {
            flex: 0.9;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 60px;
            background: #fdfdfd;
        }
        
        .form-card {
            background: white;
            padding: 48px;
            width: 100%;
            max-width: 440px;
            /* No shadow needed for clean look, or very subtle */
        }
        
        .form-header { margin-bottom: 40px; }
        .form-header h2 { color: #03234B; font-size: 1.8rem; margin-bottom: 8px; font-weight: 700; letter-spacing: -0.01em; }
        .form-header p { color: #6b7280; font-size: 0.95rem; line-height: 1.5; }

        .input-group { margin-bottom: 30px; text-align: left; position: relative; }
        .input-group label { 
            display: block; 
            color: #374151; 
            font-weight: 500; 
            margin-bottom: 10px; 
            font-size: 0.9rem; 
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        
        .input-wrapper { position: relative; }
        
        input { 
            width: 100%; 
            padding: 16px 16px 16px 48px; 
            border: 2px solid #e5e7eb; 
            border-radius: 12px; 
            font-size: 1rem; 
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            outline: none;
            background: #fff;
            color: #1f2937;
            font-weight: 500;
        }
        input:focus { 
            border-color: #03234B; 
            box-shadow: 0 0 0 4px rgba(3, 35, 75, 0.1); 
        }
        input::placeholder { color: #9ca3af; font-weight: 400; }
        
        .icon-key { 
            position: absolute; 
            left: 16px; 
            top: 50%; 
            transform: translateY(-50%); 
            color: #9ca3af; 
            font-size: 1.2rem; 
        }

        button {
            width: 100%;
            padding: 18px;
            background: #03234B;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 6px -1px rgba(3, 35, 75, 0.1), 0 2px 4px -1px rgba(3, 35, 75, 0.06);
            letter-spacing: 0.01em;
        }
        button:hover { 
            background: #043675; 
            transform: translateY(-1px); 
            box-shadow: 0 10px 15px -3px rgba(3, 35, 75, 0.1), 0 4px 6px -2px rgba(3, 35, 75, 0.05);
        }
        button:active { transform: translateY(0); }

        .links { margin-top: 30px; text-align: center; font-size: 0.9rem; color: #6b7280; }
        .links a { color: #03234B; text-decoration: none; font-weight: 600; }
        .links a:hover { text-decoration: underline; }

        .error-msg {
            color: #ef4444;
            font-size: 0.85rem;
            margin-top: 12px;
            display: none;
            padding: 12px;
            background: #fef2f2;
            border-radius: 8px;
            border: 1px solid #fee2e2;
            display: none; /* Hidden by default */
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="title-bar">
        <div class="window-controls">
            <div class="control-btn" onclick="pywebview.api.minimize()">&#8212;</div>
            <div class="control-btn close" onclick="pywebview.api.close()">&#10005;</div>
        </div>
    </div>

    <div class="brand-section">
        <div class="brand-content">
            <h1>ST NeuraNote</h1>
            <p class="tagline">The intelligent workspace for modern engineering.</p>
            <ul class="features">
                <li>
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    Automated Meeting Analytics
                </li>
                <li>
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    One-Click Action Item Extraction
                </li>
                <li>
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    Secure Local Data Storage
                </li>
                <li>
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    Instant Corporate PDF Reports
                </li>
            </ul>
        </div>
    </div>
    
    <div class="form-section">
        <div class="form-card">
            <div class="form-header">
                <h2>Welcome Back</h2>
                <p>Please enter your Groq API key to initialize the AI engine.</p>
            </div>
            
            <div class="input-group">
                <label for="apiKey">API Key</label>
                <div class="input-wrapper">
                    <span class="icon-key">🔑</span>
                    <input type="password" id="apiKey" placeholder="gsk_..." spellcheck="false">
                </div>
                <div id="error" class="error-msg">Invalid Key format.</div>
            </div>

            <button onclick="saveKey()" id="actionBtn">Launch Application</button>
            
            <div class="links">
                No key? <a href="https://console.groq.com/keys" target="_blank">Get a free key here</a>
            </div>
        </div>
    </div>

    <script>
        function saveKey() {
            var keyInput = document.getElementById('apiKey');
            var errorMsg = document.getElementById('error');
            var btn = document.getElementById('actionBtn');
            var key = keyInput.value.trim();

            if(key.length < 10 || !key.startsWith('gsk_')) {
                errorMsg.innerText = "Invalid Key. Must start with 'gsk_'";
                errorMsg.style.display = 'block';
                keyInput.style.borderColor = '#ef4444';
                return;
            }

            errorMsg.style.display = 'none';
            keyInput.style.borderColor = '#e5e7eb';
            btn.innerHTML = 'Initializing System...';
            btn.style.opacity = '0.8';
            btn.style.cursor = 'wait';

            // Call Python function
            pywebview.api.save_api_key(key).then(function(response){
                if(response.status === 'success') {
                    btn.innerHTML = 'Success!';
                    btn.style.background = '#059669'; // Green success color
                } else {
                    errorMsg.innerText = response.message;
                    errorMsg.style.display = 'block';
                    btn.innerHTML = 'Launch Application';
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            });
        }
        
        // Allow Enter key to submit
        document.getElementById('apiKey').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                saveKey();
            }
        });
    </script>
</body>
</html>
"""

# --- WINDOW BRIDGE API ---
class WindowAPI:
    def __init__(self, app_url):
        self.app_url = app_url

    def close(self):
        os._exit(0)
    
    def minimize(self):
        if webview.windows:
            webview.windows[0].minimize()
            
    def save_api_key(self, key):
        """Called from the Setup Screen to save the user's key"""
        try:
            with open(API_KEY_FILE, "w") as f:
                f.write(key.strip())
            # Switch the window to the main application
            webview.windows[0].load_url(self.app_url)
            return {"status": "success"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

# --- ENDPOINTS ---
@app.patch("/folders/{folder_id}/favorite")
def toggle_favorite(folder_id: int, req: FavoriteRequest):
    conn = get_db()
    try:
        conn.execute("UPDATE folders SET is_favorite = ? WHERE id = ?", (1 if req.is_favorite else 0, folder_id))
        conn.commit()
        return {"status": "success", "folder_id": folder_id, "is_favorite": req.is_favorite}
    except Exception as e: raise HTTPException(500, f"Database error: {str(e)}")
    finally: conn.close()

@app.get("/user")
def get_system_user():
    try:
        raw = getpass.getuser(); clean = raw.replace(".", " ").replace("_", " ").title()
        return {"username": clean, "role": "System Admin"}
    except: return {"username": "Authorized User", "role": "User"}

@app.get("/folders")
def get_folders():
    conn = get_db(); folders = conn.execute("SELECT * FROM folders ORDER BY created_at DESC").fetchall(); conn.close()
    return {"folders": [dict(f) for f in folders]}

@app.post("/folders")
def create_folder(folder: dict):
    conn = get_db()
    try:
        c = conn.execute("INSERT INTO folders (name, color, created_at) VALUES (?,?,?)", (folder['name'], folder.get('color', '#03234B'), datetime.now().strftime("%Y-%m-%d")))
        conn.commit(); rid = c.lastrowid; conn.close(); return {"id": rid}
    except: raise HTTPException(400, "Exists")

@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int):
    conn = get_db()
    try:
        conn.execute("DELETE FROM notes WHERE folder_id=?", (folder_id,))
        conn.execute("DELETE FROM folders WHERE id=?", (folder_id,))
        conn.commit()
        return {"status": "deleted"}
    finally: conn.close()

@app.get("/all_notes")
def get_all_notes():
    conn = get_db(); notes = conn.execute("SELECT * FROM notes ORDER BY id DESC").fetchall(); conn.close()
    return {"notes": [{"id": n[0], "folder_id": n[1], "data": json.loads(n[3]), "created_at": n[4]} for n in notes]}

@app.get("/notes/{folder_id}")
def get_notes(folder_id: int):
    conn = get_db(); notes = conn.execute("SELECT * FROM notes WHERE folder_id=? ORDER BY id DESC", (folder_id,)).fetchall(); conn.close()
    return {"notes": [{"id": n[0], "folder_id": n[1], "data": json.loads(n[3]), "created_at": n[4]} for n in notes]}

@app.delete("/notes/{note_id}")
def delete_note(note_id: int):
    conn = get_db()
    try:
        cur = conn.execute("SELECT folder_id FROM notes WHERE id=?", (note_id,))
        res = cur.fetchone()
        if not res: return {"status": "error"}
        fid = res[0]
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
        cur = conn.execute("SELECT COUNT(*) FROM notes WHERE folder_id=?", (fid,))
        remaining_count = cur.fetchone()[0]
        if remaining_count == 0:
            conn.execute("DELETE FROM folders WHERE id=?", (fid,))
            print(f"[LOG] Folder {fid} was empty and has been removed.")
        conn.commit()
        return {"status": "deleted"}
    finally: conn.close()

@app.post("/generate_pdf")
def generate_pdf_endpoint(req: PDFRequest):
    conn = get_db(); note = conn.execute("SELECT json_data FROM notes WHERE id=?", (req.note_id,)).fetchone(); conn.close()
    if not note: raise HTTPException(404, "Note not found")
    data = json.loads(note[0])
    title = clean_text(data.get('customer_information'))
    if not title or title == "N/A": title = f"Report_{req.note_id}"
    safe_name = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_')]).strip()
    filename = f"{safe_name}.pdf"; path = os.path.join(REPORTS_DIR, filename)
    try:
        if os.path.exists(path):
            try: os.remove(path)
            except: filename = f"{safe_name}_{int(time.time())}.pdf"; path = os.path.join(REPORTS_DIR, filename)
        build_pdf_data(data, path)
        return {"status": "success", "message": f"Saved to: {path}", "filename": filename}
    except Exception as e: raise HTTPException(500, str(e))

@app.get("/prompts")
def get_prompts():
    if os.path.exists(PROMPTS_FILE):
        with open(PROMPTS_FILE, "r") as f: return json.load(f)
    return {}

@app.post("/prompts")
def save_prompt(req: PromptRequest):
    data = {}
    if os.path.exists(PROMPTS_FILE):
        with open(PROMPTS_FILE, "r") as f: data = json.load(f)
    data[req.name] = req.content
    with open(PROMPTS_FILE, "w") as f: json.dump(data, f)
    return {"status": "saved"}

@app.post("/import_prompts")
async def import_prompts(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        if df.empty: raise HTTPException(400, "Excel file is empty")
        new_prompts = {}
        for _, row in df.iterrows():
            name = str(row.iloc[0]).strip()
            text = str(row.iloc[1]).strip()
            if name and text and name.lower() != "nan": new_prompts[name] = text
        return {"status": "success", "prompts": new_prompts}
    except Exception as e: raise HTTPException(500, f"Error processing Excel: {str(e)}")
    
@app.post("/send_email")
def send_email(req: EmailRequest):
    if not OUTLOOK_AVAILABLE: raise HTTPException(500, "Outlook not available.")
    conn = get_db(); note = conn.execute("SELECT json_data FROM notes WHERE id=?", (req.note_id,)).fetchone(); conn.close()
    if not note: raise HTTPException(404, "Note not found")
    data = json.loads(note[0])
    try:
        pythoncom.CoInitialize()
        outlook = win32.Dispatch('Outlook.Application')
        mail = outlook.CreateItem(0)
        title = clean_text(data.get('customer_information'))
        mail.Subject = f"ST NEURANOTE: Executive Report - {title}"
        body = f"Dear Valued Partner,\n\nPlease find the analyzed meeting report for {title}.\n\n"
        body += f"EXECUTIVE SUMMARY:\n{data.get('executive_summary')}\n\n"
        body += f"PRODUCT DETAILS:\n{data.get('product_details')}\n\n"
        body += f"ACTION ITEMS:\n" + "\n".join([f"- {i}" for i in data.get('action_items', [])])
        body += f"\n\nRegards,\nSent via ST NeuraNote Intelligence System"
        mail.Body = body
        if req.mode == 'pdf':
            safe = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_')]).strip()
            path = os.path.join(REPORTS_DIR, f"{safe}_email_{int(time.time())}.pdf")
            build_pdf_data(data, path)
            mail.Attachments.Add(path)
        mail.Display()
        return {"status": "success"}
    except Exception as e: raise HTTPException(500, str(e))
    finally: pythoncom.CoUninitialize()

@app.post("/analyze")
async def analyze_note(
    folder_id: int = Form(...), mode: str = Form(...), text_content: Optional[str] = Form(None), 
    files: List[UploadFile] = File(default=[]), custom_prompt: Optional[str] = Form(None), merge: bool = Form(True) 
):
    # --- CHECK FOR API KEY HERE ---
    if not os.path.exists(API_KEY_FILE):
        raise HTTPException(500, "API Key missing. Please restart the app to set up your key.")
        
    try:
        with open(API_KEY_FILE, "r") as f: api_key = f.read().strip()
    except: raise HTTPException(500, "API Key unreadable")

    base_prompt = """Analyze this meeting input. Return strictly JSON with these keys:
                "executive_summary": "High level summary (string)",
                "customer_information": "Client Name/Company (string only, no nested objects)",
                "product_details": "Extract specific product names, part numbers, SKUs, or technical specifications mentioned (string)",
                "key_points": ["List of main discussion topics"],
                "action_items": ["List of tasks"],
                "pricing_information": "Quotes/Costs (string only, no nested objects)",
                "additional_notes": "Deadlines/Context (string)" """

    extraction_enhancer = """STRICT DATA INTEGRITY RULES:
    1. Output MUST be a single-level JSON object. 
    2. EVERY value MUST be a simple string or a simple array of strings.
    3. PROHIBITED: Do not use nested objects, dictionaries, or key-value pairs inside any value. 
    """

    final_prompt = base_prompt + "\n" + extraction_enhancer
    if custom_prompt: final_prompt += f"\nUser Directive: {custom_prompt}"
    valid_files = [f for f in files if f.filename]

    async def call_ai_api(msgs):
        try:
            res = requests.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"}, proxies=PROXIES, verify=False, timeout=(10, 120),
                json={"model": "meta-llama/llama-4-scout-17b-16e-instruct", "messages": [{"role": "user", "content": msgs}], "temperature": 0.1, "response_format": {"type": "json_object"}})
            if res.status_code != 200: return None
            return json.loads(res.json()['choices'][0]['message']['content'])
        except Exception as e: return None

    if mode == 'image' and valid_files:
        if merge:
            messages = [{"type": "text", "text": final_prompt}]
            for f in valid_files:
                content = await f.read()
                b64 = base64.b64encode(content).decode("utf-8")
                clean_name = os.path.basename(f.filename)
                fname = os.path.join(SAVED_NOTES_DIR, f"{int(time.time())}_{clean_name}")
                with open(fname, "wb") as out: out.write(content)
                messages.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
            ai_data = await call_ai_api(messages)
            if not ai_data: raise HTTPException(500, "AI analysis failed")
            conn = get_db()
            conn.execute("INSERT INTO notes (folder_id, image_path, json_data, created_at) VALUES (?,?,?,?)", (folder_id, "MERGED_RECORD", json.dumps(ai_data), datetime.now().strftime("%Y-%m-%d %H:%M")))
            conn.commit(); conn.close(); return ai_data
        else:
            processed_count = 0
            for f in valid_files:
                content = await f.read()
                b64 = base64.b64encode(content).decode("utf-8")
                clean_name = os.path.basename(f.filename)
                fname = os.path.join(SAVED_NOTES_DIR, f"{int(time.time())}_{clean_name}")
                with open(fname, "wb") as out: out.write(content)
                messages = [{"type": "text", "text": final_prompt}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]
                ai_data = await call_ai_api(messages)
                if ai_data:
                    conn = get_db()
                    conn.execute("INSERT INTO notes (folder_id, image_path, json_data, created_at) VALUES (?,?,?,?)", (folder_id, clean_name, json.dumps(ai_data), datetime.now().strftime("%Y-%m-%d %H:%M")))
                    conn.commit(); conn.close(); processed_count += 1
            return {"status": "batch_complete", "notes_created": processed_count, "total_files": len(valid_files)}
    elif text_content:
        messages = [{"type": "text", "text": final_prompt}, {"type": "text", "text": text_content}]
        ai_data = await call_ai_api(messages)
        if not ai_data: raise HTTPException(500, "AI analysis failed")
        conn = get_db()
        conn.execute("INSERT INTO notes (folder_id, image_path, json_data, created_at) VALUES (?,?,?,?)", (folder_id, "TEXT_INPUT", json.dumps(ai_data), datetime.now().strftime("%Y-%m-%d %H:%M")))
        conn.commit(); conn.close(); return ai_data
    return {"error": "No valid content found"}

@app.post("/generate_csv")
def generate_csv(data: dict):
    if not os.path.exists(REPORTS_DIR): os.makedirs(REPORTS_DIR)
    try:
        title = clean_text(data.get('customer_information'))
        safe_name = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_')]).strip() or "Export"
        filename = f"{safe_name}_{int(time.time())}.csv"; path = os.path.join(REPORTS_DIR, filename)
        with open(path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=["Date", "Customer", "Summary", "Products", "Action Items"])
            writer.writeheader()
            writer.writerow({"Date": datetime.now().strftime("%Y-%m-%d"), "Customer": title, "Summary": clean_text(data.get('executive_summary')), "Products": clean_text(data.get('product_details')), "Action Items": clean_text(data.get('action_items'))})
        return {"status": "success", "message": f"Saved to: {path}", "filename": filename}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/shutdown")
def shutdown(): os._exit(0)

if __name__ == "__main__":
    # --- CONFIG ---
    APP_PORT = 8000
    APP_URL = f"http://127.0.0.1:{APP_PORT}"
    APP_WIDTH = 1920
    APP_HEIGHT = 850

    if os.path.exists(STATIC_DIR):
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

    # --- START SERVER BACKGROUND THREAD ---
    t_server = threading.Thread(target=lambda: uvicorn.run(app, host="127.0.0.1", port=APP_PORT, log_level="error"))
    t_server.daemon = True
    t_server.start()
    
    # Initialize API Bridge with Main URL
    api = WindowAPI(app_url=APP_URL)
    
    # --- SMART LAUNCH LOGIC ---
    # 1. Check if Key Exists
    # 2. If Yes -> Open Main App (APP_URL)
    # 3. If No  -> Open Setup Screen (SETUP_HTML)
    
    if os.path.exists(API_KEY_FILE):
        start_url = APP_URL
        start_html = None
    else:
        start_url = None
        start_html = SETUP_HTML

    # Create the window
    window = webview.create_window(
        "ST NeuraNote", 
        url=start_url, 
        html=start_html,
        width=APP_WIDTH, 
        height=APP_HEIGHT, 
        js_api=api,
        frameless=True,
        resizable=False,
        easy_drag=False
    )
    
    webview.start()