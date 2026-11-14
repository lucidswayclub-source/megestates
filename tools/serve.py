"""Local preview server for the MegEstates site.

Like `python -m http.server`, but tells the browser not to cache, so a
reload always picks up the latest scripts and styles while you work.

Usage: python tools/serve.py [port]   (default 5180)
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
handler = functools.partial(NoCache, directory=str(ROOT))
with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
    print(f"Serving {ROOT} at http://localhost:{port} (no cache)")
    httpd.serve_forever()
