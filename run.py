#!/usr/bin/env python3
"""
run.py - Local launcher for 2D House Planner CAD Application
Starts an HTTP server and automatically opens your browser.
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable caching-friendly or no-cache headers for smooth development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def main():
    # Ensure current working directory is the app directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    port = PORT
    server = None
    for p in range(PORT, PORT + 20):
        try:
            server = socketserver.TCPServer(("", p), Handler)
            port = p
            break
        except OSError:
            continue

    if not server:
        print("Could not find an available port. Please free port 8080 and retry.")
        sys.exit(1)

    url = f"http://localhost:{port}/index.html"
    print("=" * 60)
    print("  📐 2D House Planner CAD Application")
    print("=" * 60)
    print(f"  Local Server running at: {url}")
    print("  Opening default browser now...")
    print("  Press Ctrl+C to stop the server.")
    print("=" * 60)

    # Open browser
    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server. Goodbye!")
        server.server_close()

if __name__ == '__main__':
    main()
