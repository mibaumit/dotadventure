#!/usr/bin/env python3
"""Tiny static dev server that disables caching.

Browsers cache ES modules aggressively; with plain caching an edited
`config.js` (etc.) can be served stale on reload. This sends no-cache headers so
every reload re-fetches the latest source. Uses a threading server so the many
parallel module requests a browser makes don't deadlock.

Usage: python serve.py [port] [directory]
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass  # keep the console quiet


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    directory = sys.argv[2] if len(sys.argv) > 2 else "."

    def handler(*args, **kwargs):
        return NoCacheHandler(*args, directory=directory, **kwargs)

    server = http.server.ThreadingHTTPServer(("", port), handler)
    print(f"Serving {directory} on http://localhost:{port} (no-cache)")
    server.serve_forever()


if __name__ == "__main__":
    main()
