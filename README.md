# 📄 TexFlow (LaTeX Editor) — Offline Overleaf Alternative

## 💡 What is this in simple words?

Many students and researchers use **Overleaf** to write research papers, math assignments, and theses in LaTeX. But Overleaf requires an internet connection, has paywalled compile time limits, and uploads your private documents to third-party servers.

**TexFlow** gives you the **Overleaf experience running 100% locally on your computer**:
- Opens a clean side-by-side web editor in your browser.
- **Left side**: Type your `.tex` code with syntax highlighting and auto-completion.
- **Right side**: Live compiled PDF preview updating in real time.
- Compiles locally using your computer's `pdflatex` engine (MiKTeX or TeX Live)—completely free, unlimited compiles, and totally offline.

---

## 📁 What does each file & folder do?

| File / Folder | What it actually does |
| :--- | :--- |
| **`server.py`** | **The backend engine!** A Flask server that handles file saving, calls your local `pdflatex` to compile LaTeX code into a PDF, and sends the PDF back to your browser. |
| **`launcher.py`** | A friendly one-click startup helper that boots `server.py` and automatically opens your web browser to the editor. |
| **`public/`** | The frontend website interface (`index.html`, `style.css`, `app.js`) featuring the CodeMirror code editor and PDF.js viewer. |
| **`projects/`** | The storage folder where your LaTeX documents and projects are kept. |
| **`setup.bat` / `start.sh`** | Helper scripts to set up the environment and launch the app. |
| **`latex-editor.spec`** | Configuration for PyInstaller to package this whole app into a single `.exe` file if desired. |

---

## 🚀 How to Run It (Step-by-Step)

### Prerequisites
Make sure you have a LaTeX compiler installed on your PC:
- On Windows: [MiKTeX](https://miktex.org/) (make sure `pdflatex` is added to your PATH).

---

### Step 1: Open PowerShell and go to this directory
```powershell
cd c:\Users\user\Desktop\projects\texflow_oveleaf_type_thing
```

### Step 2: Activate Python Virtual Environment
```powershell
.venv\Scripts\activate
```
*(If dependencies aren't installed yet: `pip install -r requirements.txt`)*

### Step 3: Start the Editor
```powershell
python launcher.py
```
*(or run `python server.py`)*

Your web browser will automatically open:
👉 **[http://localhost:5000](http://localhost:5000)**

---

## ✏️ How to Use It
1. Click **New Project** or select an existing project from the left sidebar.
2. Edit your LaTeX code in the editor.
3. Press **Ctrl + S** or click **Compile**:
   - `server.py` compiles the `.tex` file in the background.
   - The compiled PDF refreshes instantly in the right-hand panel!

---

## Technical Limitations

- **Host Compiler Dependency**: Requires an existing local installation of `pdflatex` or `latexmk` (e.g. MiKTeX or TeX Live) registered in system PATH; missing LaTeX packages must be resolved by the local distribution.
- **Unidirectional View Synchronization**: PDF preview auto-refreshes on compilation, but bidirectional SyncTeX (clicking a sentence in PDF.js to jump to the cursor line in CodeMirror) is not currently mapped.
- **Windows File Lock Contention**: Rapid consecutive compile triggers can trigger temporary OS file locks on `.aux` or `.pdf` handles during active PDF.js rendering.

---

## Future Roadmap

- [ ] **Bidirectional SyncTeX Protocol**: Parse `.synctex.gz` metadata to enable click-to-code navigation from PDF preview into the editor.
- [ ] **XeLaTeX & LuaLaTeX Engine Toggle**: Add engine selection flags in project settings for advanced multilingual Unicode fonts.
- [ ] **BibTeX Citation Autocomplete**: Implement citation key parsing (`\cite{...}`) directly from project `.bib` files.
- [ ] **Automated Git Snapshot History**: Automatically commit compilation milestones to a local Git branch for rollback safety.

