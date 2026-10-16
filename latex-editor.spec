# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

# Bundle everything webview needs (backends, DLLs, data files)
webview_datas, webview_binaries, webview_hidden = collect_all('webview')

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=webview_binaries,
    datas=[
        ('public', 'public'),          # entire frontend
        *webview_datas,
    ],
    hiddenimports=[
        'flask', 'werkzeug', 'werkzeug.serving', 'werkzeug.routing',
        'jinja2', 'click', 'itsdangerous',
        *webview_hidden,
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LaTeXEditor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,       # no black terminal window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='icon.ico',   # uncomment and supply an .ico to set the taskbar icon
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LaTeXEditor',
)
