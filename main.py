import sys
import socket
import threading
import json
import os
import subprocess
import uuid
import re
from flask import Flask, request, render_template, jsonify, send_from_directory, send_file
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QLabel, QWidget
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QPixmap
import qrcode
from io import BytesIO
from zeroconf import ServiceInfo, Zeroconf
from PIL import Image, ImageDraw, ImageFont

# ---------- User Data Directory ----------
APPDATA = os.path.expandvars('%APPDATA%')
USER_DIR = os.path.join(APPDATA, 'WinLauncher')
ICON_DIR = os.path.join(USER_DIR, 'icons')
CONFIG_FILE = os.path.join(USER_DIR, 'config.json')
PWA_ICON_DIR = os.path.join(USER_DIR, 'pwa')
WALLPAPER_DIR = os.path.join(USER_DIR, 'wallpaper')
os.makedirs(ICON_DIR, exist_ok=True)
os.makedirs(PWA_ICON_DIR, exist_ok=True)
os.makedirs(WALLPAPER_DIR, exist_ok=True)

# ---------- Flask Setup ----------
app = Flask(__name__, static_folder='static', template_folder='templates')
PORT = 5000

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

# ---------- System App IDs ----------
SYSTEM_APP_IDS = ['edit_shortcuts', 'grid_settings']
SYSTEM_PAGE_NAME = "System Tools"

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
    {"id": "closeall", "name": "Close Browsers", "path": "taskkill /IM chrome.exe /F & taskkill /IM msedge.exe /F & taskkill /IM firefox.exe /F", "icon": "❌"},
    {"id": "edit_shortcuts", "name": "Edit Shortcuts", "path": "system:edit", "icon": "✏️", "is_system": True},
    {"id": "grid_settings", "name": "Grid Settings", "path": "system:settings", "icon": "⚙️", "is_system": True}
]

DEFAULT_SETTINGS = {
    "grid": {
        "cols": 2,
        "rows": 6,
        "icon_size": 64,
        "grid_size": 16,
        "blur": 0,
        "bg_type": "color",
        "bg_value": "#000000"
    }
}

def get_capacity():
    return DEFAULT_SETTINGS["grid"]["cols"] * DEFAULT_SETTINGS["grid"]["rows"]  # 12

def load_config():
    if not os.path.exists(CONFIG_FILE):
        all_apps = DEFAULT_APPS[:]
        system_apps = [a for a in all_apps if a['id'] in SYSTEM_APP_IDS]
        normal_apps = [a for a in all_apps if a['id'] not in SYSTEM_APP_IDS]
        pages = []
        capacity = get_capacity()
        for i in range(0, len(normal_apps), capacity):
            page_apps = normal_apps[i:i+capacity]
            page_id = str(uuid.uuid4())[:8]
            pages.append({
                "id": page_id,
                "name": f"Page {len(pages)+1}",
                "appIds": [app["id"] for app in page_apps]
            })
        sys_page_id = str(uuid.uuid4())[:8]
        pages.append({
            "id": sys_page_id,
            "name": SYSTEM_PAGE_NAME,
            "appIds": [a["id"] for a in system_apps]
        })
        data = {
            "apps": all_apps,
            "pages": pages,
            "settings": DEFAULT_SETTINGS
        }
        with open(CONFIG_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        return data
    
    with open(CONFIG_FILE, 'r') as f:
        data = json.load(f)
    
    # Ensure all default apps are present
    existing_ids = {app['id'] for app in data.get('apps', [])}
    for default_app in DEFAULT_APPS:
        if default_app['id'] not in existing_ids:
            data['apps'].append(default_app)
    
    # Ensure system page exists and is last
    system_page = None
    other_pages = []
    for page in data.get('pages', []):
        if page.get('name') == SYSTEM_PAGE_NAME:
            system_page = page
        else:
            other_pages.append(page)
    
    if not system_page:
        sys_page_id = str(uuid.uuid4())[:8]
        system_page = {"id": sys_page_id, "name": SYSTEM_PAGE_NAME, "appIds": []}
        other_pages.append(system_page)
    
    # Ensure system page has only system apps
    system_page['appIds'] = [aid for aid in system_page['appIds'] if aid in SYSTEM_APP_IDS]
    for aid in SYSTEM_APP_IDS:
        if aid not in system_page['appIds']:
            system_page['appIds'].append(aid)
    for page in other_pages:
        page['appIds'] = [aid for aid in page['appIds'] if aid not in SYSTEM_APP_IDS]
    
    # Rebuild normal pages with capacity
    all_normal_app_ids = [app['id'] for app in data['apps'] if app['id'] not in SYSTEM_APP_IDS]
    capacity = get_capacity()
    new_pages = []
    for idx, app_id in enumerate(all_normal_app_ids):
        if idx % capacity == 0:
            page_id = str(uuid.uuid4())[:8]
            new_pages.append({
                "id": page_id,
                "name": f"Page {len(new_pages)+1}",
                "appIds": []
            })
        new_pages[-1]['appIds'].append(app_id)
    if not new_pages:
        page_id = str(uuid.uuid4())[:8]
        new_pages.append({"id": page_id, "name": "Page 1", "appIds": []})
    
    new_pages.append(system_page)
    data['pages'] = new_pages
    
    if 'settings' not in data:
        data['settings'] = DEFAULT_SETTINGS
    elif 'grid' not in data['settings']:
        data['settings']['grid'] = DEFAULT_SETTINGS['grid']
    
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=4)
    
    return data

def save_config(data):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=4)

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

@app.route('/api/apps', methods=['GET'])
def get_apps():
    return jsonify(config_data['apps'])

@app.route('/api/apps', methods=['POST'])
def add_or_edit_app():
    name = request.form.get('name', '').strip()
    path = request.form.get('path', '').strip()
    icon_emoji = request.form.get('icon', '📦')
    edit_id = request.form.get('edit_id')
    file = request.files.get('icon_file')
    page_id = request.form.get('page_id')

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
        
        # Find target page
        target_page = None
        if page_id:
            for page in config_data['pages']:
                if page['id'] == page_id:
                    target_page = page
                    break
        capacity = get_capacity()
        if not target_page or len(target_page['appIds']) >= capacity:
            if target_page:
                # Create new page after target_page with same name
                base_name = target_page['name']
                # If name ends with a number, increment it
                match = re.search(r'(\d+)$', base_name)
                if match:
                    num = int(match.group(1)) + 1
                    new_name = re.sub(r'\d+$', str(num), base_name)
                else:
                    new_name = base_name + ' 2'
                target_index = config_data['pages'].index(target_page)
                new_page_id = str(uuid.uuid4())[:8]
                new_page = {"id": new_page_id, "name": new_name, "appIds": []}
                config_data['pages'].insert(target_index + 1, new_page)
                target_page = new_page
            else:
                # Find first page with space (excluding system)
                for page in config_data['pages']:
                    if len(page['appIds']) < capacity and page.get('name') != SYSTEM_PAGE_NAME:
                        target_page = page
                        break
                if not target_page:
                    # Create new page at end (before system)
                    sys_index = None
                    for i, p in enumerate(config_data['pages']):
                        if p.get('name') == SYSTEM_PAGE_NAME:
                            sys_index = i
                            break
                    new_page_id = str(uuid.uuid4())[:8]
                    new_page = {"id": new_page_id, "name": f"Page {len(config_data['pages'])}", "appIds": []}
                    if sys_index is not None:
                        config_data['pages'].insert(sys_index, new_page)
                    else:
                        config_data['pages'].append(new_page)
                    target_page = new_page
        target_page['appIds'].append(new_id)
        save_config(config_data)
        return jsonify({"status": "added", "app": new_app})

@app.route('/api/apps/<app_id>', methods=['DELETE'])
def delete_app(app_id):
    if app_id in SYSTEM_APP_IDS:
        return jsonify({"status": "error", "msg": "Cannot delete system app"}), 400
    config_data['apps'] = [a for a in config_data['apps'] if a['id'] != app_id]
    icon_path = os.path.join(ICON_DIR, f'{app_id}.png')
    if os.path.exists(icon_path):
        os.remove(icon_path)
    for page in config_data['pages']:
        if app_id in page['appIds']:
            page['appIds'].remove(app_id)
    save_config(config_data)
    return jsonify({"status": "deleted"})

@app.route('/api/launch/<app_id>', methods=['GET'])
def launch_app(app_id):
    for app in config_data['apps']:
        if app['id'] == app_id:
            path = app['path']
            if path.startswith('system:'):
                return jsonify({"status": "system", "action": path.split(':', 1)[1]})
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

# ---------- Pages API ----------
@app.route('/api/pages', methods=['GET'])
def get_pages():
    return jsonify(config_data['pages'])

@app.route('/api/pages', methods=['POST'])
def add_page():
    name = request.json.get('name', 'New Page')
    sys_index = None
    for i, p in enumerate(config_data['pages']):
        if p.get('name') == SYSTEM_PAGE_NAME:
            sys_index = i
            break
    page_id = str(uuid.uuid4())[:8]
    new_page = {"id": page_id, "name": name, "appIds": []}
    if sys_index is not None:
        config_data['pages'].insert(sys_index, new_page)
    else:
        config_data['pages'].append(new_page)
    save_config(config_data)
    return jsonify({"status": "added", "page": new_page})

@app.route('/api/pages/<page_id>', methods=['DELETE'])
def delete_page(page_id):
    for page in config_data['pages']:
        if page['id'] == page_id and page.get('name') == SYSTEM_PAGE_NAME:
            return jsonify({"status": "error", "msg": "Cannot delete system page"}), 400
    config_data['pages'] = [p for p in config_data['pages'] if p['id'] != page_id]
    save_config(config_data)
    return jsonify({"status": "deleted"})

@app.route('/api/pages/<page_id>', methods=['PUT'])
def rename_page(page_id):
    new_name = request.json.get('name')
    for page in config_data['pages']:
        if page['id'] == page_id:
            if page.get('name') == SYSTEM_PAGE_NAME:
                return jsonify({"status": "error", "msg": "Cannot rename system page"}), 400
            page['name'] = new_name
            save_config(config_data)
            return jsonify({"status": "renamed"})
    return jsonify({"status": "not_found"}), 404

@app.route('/api/pages/reorder', methods=['POST'])
def reorder_pages():
    new_order = request.json.get('order', [])
    system_page = None
    other_pages = []
    for p in config_data['pages']:
        if p.get('name') == SYSTEM_PAGE_NAME:
            system_page = p
        else:
            other_pages.append(p)
    page_map = {p['id']: p for p in other_pages}
    reordered = []
    for pid in new_order:
        if pid in page_map:
            reordered.append(page_map[pid])
    for p in other_pages:
        if p not in reordered:
            reordered.append(p)
    if system_page:
        reordered.append(system_page)
    config_data['pages'] = reordered
    save_config(config_data)
    return jsonify({"status": "ok"})

@app.route('/api/pages/move-app', methods=['POST'])
def move_app():
    data = request.json
    app_id = data.get('appId')
    from_page_id = data.get('fromPageId')
    to_page_id = data.get('toPageId')
    from_index = data.get('fromIndex')
    to_index = data.get('toIndex')
    
    if app_id in SYSTEM_APP_IDS:
        return jsonify({"status": "error", "msg": "Cannot move system app"}), 400
    
    if from_page_id:
        for page in config_data['pages']:
            if page['id'] == from_page_id:
                if app_id in page['appIds']:
                    page['appIds'].remove(app_id)
                break
    if to_page_id is not None:
        for page in config_data['pages']:
            if page['id'] == to_page_id and page.get('name') == SYSTEM_PAGE_NAME:
                return jsonify({"status": "error", "msg": "Cannot move app to system page"}), 400
        for page in config_data['pages']:
            if page['id'] == to_page_id:
                if to_index is not None:
                    page['appIds'].insert(to_index, app_id)
                else:
                    page['appIds'].append(app_id)
                break
    save_config(config_data)
    return jsonify({"status": "ok"})

# ---------- Settings API ----------
@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(config_data.get('settings', DEFAULT_SETTINGS))

@app.route('/api/settings', methods=['POST'])
def save_settings():
    data = request.json
    if 'grid' in data:
        config_data['settings'] = data
    else:
        config_data['settings'] = {"grid": data}
    save_config(config_data)
    return jsonify({"status": "ok"})

# ---------- Export / Import ----------
@app.route('/api/export', methods=['GET'])
def export_config():
    # Return full config (already includes wallpaper data URLs)
    return jsonify(config_data)

@app.route('/api/import', methods=['POST'])
def import_config():
    imported = request.json
    if not imported or 'apps' not in imported or 'pages' not in imported or 'settings' not in imported:
        return jsonify({"status": "error", "msg": "Invalid data"}), 400
    global config_data
    config_data = imported
    save_config(config_data)
    return jsonify({"status": "ok"})

# ---------- mDNS ----------
def register_mdns():
    zeroconf = Zeroconf()
    info = ServiceInfo(
        "_http._tcp.local.",
        "WinLauncher._http._tcp.local.",
        addresses=[socket.inet_aton("127.0.0.1")],
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
