import sys
import socket
import threading
import json
import os
import subprocess
import uuid
import shutil
import zipfile
import io
from flask import Flask, request, render_template, jsonify, send_from_directory, send_file
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QLabel, QWidget
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QPixmap
import qrcode
from io import BytesIO
from zeroconf import ServiceInfo, Zeroconf
from PIL import Image, ImageDraw, ImageFont
from werkzeug.utils import secure_filename

# ---------- User Data Directory ----------
APPDATA = os.path.expandvars('%APPDATA%')
USER_DIR = os.path.join(APPDATA, 'WinLauncher')
ICON_DIR = os.path.join(USER_DIR, 'icons')
WALLPAPER_DIR = os.path.join(USER_DIR, 'wallpaper')
CONFIG_FILE = os.path.join(USER_DIR, 'config.json')
PWA_ICON_DIR = os.path.join(USER_DIR, 'pwa')
os.makedirs(ICON_DIR, exist_ok=True)
os.makedirs(WALLPAPER_DIR, exist_ok=True)
os.makedirs(PWA_ICON_DIR, exist_ok=True)

# ---------- Flask Setup ----------
app = Flask(__name__, static_folder='static', template_folder='templates')
PORT = 5000
app.config['MAX_CONTENT_LENGTH'] = 512 * 1024 * 1024  # 512 MB

# ---------- Generate PWA Icons ----------
def generate_pwa_icons():
    sizes = [192, 512]
    for size in sizes:
        path = os.path.join(PWA_ICON_DIR, f'icon-{size}.png')
        if not os.path.exists(path):
            img = Image.new('RGB', (size, size), color='#000000')
            d = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype("arial.ttf", size//2)
            except:
                font = ImageFont.load_default()
            d.text((size//2, size//2), "🚀", fill='white', anchor="mm", font=font)
            img.save(path)
generate_pwa_icons()

# ---------- Default Apps ----------
DEFAULT_APPS = [
    {"id": "whatsapp", "name": "WhatsApp", "path": "https://web.whatsapp.com", "icon": "💬"},
    {"id": "youtube", "name": "YouTube", "path": "https://youtube.com", "icon": "▶️"},
    {"id": "deepseek", "name": "DeepSeek", "path": "https://chat.deepseek.com", "icon": "🤖"},
    {"id": "chatgpt", "name": "ChatGPT", "path": "https://chatgpt.com", "icon": "✨"},
    {"id": "gmail", "name": "Gmail", "path": "https://gmail.com", "icon": "📧"},
    {"id": "newtab", "name": "New Tab", "path": "about:blank", "icon": "➕"},
    {"id": "wifi", "name": "WiFi", "path": "ms-settings:network-wifi", "icon": "📶"},
    {"id": "bluetooth", "name": "Bluetooth", "path": "ms-settings:bluetooth", "icon": "📳"},
    {"id": "display", "name": "Display", "path": "ms-settings:display", "icon": "🖥️"},
    {"id": "sound", "name": "Sound", "path": "ms-settings:sound", "icon": "🔊"},
    {"id": "volup", "name": "Volume +", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]175)", "icon": "🔊+"},
    {"id": "voldown", "name": "Volume -", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]174)", "icon": "🔊-"},
    {"id": "brightup", "name": "Brightness +", "path": "powershell -c (Get-WmiObject -Class WmiMonitorBrightnessMethods -Namespace root\\wmi).WmiSetBrightness(1,100)", "icon": "☀️+"},
    {"id": "brightdown", "name": "Brightness -", "path": "powershell -c (Get-WmiObject -Class WmiMonitorBrightnessMethods -Namespace root\\wmi).WmiSetBrightness(1,50)", "icon": "☀️-"},
    {"id": "lockpc", "name": "Lock PC", "path": "rundll32.exe user32.dll,LockWorkStation", "icon": "🔒"},
    {"id": "taskmgr", "name": "Task Manager", "path": "taskmgr.exe", "icon": "⚙️"},
    {"id": "snipping", "name": "Snipping Tool", "path": "SnippingTool.exe", "icon": "✂️"},
    {"id": "control", "name": "Control Panel", "path": "control.exe", "icon": "📟"},
    {"id": "notepad", "name": "Notepad", "path": "notepad.exe", "icon": "📝"},
    {"id": "calc", "name": "Calculator", "path": "calc.exe", "icon": "🧮"},
    {"id": "explorer", "name": "Explorer", "path": "explorer.exe", "icon": "📁"},
    {"id": "cmd", "name": "Command Prompt", "path": "cmd.exe", "icon": "⌨️"},
    {"id": "closeall", "name": "Close Browsers", "path": "taskkill /IM chrome.exe /F & taskkill /IM msedge.exe /F & taskkill /IM firefox.exe /F", "icon": "❌"}
]

DEFAULT_SETTINGS_V2 = {
    "version": "2.0",
    "portrait": {
        "cols": 3,
        "rows": 4,
        "icon_size": 64,
        "icon_shape": "rounded",
        "label_font_size": 12,
        "h_gap": 16,
        "v_gap": 16,
        "padding": 100,
        "grid_alignment": "center"
    },
    "landscape": {
        "cols": 4,
        "rows": 3,
        "icon_size": 64,
        "icon_shape": "rounded",
        "label_font_size": 12,
        "h_gap": 16,
        "v_gap": 16,
        "padding": 100,
        "grid_alignment": "center"
    },
    "effects": {
        "glow_color": "#ffffff",
        "glow_brightness": 50,
        "glow_radius": 20,
        "shadow_strength": 0,
        "shadow_blur": 0,
        "border_radius": 16,
        "hover_scale": 1.05,
        "tap_animation": True
    },
    "wallpaper": {
        "type": "color",
        "value": "#000000",
        "dim": 0,
        "blur": 0,
        "zoom": 100,
        "brightness": 100,
        "opacity": 100
    },
    "dock": {
        "enabled": False,
        "icons": [],
        "background_blur": 20,
        "opacity": 80,
        "icon_size": 48,
        "auto_hide": False
    },
    "labels": {
        "hide": False,
        "show": True,
        "color": "#ffffff",
        "shadow": False
    },
    "presets": {
        "current": "default",
        "list": {}
    }
}

def migrate_settings(old_data):
    old_settings = old_data.get('settings', {})
    old_grid = old_settings.get('grid', {})
    new_settings = {
        "version": "2.0",
        "portrait": {
            "cols": old_grid.get('portrait_cols', 3),
            "rows": old_grid.get('portrait_rows', 4),
            "icon_size": old_grid.get('icon_size', 64),
            "icon_shape": "rounded",
            "label_font_size": 12,
            "h_gap": 16,
            "v_gap": 16,
            "padding": 100,
            "grid_alignment": "center"
        },
        "landscape": {
            "cols": old_grid.get('landscape_cols', 4),
            "rows": old_grid.get('landscape_rows', 3),
            "icon_size": old_grid.get('icon_size', 64),
            "icon_shape": "rounded",
            "label_font_size": 12,
            "h_gap": 16,
            "v_gap": 16,
            "padding": 100,
            "grid_alignment": "center"
        },
        "effects": {
            "glow_color": "#ffffff",
            "glow_brightness": 50,
            "glow_radius": old_grid.get('glow_size', 20),
            "shadow_strength": 0,
            "shadow_blur": 0,
            "border_radius": 16,
            "hover_scale": 1.05,
            "tap_animation": True
        },
        "wallpaper": {
            "type": old_grid.get('bg_type', 'color'),
            "value": old_grid.get('bg_value', '#000000'),
            "dim": 0,
            "blur": old_grid.get('blur', 0),
            "zoom": 100,
            "brightness": 100,
            "opacity": 100
        },
        "dock": {
            "enabled": False,
            "icons": [],
            "background_blur": 20,
            "opacity": 80,
            "icon_size": 48,
            "auto_hide": False
        },
        "labels": {
            "hide": False,
            "show": True,
            "color": "#ffffff",
            "shadow": False
        },
        "presets": {
            "current": "default",
            "list": {}
        }
    }
    return new_settings

def load_config():
    if not os.path.exists(CONFIG_FILE):
        data = {"apps": DEFAULT_APPS, "settings": DEFAULT_SETTINGS_V2}
        with open(CONFIG_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        return data

    with open(CONFIG_FILE, 'r') as f:
        data = json.load(f)

    settings = data.get('settings', {})
    if 'version' not in settings or settings['version'] != '2.0':
        new_settings = migrate_settings(data)
        data['settings'] = new_settings
        if 'apps' not in data or not data['apps']:
            data['apps'] = DEFAULT_APPS
        existing_ids = {app['id'] for app in data.get('apps', [])}
        for default_app in DEFAULT_APPS:
            if default_app['id'] not in existing_ids:
                data['apps'].append(default_app)
        with open(CONFIG_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    else:
        existing_ids = {app['id'] for app in data.get('apps', [])}
        for default_app in DEFAULT_APPS:
            if default_app['id'] not in existing_ids:
                data['apps'].append(default_app)
        # Ensure all keys exist
        for key in DEFAULT_SETTINGS_V2:
            if key not in data['settings']:
                data['settings'][key] = DEFAULT_SETTINGS_V2[key]
        for ori in ['portrait', 'landscape']:
            if 'padding' not in data['settings'].get(ori, {}):
                data['settings'][ori]['padding'] = 100
        with open(CONFIG_FILE, 'w') as f:
            json.dump(data, f, indent=4)

    return data

def save_config(data):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=4)
    print("✅ Config saved to disk")

config_data = load_config()

# ---------- Routes ----------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/pwa-icons/<path:filename>')
def serve_pwa_icon(filename):
    return send_from_directory(PWA_ICON_DIR, filename)

@app.route('/user-icons/<path:filename>')
def serve_user_icon(filename):
    return send_from_directory(ICON_DIR, filename)

@app.route('/wallpaper/<path:filename>')
def serve_wallpaper(filename):
    return send_from_directory(WALLPAPER_DIR, filename)

@app.route('/api/apps', methods=['GET'])
def get_apps():
    return jsonify(config_data['apps'])

@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = config_data.get('settings', {})
    if 'version' not in settings or settings['version'] != '2.0':
        settings = migrate_settings(config_data)
        config_data['settings'] = settings
        save_config(config_data)
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def save_settings():
    new_settings = request.json
    print("📥 Received settings POST:", json.dumps(new_settings, indent=2)[:500])  # debug
    if not isinstance(new_settings, dict):
        return jsonify({"status": "error", "msg": "Invalid settings format"}), 400
    # Ensure version
    new_settings['version'] = '2.0'
    # Ensure padding exists
    for ori in ['portrait', 'landscape']:
        if 'padding' not in new_settings.get(ori, {}):
            new_settings[ori]['padding'] = 100
    config_data['settings'] = new_settings
    save_config(config_data)
    print("✅ Settings updated on server")
    return jsonify({"status": "ok", "message": "Settings saved"})

@app.route('/api/apps', methods=['POST'])
def add_or_edit_app():
    name = request.form.get('name', '').strip()
    path = request.form.get('path', '').strip()
    icon_emoji = request.form.get('icon', '📦')
    edit_id = request.form.get('edit_id')
    file = request.files.get('icon_file')

    if not path:
        return jsonify({"status": "error", "msg": "Path required"}), 400
    if not name:
        name = ""

    if edit_id:
        for app in config_data['apps']:
            if app['id'] == edit_id:
                app['name'] = name
                app['path'] = path
                app['icon'] = icon_emoji
                if file and file.filename:
                    file.save(os.path.join(ICON_DIR, f'{edit_id}.png'))
                save_config(config_data)
                return jsonify({"status": "updated"})
        return jsonify({"status": "not_found"}), 404
    else:
        new_id = str(uuid.uuid4())[:8]
        new_app = {"id": new_id, "name": name, "path": path, "icon": icon_emoji}
        config_data['apps'].append(new_app)
        if file and file.filename:
            file.save(os.path.join(ICON_DIR, f'{new_id}.png'))
        save_config(config_data)
        return jsonify({"status": "added", "app": new_app})

@app.route('/api/apps/<app_id>', methods=['DELETE'])
def delete_app(app_id):
    config_data['apps'] = [a for a in config_data['apps'] if a['id'] != app_id]
    icon_path = os.path.join(ICON_DIR, f'{app_id}.png')
    if os.path.exists(icon_path):
        os.remove(icon_path)
    save_config(config_data)
    return jsonify({"status": "deleted"})

@app.route('/api/reorder', methods=['POST'])
def reorder_apps():
    new_order = request.json.get('order', [])
    app_map = {app['id']: app for app in config_data['apps']}
    reordered = []
    for app_id in new_order:
        if app_id in app_map:
            reordered.append(app_map[app_id])
    for app in config_data['apps']:
        if app not in reordered:
            reordered.append(app)
    config_data['apps'] = reordered
    save_config(config_data)
    return jsonify({"status": "ok"})

@app.route('/api/launch/<app_id>', methods=['GET'])
def launch_app(app_id):
    for app in config_data['apps']:
        if app['id'] == app_id:
            path = app['path']
            try:
                if path.startswith('http') or path.startswith('https') or path.startswith('about:'):
                    subprocess.Popen(['start', path], shell=True)
                elif path.startswith('ms-settings:'):
                    subprocess.Popen(['start', path], shell=True)
                elif path.startswith('taskkill'):
                    subprocess.Popen(path, shell=True, creationflags=0x08000000)
                elif path.startswith('powershell'):
                    cmd = path[11:].strip()
                    subprocess.Popen(['powershell', '-Command', cmd], shell=True)
                elif path.startswith('rundll32'):
                    subprocess.Popen(path, shell=True)
                else:
                    subprocess.Popen(f'"{path}"', shell=True)
                return jsonify({"status": "launched"})
            except Exception as e:
                return jsonify({"status": "error", "msg": str(e)}), 500
    return jsonify({"status": "not_found"}), 404

@app.route('/api/upload_wallpaper', methods=['POST'])
def upload_wallpaper():
    if 'wallpaper' not in request.files:
        return jsonify({"status": "error", "msg": "No file uploaded"}), 400
    file = request.files['wallpaper']
    if file.filename == '':
        return jsonify({"status": "error", "msg": "Empty filename"}), 400
    orig_name = secure_filename(file.filename)
    name, ext = os.path.splitext(orig_name)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(WALLPAPER_DIR, unique_name)
    file.save(filepath)
    print(f"🖼️ Wallpaper saved: {filepath}")
    return jsonify({"status": "ok", "path": f"/wallpaper/{unique_name}"})

@app.route('/api/export', methods=['GET'])
def export_backup():
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('config.json', json.dumps(config_data, indent=4))
        for fname in os.listdir(ICON_DIR):
            full_path = os.path.join(ICON_DIR, fname)
            if os.path.isfile(full_path):
                zf.write(full_path, f'icons/{fname}')
        for fname in os.listdir(WALLPAPER_DIR):
            full_path = os.path.join(WALLPAPER_DIR, fname)
            if os.path.isfile(full_path):
                zf.write(full_path, f'wallpaper/{fname}')
    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='WinLauncherBackup.wlbackup'
    )

@app.route('/api/import', methods=['POST'])
def import_backup():
    if 'backup' not in request.files:
        return jsonify({"status": "error", "msg": "No file uploaded"}), 400
    file = request.files['backup']
    if not file.filename.endswith('.wlbackup'):
        return jsonify({"status": "error", "msg": "Invalid file format (must be .wlbackup)"}), 400

    try:
        temp_path = os.path.join(USER_DIR, 'temp_import.zip')
        file.save(temp_path)
        extract_dir = os.path.join(USER_DIR, 'temp_import')
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)
        os.makedirs(extract_dir)
        with zipfile.ZipFile(temp_path, 'r') as zf:
            zf.extractall(extract_dir)
        os.remove(temp_path)

        config_path = os.path.join(extract_dir, 'config.json')
        if not os.path.exists(config_path):
            shutil.rmtree(extract_dir)
            return jsonify({"status": "error", "msg": "Backup corrupted: config.json missing"}), 400

        with open(config_path, 'r') as f:
            imported_config = json.load(f)
        if 'apps' not in imported_config or 'settings' not in imported_config:
            shutil.rmtree(extract_dir)
            return jsonify({"status": "error", "msg": "Backup corrupted: invalid config"}), 400

        icons_src = os.path.join(extract_dir, 'icons')
        if os.path.exists(icons_src):
            shutil.rmtree(ICON_DIR)
            shutil.copytree(icons_src, ICON_DIR)

        wallpaper_src = os.path.join(extract_dir, 'wallpaper')
        if os.path.exists(wallpaper_src):
            shutil.rmtree(WALLPAPER_DIR)
            shutil.copytree(wallpaper_src, WALLPAPER_DIR)

        shutil.copy(config_path, CONFIG_FILE)
        shutil.rmtree(extract_dir)

        global config_data
        config_data = load_config()

        return jsonify({"status": "ok", "message": "Backup imported successfully. Please refresh."})
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)}), 500

# ---------- mDNS ----------
def register_mdns():
    zeroconf = Zeroconf()
    hostname = socket.gethostname()
    ip = socket.gethostbyname(hostname)
    if not ip.startswith('192.168.') and not ip.startswith('10.') and not ip.startswith('172.'):
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
    print(f"✅ mDNS: http://winlauncher.local:{PORT}")
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
        self.setWindowTitle("WinLauncher")
        self.setFixedSize(450, 550)
        self.setStyleSheet("background-color: #000000;")
        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setAlignment(Qt.AlignCenter)

        label_info = QLabel("📱 Scan to connect")
        label_info.setStyleSheet("color: white; font-size: 16px; font-weight: bold; text-align: center;")
        label_info.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_info)

        local_ip = get_local_ip()
        url = f"http://{local_ip}:{PORT}"
        label_url = QLabel(f"🌐 {url}")
        label_url.setStyleSheet("color: #aaa; font-size: 14px; text-align: center; margin-bottom: 10px;")
        label_url.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_url)

        qr_img = qrcode.make(url)
        buffer = BytesIO()
        qr_img.save(buffer, format="PNG")
        pixmap = QPixmap()
        pixmap.loadFromData(buffer.getvalue())
        label_qr = QLabel()
        label_qr.setPixmap(pixmap.scaled(300, 300, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        label_qr.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_qr)

        label_mdns = QLabel(f"📶 Also: http://winlauncher.local:{PORT}")
        label_mdns.setStyleSheet("color: #888; font-size: 12px; text-align: center; margin-top: 15px;")
        label_mdns.setAlignment(Qt.AlignCenter)
        layout.addWidget(label_mdns)

# ---------- Run ----------
def run_flask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

if __name__ == '__main__':
    threading.Thread(target=run_flask, daemon=True).start()
    zeroconf = register_mdns()

    qt_app = QApplication(sys.argv)
    window = QRWindow()
    window.show()

    def cleanup():
        zeroconf.unregister_all_services()
        zeroconf.close()
    qt_app.aboutToQuit.connect(cleanup)

    sys.exit(qt_app.exec_())
