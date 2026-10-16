# Overleaf-Type Thing (Flask LaTeX Editor) — Tracker

**Last updated:** 2026-05-28  
**Status:** Active

## Completed
- [x] Flask server (`server.py`)
- [x] Launcher (`launcher.py`)
- [x] Frontend modules (`public/`)
- [x] README.md, latex-editor.spec
- [x] Removed committed `venv/` (2026-05-28)

## Pending
- [ ] Add `.gitignore` with `venv/`, `__pycache__/`, `projects/`
- [ ] Verify Flask 3 compatibility
- [ ] Add tests for project/file management and compile API
- [ ] Confirm PyInstaller build: `pyinstaller latex-editor.spec`
- [ ] Confirm pywebview works on Windows 11

## Start Command
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install flask
python server.py
```
