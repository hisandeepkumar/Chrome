import os
import socket
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webbrowser

class FileServerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("File Share Server")
        self.root.geometry("500x350")
        self.root.configure(bg="#1e1e1e")
        self.server = None
        self.server_thread = None
        self.port = 8000

        # Default directory: current working directory
        self.directory = os.getcwd()

        self.create_widgets()
        self.update_ip_display()

    def create_widgets(self):
        # Title
        tk.Label(self.root, text="📁 File Share Server", font=("Segoe UI", 16, "bold"),
                 bg="#1e1e1e", fg="white").pack(pady=10)

        # Directory selection
        dir_frame = tk.Frame(self.root, bg="#1e1e1e")
        dir_frame.pack(fill="x", padx=20, pady=5)
        self.dir_label = tk.Label(dir_frame, text=f"Serving: {self.directory}", font=("Segoe UI", 9),
                                  bg="#1e1e1e", fg="#aaaaaa")
        self.dir_label.pack(side="left", fill="x", expand=True)
        tk.Button(dir_frame, text="📂 Change Folder", command=self.choose_folder,
                  bg="#3a3a3a", fg="white", cursor="hand2").pack(side="right")

        # IP address display
        ip_frame = tk.Frame(self.root, bg="#2d2d2d", relief="groove", bd=2)
        ip_frame.pack(pady=15, padx=20, fill="x")
        tk.Label(ip_frame, text="🌐 Access from other devices at:", font=("Segoe UI", 10),
                 bg="#2d2d2d", fg="#cccccc").pack(pady=(10,0))
        self.ip_label = tk.Label(ip_frame, text="Detecting IP...", font=("Consolas", 14, "bold"),
                                 bg="#2d2d2d", fg="#4caf50")
        self.ip_label.pack(pady=5)

        # URL display
        self.url_label = tk.Label(ip_frame, text="", font=("Consolas", 10),
                                  bg="#2d2d2d", fg="#ff9800", wraplength=460)
        self.url_label.pack(pady=(0,10))

        # Server status
        self.status_label = tk.Label(self.root, text="⚫ Server Stopped", font=("Segoe UI", 10),
                                     bg="#1e1e1e", fg="red")
        self.status_label.pack(pady=5)

        # Buttons
        btn_frame = tk.Frame(self.root, bg="#1e1e1e")
        btn_frame.pack(pady=10)
        self.start_btn = tk.Button(btn_frame, text="🚀 Start Server", command=self.start_server,
                                   bg="#4caf50", fg="white", padx=20, cursor="hand2")
        self.start_btn.pack(side="left", padx=10)
        self.stop_btn = tk.Button(btn_frame, text="⏹️ Stop Server", command=self.stop_server,
                                  bg="#f44336", fg="white", padx=20, cursor="hand2", state="disabled")
        self.stop_btn.pack(side="left", padx=10)

        # Info
        info = tk.Label(self.root, text="⚠️ Make sure PC and other device are on same WiFi network",
                        font=("Segoe UI", 8), bg="#1e1e1e", fg="#aaaaaa")
        info.pack(pady=10)

        # Auto-start server
        self.start_server()

    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"

    def update_ip_display(self):
        ip = self.get_local_ip()
        self.ip_label.config(text=f"{ip}")
        url = f"http://{ip}:{self.port}"
        self.url_label.config(text=f"📱 Type this in mobile/tablet browser:\n{url}")
        # Also show on title
        self.root.title(f"File Share Server - {url}")

    def choose_folder(self):
        new_dir = filedialog.askdirectory()
        if new_dir:
            self.directory = new_dir
            self.dir_label.config(text=f"Serving: {self.directory}")
            # Restart server if running
            if self.server:
                self.stop_server()
                self.start_server()

    def start_server(self):
        if self.server:
            return
        try:
            # Change to selected directory
            os.chdir(self.directory)
            handler = SimpleHTTPRequestHandler
            self.server = HTTPServer(("0.0.0.0", self.port), handler)
            self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.server_thread.start()
            self.status_label.config(text="🟢 Server Running", fg="#4caf50")
            self.start_btn.config(state="disabled")
            self.stop_btn.config(state="normal")
            # Update URL
            self.update_ip_display()
            # Optional: open browser for local access
            # webbrowser.open(f"http://{self.get_local_ip()}:{self.port}")
            messagebox.showinfo("Server Started", f"Server started at port {self.port}\nShare the URL with others.")
        except Exception as e:
            messagebox.showerror("Error", f"Cannot start server:\n{e}")

    def stop_server(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
            self.status_label.config(text="⚫ Server Stopped", fg="red")
            self.start_btn.config(state="normal")
            self.stop_btn.config(state="disabled")

if __name__ == "__main__":
    root = tk.Tk()
    app = FileServerGUI(root)
    root.mainloop()
