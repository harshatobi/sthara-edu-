"""Knowledge-base vectors for the app's server routes (Vercel Python function).

POST {"texts": ["...", ...]}  ->  {"vectors": [[384 floats], ...], "dim": 384}

Called by the Next.js routes (lib/kb/embed.ts) with the signed-in person's own session token, which is checked with
Supabase itself, as api/cpsat.py does. A free open model (see _kb_embedder.py): no AI tokens are spent.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(__file__))
from _kb_embedder import DIM, embed  # noqa: E402

MAX_TEXTS = 64
MAX_CHARS = 2000


def signed_in(authorization):
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    if not url or not key:
        return os.environ.get('KB_DEV') == '1'
    if not authorization or not authorization.lower().startswith('bearer '):
        return False
    try:
        req = urllib.request.Request(url.rstrip('/') + '/auth/v1/user', headers={'Authorization': authorization, 'apikey': key})
        with urllib.request.urlopen(req, timeout=8) as res:
            return res.status == 200 and bool(json.loads(res.read()).get('id'))
    except Exception:
        return False


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {'ok': True, 'engine': 'kb-embed', 'dim': DIM})

    def do_POST(self):
        try:
            if not signed_in(self.headers.get('Authorization')):
                return self._send(401, {'error': 'Your session has expired. Sign in again.'})
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > 200_000:
                return self._send(413, {'error': 'Too much text.'})
            body = json.loads(self.rfile.read(n))
            texts = body.get('texts') if isinstance(body, dict) else None
            if not isinstance(texts, list) or not texts or len(texts) > MAX_TEXTS or not all(isinstance(t, str) for t in texts):
                return self._send(400, {'error': 'Send 1 to 64 texts.'})
            vecs = embed([t[:MAX_CHARS] for t in texts])
            self._send(200, {'dim': DIM, 'vectors': [[round(float(x), 6) for x in v] for v in vecs]})
        except Exception as e:  # noqa: BLE001 - callers fall back to tag and keyword matching
            print('[kb_embed]', repr(e))
            self._send(500, {'error': 'Vectors are unavailable right now.'})

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    os.environ.setdefault('KB_DEV', '1')
    port = int(os.environ.get('KB_PORT', '8788'))
    print(f'kb_embed: listening on http://127.0.0.1:{port}')
    HTTPServer(('127.0.0.1', port), handler).serve_forever()
