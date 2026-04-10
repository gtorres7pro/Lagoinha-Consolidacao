#!/usr/bin/env python3
"""
Dev server para Zelo Pro — resolve slugs de workspace e força NO-CACHE.
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

class SlugRewriteHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching completely
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def translate_path(self, path):
        full = super().translate_path(path)
        if os.path.exists(full):
            return full

        parts = [p for p in path.split('/') if p]
        if parts:
            filename = parts[-1]
            fallback = os.path.join(ROOT, filename)
            if os.path.exists(fallback):
                return fallback

        return full

    def log_message(self, fmt, *args):
        pass # print(fmt % args) # avoid spam

if __name__ == '__main__':
    port = 5500
    os.chdir(ROOT)
    handler = SlugRewriteHandler
    with http.server.HTTPServer(('', port), handler) as httpd:
        print(f'✅  Servidor Zelo Pro (NO CACHE) → http://localhost:{port}')
        print(f'   Exemplo: http://localhost:{port}/braga/dashboard.html')
        httpd.serve_forever()
