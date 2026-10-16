"""
Desktop launcher — starts the Flask server in a background thread,
then opens a native pywebview window (Edge WebView2 on Windows 10/11).
"""
import socket
import threading
import time

import webview

from server import app as _flask_app


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def _run_flask(port: int) -> None:
    _flask_app.run(host='127.0.0.1', port=port, threaded=True, use_reloader=False)


if __name__ == '__main__':
    port = _free_port()
    threading.Thread(target=_run_flask, args=(port,), daemon=True).start()

    # Give Flask a moment to bind before the window tries to load the URL.
    time.sleep(0.8)

    webview.create_window(
        'LaTeX Editor',
        f'http://127.0.0.1:{port}',
        width=1400,
        height=900,
        min_size=(900, 600),
    )
    webview.start()
