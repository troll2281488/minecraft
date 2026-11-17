#!/usr/bin/env python3
"""Static file server for the minecraft-clone dev loop.

This exists for one reason: ES modules are blocked over the file:// protocol, so
the game cannot be run by double-clicking index.html. There is no build step and
no bundler -- this only moves bytes.

  python serve.py [port]

Behavior worth knowing about:

  * Caching is disabled outright. During development, a stale cached module is a
    genuinely awful bug to chase: the code on disk is correct, the browser runs
    something else, and nothing you read explains the behavior. Always-fresh is
    worth more than the milliseconds.

  * COOP/COEP headers are sent so that SharedArrayBuffer is available. Chunk data
    handed to mesher workers is a natural fit for shared memory, and these headers
    must be present from the very first response for it to be enabled at all. The
    project is fully self-contained -- no cross-origin resources -- so the strict
    isolation these impose costs nothing here.

  * If the requested port is busy the next one is tried, up to 20 times, rather
    than dying with EADDRINUSE because a previous run is still shutting down.
"""

import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

DEFAULT_PORT = 8080
PORT_ATTEMPTS = 20
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Explicit rather than relying on the platform mimetypes registry. On Windows
    # that registry reads from the user's HKCR, where an unrelated program can and
    # does register .js as something absurd -- at which point every module fails to
    # load with a MIME type error that looks nothing like its actual cause.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".glsl": "text/plain",
        ".vert": "text/plain",
        ".frag": "text/plain",
        ".mcw": "application/octet-stream",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Required for SharedArrayBuffer. Must be on every response, not just the document.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Default logging prints every asset request, which buries anything useful
        # once a few hundred chunks of the world are loading. Only surface failures.
        status = args[1] if len(args) > 1 else ""
        if isinstance(status, str) and status.startswith(("4", "5")):
            sys.stderr.write("  %s %s\n" % (status, args[0]))


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def find_port(start):
    for port in range(start, start + PORT_ATTEMPTS):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                probe.bind(("127.0.0.1", port))
            return port
        except OSError:
            continue
    return None


def main():
    args = [a for a in sys.argv[1:] if a != "--no-open"]
    auto_open = "--no-open" not in sys.argv[1:]

    # Port precedence: an explicit CLI arg (play.bat passes 8080) wins; otherwise
    # honour the PORT environment variable, which the preview launcher sets when
    # it assigns a free port (autoPort); otherwise fall back to the default.
    requested = DEFAULT_PORT
    if args:
        try:
            requested = int(args[0])
        except ValueError:
            sys.exit("Port must be a number, got: %r" % args[0])
    elif os.environ.get("PORT"):
        try:
            requested = int(os.environ["PORT"])
        except ValueError:
            sys.exit("PORT env var must be a number, got: %r" % os.environ["PORT"])

    port = find_port(requested)
    if port is None:
        sys.exit(
            "No free port in range %d-%d. Something is holding these open --\n"
            "check with:  netstat -ano | findstr :%d"
            % (requested, requested + PORT_ATTEMPTS - 1, requested)
        )

    url = "http://localhost:%d/" % port
    if port != requested:
        print("Port %d was busy, using %d instead." % (requested, port))

    print("minecraft-clone dev server")
    print("  serving : %s" % ROOT)
    print("  url     : %s" % url)
    print("  tests   : %stests.html" % url)
    print("  caching : disabled (refresh always gets fresh code)")
    print("\nCtrl+C to stop.\n")

    # Delay slightly so the listener is accepting before the browser requests.
    if auto_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    with Server(("127.0.0.1", port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
