import io
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename

# When bundled with PyInstaller, __file__ lives inside sys._MEIPASS (read-only).
# Projects must go next to the .exe so they survive across runs.
_IS_BUNDLE   = getattr(sys, 'frozen', False)
_BASE_DIR    = Path(sys._MEIPASS) if _IS_BUNDLE else Path(__file__).parent
PROJECTS_DIR = (Path(sys.executable).parent if _IS_BUNDLE else _BASE_DIR) / "projects"
PROJECTS_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(_BASE_DIR / "public"), static_url_path="")

EDITABLE_EXTS = {".tex", ".bib", ".txt", ".cls", ".sty", ".md", ".cfg", ".def"}
HIDDEN_EXTS   = {
    ".aux", ".log", ".synctex.gz", ".out", ".toc", ".fls",
    ".fdb_latexmk", ".blg", ".bbl", ".nav", ".snm", ".vrb",
    ".xdv", ".bcf", ".run.xml", ".lot", ".lof",
}
COMPILERS = {"pdflatex", "xelatex", "lualatex"}

# ── Templates ──────────────────────────────────────────────────────────────────
TEMPLATES = {
    "blank": {
        "name": "Blank", "icon": "📄",
        "description": "Minimal empty document",
        "files": {"main.tex": "\\documentclass{article}\n\\begin{document}\n\nHello, World!\n\n\\end{document}\n"},
    },
    "article": {
        "name": "Article", "icon": "📰",
        "description": "Academic article with math and bibliography",
        "files": {
            "main.tex": r"""\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb,amsthm}
\usepackage{geometry}\geometry{margin=1in}
\usepackage{graphicx}
\usepackage{hyperref}

\title{Article Title}
\author{Author Name \\ Institution}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Abstract text goes here.
\end{abstract}

\section{Introduction}
Introduction with a citation~\cite{example2024}.

\section{Methods}
Methods section.

\section{Results}
Results section.

\section{Conclusion}
Conclusion.

\bibliographystyle{plain}
\bibliography{references}
\end{document}
""",
            "references.bib": r"""@article{example2024,
  author  = {Doe, Jane and Smith, John},
  title   = {An Example Paper},
  journal = {Journal of Examples},
  year    = {2024},
  volume  = {1},
  pages   = {1--10},
}
""",
        },
    },
    "beamer": {
        "name": "Beamer", "icon": "🖥",
        "description": "Presentation slides",
        "files": {
            "main.tex": r"""\documentclass{beamer}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usetheme{Madrid}

\title{Presentation Title}
\subtitle{Subtitle}
\author{Author Name}
\institute{Institution}
\date{\today}

\begin{document}

\begin{frame}\titlepage\end{frame}

\begin{frame}{Outline}\tableofcontents\end{frame}

\section{Introduction}
\begin{frame}{Introduction}
  \begin{itemize}
    \item First point
    \item Second point
    \item Third point
  \end{itemize}
\end{frame}

\section{Content}
\begin{frame}{A Frame with Math}
  \[ E = mc^2 \]
\end{frame}

\section{Conclusion}
\begin{frame}{Conclusion}
  Thank you!
\end{frame}

\end{document}
""",
        },
    },
    "report": {
        "name": "Report", "icon": "📋",
        "description": "Multi-chapter report",
        "files": {
            "main.tex": r"""\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath}
\usepackage{geometry}\geometry{margin=1in}
\usepackage{graphicx}
\usepackage{hyperref}

\title{Report Title}
\author{Author Name}
\date{\today}

\begin{document}
\maketitle
\tableofcontents
\newpage

\chapter{Introduction}
Introduction chapter.

\chapter{Background}
Background chapter.

\chapter{Results}
Main results.

\chapter{Conclusion}
Conclusion chapter.

\end{document}
""",
        },
    },
    "math": {
        "name": "Math Paper", "icon": "∑",
        "description": "Theorems, lemmas, proofs",
        "files": {
            "main.tex": r"""\documentclass{amsart}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb,amsthm}

\theoremstyle{plain}
\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{corollary}[theorem]{Corollary}

\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\newtheorem{example}[theorem]{Example}

\theoremstyle{remark}
\newtheorem*{remark}{Remark}

\title{Title of Paper}
\author{Author Name}
\address{Institution}
\email{author@example.com}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Abstract text.
\end{abstract}

\section{Introduction}

\begin{definition}
A \emph{definition} looks like this.
\end{definition}

\begin{theorem}[Main Theorem]
Every interesting theorem has a proof.
\end{theorem}

\begin{proof}
The proof follows from the definitions.
\end{proof}

\end{document}
""",
        },
    },
    "cv": {
        "name": "CV / Résumé", "icon": "👤",
        "description": "Curriculum vitae",
        "files": {
            "main.tex": r"""\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{geometry}\geometry{margin=0.75in}
\usepackage{enumitem}
\usepackage{hyperref}
\usepackage{titlesec}
\usepackage{parskip}
\pagestyle{empty}
\titleformat{\section}{\large\bfseries}{}{0em}{}[\titlerule]

\begin{document}

{\Huge\bfseries Your Name}\\[4pt]
your.email@example.com $\cdot$ +1\,(555)\,000-0000 $\cdot$ City, Country

\section{Education}
\textbf{University Name} \hfill 2020--2024\\
B.Sc.\ in Field of Study \hfill \textit{GPA: 4.0}

\section{Experience}
\textbf{Company Name} \hfill Jan 2024 -- Present\\
\textit{Job Title}
\begin{itemize}[noitemsep]
  \item Responsibility one
  \item Responsibility two
\end{itemize}

\section{Skills}
\textbf{Languages:} Python, C++, Java\\
\textbf{Tools:} Git, Docker, \LaTeX

\end{document}
""",
        },
    },
}

DEFAULT_TEX = r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usepackage{geometry}
\geometry{margin=1in}

\title{My Document}
\author{Author Name}
\date{\today}

\begin{document}

\maketitle

\section{Introduction}
Hello, World! This is my first \LaTeX{} document.

\section{Mathematics}
An inline equation: $E = mc^2$.

A displayed equation:
\begin{equation}
  \int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
\end{equation}

\section{Lists}
\begin{itemize}
  \item First item
  \item Second item
  \item Third item
\end{itemize}

\end{document}
"""


# ── Helpers ────────────────────────────────────────────────────────────────────

def detect_main_tex(project_dir: Path) -> str | None:
    """Find the .tex file that contains \\documentclass — that's the root file."""
    candidates = sorted(project_dir.glob("*.tex"))  # top-level only
    for p in candidates:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
            if "\\documentclass" in text:
                return p.name
        except OSError:
            pass
    return None


def safe_path(base: Path, *parts) -> Path:
    joined = base
    for p in parts:
        if p:
            joined = joined / p
    resolved = joined.resolve()
    if not str(resolved).startswith(str(base.resolve())):
        abort(400, "Path traversal denied")
    return resolved


def is_hidden(path: Path) -> bool:
    if path.suffix in HIDDEN_EXTS:
        return True
    name = path.name
    for h in HIDDEN_EXTS:
        if name.endswith(h):
            return True
    return False


def build_tree(directory: Path, base: Path) -> list:
    entries = []
    try:
        for entry in sorted(directory.iterdir(),
                            key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.name.startswith(".") or is_hidden(entry):
                continue
            rel = entry.relative_to(base).as_posix()
            if entry.is_dir():
                entries.append({
                    "name": entry.name, "path": rel,
                    "type": "directory",
                    "children": build_tree(entry, base),
                })
            else:
                entries.append({
                    "name": entry.name, "path": rel,
                    "type": "file",
                    "size": entry.stat().st_size,
                })
    except PermissionError:
        pass
    return entries


# ── Projects ───────────────────────────────────────────────────────────────────

@app.route("/api/projects", methods=["GET"])
def list_projects():
    projects = [d.name for d in sorted(PROJECTS_DIR.iterdir()) if d.is_dir()]
    return jsonify(projects)


@app.route("/api/projects", methods=["POST"])
def create_project():
    data = request.json or {}
    name = data.get("name", "").strip()
    if not name or not re.fullmatch(r"[\w\- ]+", name):
        return jsonify({"error": "Invalid project name"}), 400
    project_dir = safe_path(PROJECTS_DIR, name)
    project_dir.mkdir(parents=True, exist_ok=True)
    if not (project_dir / "main.tex").exists():
        (project_dir / "main.tex").write_text(DEFAULT_TEX, encoding="utf-8")
    return jsonify({"success": True})


@app.route("/api/projects/<project>", methods=["DELETE"])
def delete_project(project):
    project_dir = safe_path(PROJECTS_DIR, project)
    if project_dir.is_dir():
        shutil.rmtree(str(project_dir))
    return jsonify({"success": True})


# ── Files ──────────────────────────────────────────────────────────────────────

@app.route("/api/files")
def list_files():
    project = request.args.get("project", "")
    project_dir = safe_path(PROJECTS_DIR, project)
    if not project_dir.is_dir():
        return jsonify({"error": "Project not found"}), 404
    return jsonify(build_tree(project_dir, project_dir))


@app.route("/api/file", methods=["GET"])
def read_file():
    project = request.args.get("project", "")
    file    = request.args.get("file", "")
    path    = safe_path(PROJECTS_DIR, project, file)
    if not path.is_file():
        return jsonify({"error": "File not found"}), 404
    return path.read_text(encoding="utf-8", errors="replace")


@app.route("/api/file", methods=["POST"])
def write_file():
    data    = request.json or {}
    project = data.get("project", "")
    file    = data.get("file", "")
    content = data.get("content", "")
    path    = safe_path(PROJECTS_DIR, project, file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return jsonify({"success": True})


@app.route("/api/file", methods=["DELETE"])
def delete_file():
    project = request.args.get("project", "")
    file    = request.args.get("file", "")
    path    = safe_path(PROJECTS_DIR, project, file)
    if path.is_dir():
        shutil.rmtree(str(path))
    elif path.is_file():
        path.unlink()
    else:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"success": True})


@app.route("/api/create", methods=["POST"])
def create_entry():
    data       = request.json or {}
    project    = data.get("project", "")
    name       = data.get("name", "").strip()
    entry_type = data.get("type", "file")
    parent     = data.get("parent", "")
    if not name:
        return jsonify({"error": "Name required"}), 400
    path = safe_path(PROJECTS_DIR, project, parent, name)
    if entry_type == "directory":
        path.mkdir(parents=True, exist_ok=True)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text("", encoding="utf-8")
    return jsonify({"success": True})


@app.route("/api/rename", methods=["POST"])
def rename_entry():
    data     = request.json or {}
    project  = data.get("project", "")
    old_rel  = data.get("old", "")
    new_name = data.get("new", "").strip()
    if not new_name:
        return jsonify({"error": "New name required"}), 400
    old = safe_path(PROJECTS_DIR, project, old_rel)
    new = old.parent / new_name
    safe_path(PROJECTS_DIR, project, str(new.relative_to(PROJECTS_DIR / project)))
    old.rename(new)
    return jsonify({"success": True})


# ── Upload ─────────────────────────────────────────────────────────────────────

@app.route("/api/upload", methods=["POST"])
def upload_files():
    project   = request.form.get("project", "")
    subfolder = request.form.get("subfolder", "")
    project_dir = safe_path(PROJECTS_DIR, project)
    dest_dir    = safe_path(project_dir, subfolder) if subfolder else project_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    uploaded = []
    for f in request.files.getlist("files"):
        filename = secure_filename(f.filename)
        if not filename:
            continue
        f.save(str(dest_dir / filename))
        uploaded.append(filename)
    return jsonify({"success": True, "uploaded": uploaded})


# ── Detect main file ───────────────────────────────────────────────────────────

@app.route("/api/detect-main")
def detect_main():
    project     = request.args.get("project", "")
    current     = request.args.get("current", "")
    project_dir = safe_path(PROJECTS_DIR, project)

    # If the currently stored file already has \documentclass, keep it
    if current:
        try:
            cur_path = safe_path(project_dir, current)
            if cur_path.is_file():
                text = cur_path.read_text(encoding="utf-8", errors="replace")
                if "\\documentclass" in text:
                    return jsonify({"mainFile": current, "valid": True})
        except Exception:
            pass

    # Current file is invalid (chapter-only) — find the real root
    found = detect_main_tex(project_dir)
    return jsonify({"mainFile": found, "valid": False})


# ── Compile ────────────────────────────────────────────────────────────────────

@app.route("/api/compile", methods=["POST"])
def compile_latex():
    data          = request.json or {}
    project       = data.get("project", "")
    main_file     = data.get("mainFile", "main.tex")
    compiler      = data.get("compiler", "pdflatex")
    double_compile = data.get("doubleCompile", False)

    if compiler not in COMPILERS:
        compiler = "pdflatex"

    project_dir = safe_path(PROJECTS_DIR, project)
    main_path   = safe_path(project_dir, main_file)

    # Auto-detect if the specified main file doesn't exist
    if not main_path.is_file():
        detected = detect_main_tex(project_dir)
        if detected:
            main_file = detected
            main_path = safe_path(project_dir, main_file)
        else:
            return jsonify({"success": False,
                            "log": f"Main file not found: {main_file}\n"
                                   f"Tip: right-click a .tex file in the file tree and choose "
                                   f"\"Set as main file\".",
                            "detectedMain": None})

    cmd = [
        compiler,
        "-interaction=nonstopmode",
        "-synctex=1",
        f"-output-directory={project_dir}",
        str(main_path),
    ]

    def run_once():
        return subprocess.run(
            cmd, cwd=str(project_dir),
            capture_output=True, text=True, timeout=60,
        )

    try:
        r1  = run_once()
        log = r1.stdout + r1.stderr
        if double_compile and r1.returncode == 0:
            r2   = run_once()
            log += "\n\n─── Second pass ───\n\n" + r2.stdout + r2.stderr
            return jsonify({"success": r2.returncode == 0, "log": log, "code": r2.returncode, "mainFile": main_file})
        return jsonify({"success": r1.returncode == 0, "log": log, "code": r1.returncode, "mainFile": main_file})
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "log": "Compilation timed out (60 s)."})
    except FileNotFoundError:
        return jsonify({"success": False,
                        "log": f"'{compiler}' not found. Is MiKTeX / TeX Live installed?"})


# ── PDF ────────────────────────────────────────────────────────────────────────

@app.route("/api/pdf")
def serve_pdf():
    project   = request.args.get("project", "")
    main_file = request.args.get("mainFile", "main.tex")
    project_dir = safe_path(PROJECTS_DIR, project)
    pdf_name    = Path(main_file).stem + ".pdf"
    pdf_path    = project_dir / pdf_name
    # fallback: try main.pdf if the derived name doesn't exist
    if not pdf_path.is_file():
        pdf_path = project_dir / "main.pdf"
    if not pdf_path.is_file():
        return jsonify({"error": "PDF not found — compile first"}), 404
    return send_file(str(pdf_path), mimetype="application/pdf")


# ── SyncTeX forward search ─────────────────────────────────────────────────────

@app.route("/api/synctex", methods=["POST"])
def synctex_view():
    data    = request.json or {}
    project = data.get("project", "")
    file    = data.get("file", "")
    line    = int(data.get("line", 1))
    main    = data.get("mainFile", "main.tex")

    project_dir = safe_path(PROJECTS_DIR, project)
    pdf_path    = project_dir / (Path(main).stem + ".pdf")
    tex_path    = safe_path(project_dir, file)

    if not pdf_path.is_file():
        return jsonify({"error": "PDF not found — compile first"}), 404

    try:
        r = subprocess.run(
            ["synctex", "view", "-i", f"{line}:1:{tex_path}", "-o", str(pdf_path)],
            capture_output=True, text=True, timeout=10,
            cwd=str(project_dir),
        )
        for ln in r.stdout.splitlines():
            if ln.startswith("Page:"):
                return jsonify({"page": int(ln.split(":")[1])})
        return jsonify({"page": None})
    except FileNotFoundError:
        return jsonify({"error": "synctex binary not found"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── SyncTeX inverse search ─────────────────────────────────────────────────────

@app.route("/api/synctex/edit", methods=["POST"])
def synctex_edit():
    data    = request.json or {}
    project = data.get("project", "")
    main    = data.get("mainFile", "main.tex")
    page    = int(data.get("page", 1))
    x       = float(data.get("x", 0))
    y       = float(data.get("y", 0))

    project_dir = safe_path(PROJECTS_DIR, project)
    pdf_path    = project_dir / (Path(main).stem + ".pdf")

    if not pdf_path.is_file():
        return jsonify({"error": "PDF not found — compile first"}), 404

    try:
        r = subprocess.run(
            ["synctex", "edit", "-o", f"{page}:{x}:{y}:{pdf_path}"],
            capture_output=True, text=True, timeout=10,
            cwd=str(project_dir),
        )
        result = {}
        for ln in r.stdout.splitlines():
            if ln.startswith("Input:"):
                inp = Path(ln[6:].strip())
                try:
                    result["file"] = inp.relative_to(project_dir).as_posix()
                except ValueError:
                    result["file"] = inp.as_posix()
            elif ln.startswith("Line:"):
                result["line"] = int(ln[5:].strip())
            elif ln.startswith("Column:"):
                result["column"] = int(ln[7:].strip())
        if "file" in result:
            return jsonify(result)
        return jsonify({"error": "No synctex match"})
    except FileNotFoundError:
        return jsonify({"error": "synctex binary not found"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Export / Import ────────────────────────────────────────────────────────────

@app.route("/api/export/<project>")
def export_project(project):
    project_dir = safe_path(PROJECTS_DIR, project)
    if not project_dir.is_dir():
        abort(404)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(project_dir.rglob("*")):
            if not path.is_file() or is_hidden(path):
                continue
            rel = path.relative_to(project_dir).as_posix()
            zf.write(str(path), f"{project}/{rel}")
    buf.seek(0)
    return send_file(buf, mimetype="application/zip",
                     as_attachment=True, download_name=f"{project}.zip")


@app.route("/api/import", methods=["POST"])
def import_project():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith(".zip"):
        return jsonify({"error": "Only .zip files are supported"}), 400

    raw = f.read()
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            names = [i.filename for i in zf.infolist() if not i.is_dir()]
    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid ZIP file"}), 400

    # Detect a common top-level directory in the zip
    parts_list = [n.replace("\\", "/").split("/") for n in names]
    prefix = None
    if parts_list and all(len(p) > 1 and p[0] == parts_list[0][0] for p in parts_list):
        prefix = parts_list[0][0]

    base_name    = secure_filename(prefix or f.filename[:-4]) or "imported"
    project_name = base_name
    counter      = 1
    while (PROJECTS_DIR / project_name).exists():
        project_name = f"{base_name}_{counter}"
        counter += 1

    project_dir = safe_path(PROJECTS_DIR, project_name)
    project_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename.replace("\\", "/")
                if prefix and name.startswith(prefix + "/"):
                    name = name[len(prefix) + 1:]
                if not name:
                    continue
                dest = safe_path(project_dir, name)
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src:
                    dest.write_bytes(src.read())
    except Exception as e:
        shutil.rmtree(str(project_dir), ignore_errors=True)
        return jsonify({"error": str(e)}), 500

    return jsonify({"success": True, "project": project_name})


# ── Templates ──────────────────────────────────────────────────────────────────

@app.route("/api/templates")
def list_templates():
    return jsonify([
        {"id": k, "name": v["name"], "icon": v["icon"], "description": v["description"]}
        for k, v in TEMPLATES.items()
    ])


@app.route("/api/templates/<template_id>", methods=["POST"])
def apply_template(template_id):
    if template_id not in TEMPLATES:
        return jsonify({"error": "Template not found"}), 404
    data         = request.json or {}
    project_name = data.get("project", "").strip()
    if not project_name or not re.fullmatch(r"[\w\- ]+", project_name):
        return jsonify({"error": "Invalid project name"}), 400
    project_dir = safe_path(PROJECTS_DIR, project_name)
    project_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in TEMPLATES[template_id]["files"].items():
        fp = safe_path(project_dir, filename)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content, encoding="utf-8")
    return jsonify({"success": True})


# ── Frontend ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    default_dir = PROJECTS_DIR / "default"
    default_dir.mkdir(exist_ok=True)
    if not (default_dir / "main.tex").exists():
        (default_dir / "main.tex").write_text(DEFAULT_TEX, encoding="utf-8")
    print("LaTeX Editor running at http://localhost:5000")
    app.run(debug=True, port=5000)
