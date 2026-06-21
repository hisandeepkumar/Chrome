import sys
import socket
import threading
import json
import os
import subprocess
from flask import Flask, request, render_template, jsonify, send_from_directory
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QLabel, QWidget
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QPixmap
import qrcode
from io import BytesIO
from zeroconf import ServiceInfo, Zeroconf

# ---------- Flask Setup ----------
app = Flask(__name__, static_folder='static', template_folder='templates')
PORT = 5000
CONFIG_FILE = 'config.json'

def load_config():
    if not os.path.exists(CONFIG_FILE):
        default = {
            "apps": [
                {"id": "notepad", "name": "Notepad", "path": "notepad.exe", "icon": "📝"},
                {"id": "calc", "name": "Calculator", "path": "calc.exe", "icon": "🧮"},
                {"id": "explorer", "name": "File Explorer", "path": "explorer.exe", "icon": "📁"},
                {"id": "cmd", "name": "Command Prompt", "path": "cmd.exe", "icon": "⌨️"}
            ]
        }
        with open(CONFIG_FILE, 'w') as f:
            json.dump(default, f, indent=4)
        return default
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def save_config(data):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=4)

config_data = load_config()

# ---------- API Routes ----------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/api/apps', methods=['GET'])
def get_apps():
    return jsonify(config_data['apps'])

@app.route('/api/apps', methods=['POST'])
def add_app():
    new_app = request.json
    # Ensure unique ID
    new_app['id'] = new_app['name'].lower().replace(' ', '_') + str(len(config_data['apps']))
    config_data['apps'].append(new_app)
    save_config(config_data)
    return jsonify({"status": "added", "app": new_app})

@app.route('/api/apps/<app_id>', methods=['DELETE'])
def delete_app(app_id):
    config_data['apps'] = [a for a in config_data['apps'] if a['id'] != app_id]
    save_config(config_data)
    return jsonify({"status": "deleted"})

@app.route('/api/launch/<app_id>', methods=['GET'])
def launch_app(app_id):
    for app in config_data['apps']:
        if app['id'] == app_id:
            path = app['path']
            try:
                # Handle paths with spaces
                subprocess.Popen(f'"{path}"', shell=True)
                return jsonify({"status": "launched", "name": app['name']})
            except Exception as e:
                return jsonify({"status": "error", "msg": str(e)}), 500
    return jsonify({"status": "not_found"}), 404

# ---------- mDNS (Zeroconf) Setup ----------
def register_mdns():
    zeroconf = Zeroconf()
    hostname = socket.gethostname()
    ip = socket.gethostbyname(hostname)
    # Check if IP is private, else fallback
    if not ip.startswith('192.168.') and not ip.startswith('10.') and not ip.startswith('172.'):
        # Try getting proper local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except:
            pass
        finally:
            s.close()
    
    info = ServiceInfo(
        "_http._tcp.local.",
        "WinLauncher._http._tcp.local.",
        addresses=[socket.inet_aton(ip)],
        port=PORT,
        properties={"path": "/"},
        server="winlauncher.local.",
    )
    zeroconf.register_service(info)
    print(f"✅ mDNS registered: http://winlauncher.local:{PORT}")
    return zeroconf

# ---------- PyQt QR Window ----------
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

class QRWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("WinLauncher - Scan to Connect")
        self.setFixedSize(450, 550)
        self.setStyleSheet("background-color: #1c1c1e;")
        
        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setAlignment(Qt.AlignCenter)
        
        # Info Label
        label_info = QLabel("📱 Scan this QR with your phone\nor visit the URL below")
        label_info.setStyleSheet("color: white; font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 10px;")
        label_info.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_info)
        
        # URL Label (mDNS)
        url_mdns = "http://winlauncher.local:5000"
        label_url = QLabel(f"🌐 {url_mdns}\n(Also works with Local IP)")
        label_url.setStyleSheet("color: #aaa; font-size: 14px; text-align: center; margin-bottom: 20px;")
        label_url.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_url)
        
        # Generate QR Code for mDNS URL
        qr_img = qrcode.make(url_mdns)
        buffer = BytesIO()
        qr_img.save(buffer, format="PNG")
        pixmap = QPixmap()
        pixmap.loadFromData(buffer.getvalue())
        
        label_qr = QLabel()
        label_qr.setPixmap(pixmap.scaled(300, 300, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        label_qr.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_qr)
        
        # Local IP Fallback
        local_ip = get_local_ip()
        label_ip = QLabel(f"📶 Local IP fallback: http://{local_ip}:5000")
        label_ip.setStyleSheet("color: #888; font-size: 12px; text-align: center; margin-top: 20px;")
        label_ip.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_ip)

# ---------- Flask Runner ----------
def run_flask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

# ---------- Main ----------
if __name__ == '__main__':
    # Start Flask in background
    threading.Thread(target=run_flask, daemon=True).start()
    
    # Register mDNS
    zeroconf_instance = register_mdns()
    
    # Start PyQt App
    qt_app = QApplication(sys.argv)
    window = QRWindow()
    window.show()
    
    # Cleanup mDNS on exit
    def cleanup():
        zeroconf_instance.unregister_all_services()
        zeroconf_instance.close()
    qt_app.aboutToQuit.connect(cleanup)
    
    sys.exit(qt_app.exec_())
