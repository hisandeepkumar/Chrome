import sys
import socket
import threading
import json
import os
import subprocess
import uuid
import re
import base64
import ctypes
from ctypes import wintypes
from flask import Flask, request, render_template, jsonify, send_from_directory
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QLabel, QWidget
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QPixmap
import qrcode
from io import BytesIO
from zeroconf import ServiceInfo, Zeroconf
from PIL import Image, ImageDraw, ImageFont

# ---------- Windows Shortcut Parser (ctypes, no pywin32) ----------
# Structure for SHFILEINFOW
class SHFILEINFOW(ctypes.Structure):
    _fields_ = [
        ("hIcon", wintypes.HANDLE),
        ("iIcon", ctypes.c_int),
        ("dwAttributes", wintypes.DWORD),
        ("szDisplayName", wintypes.WCHAR * 260),
        ("szTypeName", wintypes.WCHAR * 80),
    ]

def get_lnk_target(lnk_path):
    """Read the target of a .lnk file using shell32 (works without pywin32)."""
    try:
        shell32 = ctypes.windll.shell32
        ole32 = ctypes.windll.ole32
        # CLSID_ShellLink = {00021401-0000-0000-C000-000000000046}
        CLSID_ShellLink = ctypes.create_guid("{00021401-0000-0000-C000-000000000046}")
        # IID_IShellLinkW = {000214F9-0000-0000-C000-000000000046}
        IID_IShellLinkW = ctypes.create_guid("{000214F9-0000-0000-C000-000000000046}")
        
        ole32.CoInitialize(None)
        ppsl = ctypes.POINTER(ctypes.c_void_p)()
        hr = ole32.CoCreateInstance(ctypes.byref(CLSID_ShellLink), None, 1, ctypes.byref(IID_IShellLinkW), ctypes.byref(ppsl))
        if hr != 0:
            return None
        ppf = ctypes.POINTER(ctypes.c_void_p)()
        IID_IPersistFile = ctypes.create_guid("{0000010B-0000-0000-C000-000000000046}")
        hr = ppsl[0].QueryInterface(ctypes.byref(IID_IPersistFile), ctypes.byref(ppf))
        if hr != 0:
            return None
        hr = ppf[0].Load(lnk_path, 0)
        if hr != 0:
            return None
        target = ctypes.create_unicode_buffer(260)
        ppsl[0].GetPath(target, 260, None, 0)
        return target.value
    except Exception:
        return None

def get_installed_windows_apps():
    """Scan Start Menu folders for .lnk shortcuts and extract targets."""
    apps = []
    # Common Start Menu folders in Windows 10/11
    folders = [
        os.path.expandvars("%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs"),
        os.path.expandvars("%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs"),
        os.path.expandvars("%ALLUSERSPROFILE%\\Microsoft\\Windows\\Start Menu\\Programs")
    ]
    # Also check the user's pinned apps? (optional, but not needed)
    seen = set()
    for folder in folders:
        if not os.path.exists(folder):
            continue
        for root, dirs, files in os.walk(folder):
            for file in files:
                if file.lower().endswith('.lnk'):
                    lnk_path = os.path.join(root, file)
                    target = get_lnk_target(lnk_path)
                    if target and target.lower().endswith('.exe') and target not in seen:
                        seen.add(target)
                        name = os.path.splitext(file)[0]
                        name = name.replace(' - Shortcut', '').strip()
                        # Create stable ID
                        app_id = f"winapp_{hash(target) & 0xFFFFFFFF:08x}"
                        apps.append({
                            "id": app_id,
                            "name": name,
                            "path": target,
                            "icon": "🖥️",
                            "is_windows_app": True,
                            "is_system": True
                        })
    return apps

# ---------- User Data Directory ----------
APPDATA = os.path.expandvars('%APPDATA%')
USER_DIR = os.path.join(APPDATA, 'WinLauncher')
ICON_DIR = os.path.join(USER_DIR, 'icons')
CONFIG_FILE = os.path.join(USER_DIR, 'config.json')
PWA_ICON_DIR = os.path.join(USER_DIR, 'pwa')
os.makedirs(ICON_DIR, exist_ok=True)
os.makedirs(PWA_ICON_DIR, exist_ok=True)

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

# ---------- System Constants ----------
SYSTEM_APP_IDS = ['edit_shortcuts', 'grid_settings', 'restore_windows_apps']
SYSTEM_PAGE_NAME = "System Tools"
WINDOWS_APPS_PAGE_NAME = "Windows Applications"

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
    # System tools
    {"id": "edit_shortcuts", "name": "Edit Shortcuts", "path": "system:edit", "icon": "✏️", "is_system": True},
    {"id": "grid_settings", "name": "Grid Settings", "path": "system:settings", "icon": "⚙️", "is_system": True},
    {"id": "restore_windows_apps", "name": "Restore Windows Apps", "path": "system:restore_windows", "icon": "🔄", "is_system": True}
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

# ---------- Windows Apps Refresh Logic ----------
def refresh_windows_apps():
    """Re-scan for new Windows apps and add them to config, but keep user deletions."""
    global config_data
    installed = get_installed_windows_apps()
    installed_ids = {app['id'] for app in installed}
    
    # Get existing windows apps from config (including user-deleted ones will be missing)
    existing_windows_ids = {app['id'] for app in config_data['apps'] if app.get('is_windows_app', False)}
    
    # Find new apps that are installed but not in config
    new_apps = []
    for app in installed:
        if app['id'] not in existing_windows_ids:
            new_apps.append(app)
    
    if not new_apps:
        # No new apps, but ensure windows page exists
        ensure_windows_page_exists()
        return len(new_apps)
    
    # Add new apps to config
    config_data['apps'].extend(new_apps)
    rebuild_windows_pages()
    save_config(config_data)
    return len(new_apps)

def ensure_windows_page_exists():
    """Create Windows Applications page(s) if none exist."""
    has_windows_page = any(p.get('type') == 'windows_apps' for p in config_data['pages'])
    if has_windows_page:
        return
    rebuild_windows_pages()

def rebuild_windows_pages():
    """Rebuild the Windows Applications page(s) based on current windows apps in config."""
    # Remove existing windows pages
    config_data['pages'] = [p for p in config_data['pages'] if p.get('type') != 'windows_apps']
    
    win_apps = [app for app in config_data['apps'] if app.get('is_windows_app', False)]
    if not win_apps:
        return
    
    capacity = get_capacity()
    windows_pages = []
    for i in range(0, len(win_apps), capacity):
        page_apps = win_apps[i:i+capacity]
        page_id = str(uuid.uuid4())[:8]
        page_name = WINDOWS_APPS_PAGE_NAME if i == 0 else f"{WINDOWS_APPS_PAGE_NAME} {i//capacity + 1}"
        windows_pages.append({
            "id": page_id,
            "name": page_name,
            "type": "windows_apps",
            "appIds": [app["id"] for app in page_apps]
        })
    
    # Insert before system page
    sys_index = None
    for i, p in enumerate(config_data['pages']):
        if p.get('name') == SYSTEM_PAGE_NAME:
            sys_index = i
            break
    if sys_index is not None:
        config_data['pages'][sys_index:sys_index] = windows_pages
    else:
        config_data['pages'].extend(windows_pages)
    save_config(config_data)

# ---------- Config Load ----------
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
    all_normal_app_ids = [app['id'] for app in data['apps'] if app['id'] not in SYSTEM_APP_IDS and not app.get('is_windows_app', False)]
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
    
    # Handle windows apps
    data['pages'] = [p for p in data['pages'] if p.get('type') != 'windows_apps']
    win_apps = [app for app in data['apps'] if app.get('is_windows_app', False)]
    if win_apps:
        win_page_apps = []
        for i in range(0, len(win_apps), capacity):
            page_apps = win_apps[i:i+capacity]
            page_id = str(uuid.uuid4())[:8]
            page_name = WINDOWS_APPS_PAGE_NAME if i == 0 else f"{WINDOWS_APPS_PAGE_NAME} {i//capacity + 1}"
            win_page_apps.append({
                "id": page_id,
                "name": page_name,
                "type": "windows_apps",
                "appIds": [app["id"] for app in page_apps]
            })
        sys_index = None
        for i, p in enumerate(new_pages):
            if p.get('name') == SYSTEM_PAGE_NAME:
                sys_index = i
                break
        if sys_index is not None:
            new_pages[sys_index:sys_index] = win_page_apps
        else:
            new_pages.extend(win_page_apps)
    
    # Add system page at the end
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

# ---------- Flask Routes ----------
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

# ---------- Apps API ----------
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
            if app['id'] == edit_id and app.get('is_windows_app', False):
                return jsonify({"status": "error", "msg": "Cannot edit Windows app"}), 400

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
        
        target_page = None
        if page_id:
            for page in config_data['pages']:
                if page['id'] == page_id and page.get('type') not in ['windows_apps', 'system']:
                    target_page = page
                    break
        capacity = get_capacity()
        if not target_page:
            for page in config_data['pages']:
                if page.get('type') not in ['windows_apps', 'system'] and len(page['appIds']) < capacity:
                    target_page = page
                    break
        if not target_page:
            sys_index = None
            for i, p in enumerate(config_data['pages']):
                if p.get('type') in ['windows_apps', 'system']:
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
                action = path.split(':', 1)[1]
                if action == 'restore_windows':
                    count = refresh_windows_apps()
                    return jsonify({"status": "restored", "count": count})
                return jsonify({"status": "system", "action": action})
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
    if name in [SYSTEM_PAGE_NAME, WINDOWS_APPS_PAGE_NAME]:
        return jsonify({"status": "error", "msg": "Reserved page name"}), 400
    sys_index = None
    for i, p in enumerate(config_data['pages']):
        if p.get('type') in ['windows_apps', 'system']:
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
        if page['id'] == page_id:
            if page.get('type') == 'system':
                return jsonify({"status": "error", "msg": "Cannot delete system page"}), 400
            break
    config_data['pages'] = [p for p in config_data['pages'] if p['id'] != page_id]
    save_config(config_data)
    return jsonify({"status": "deleted"})

@app.route('/api/pages/<page_id>', methods=['PUT'])
def rename_page(page_id):
    new_name = request.json.get('name')
    for page in config_data['pages']:
        if page['id'] == page_id:
            if page.get('type') in ['windows_apps', 'system']:
                return jsonify({"status": "error", "msg": "Cannot rename special page"}), 400
            page['name'] = new_name
            save_config(config_data)
            return jsonify({"status": "renamed"})
    return jsonify({"status": "not_found"}), 404

@app.route('/api/pages/reorder', methods=['POST'])
def reorder_pages():
    new_order = request.json.get('order', [])
    system_pages = []
    windows_pages = []
    normal_pages = []
    page_map = {p['id']: p for p in config_data['pages']}
    for pid in new_order:
        p = page_map.get(pid)
        if not p:
            continue
        if p.get('type') == 'system':
            system_pages.append(p)
        elif p.get('type') == 'windows_apps':
            windows_pages.append(p)
        else:
            normal_pages.append(p)
    for p in config_data['pages']:
        if p not in normal_pages and p not in windows_pages and p not in system_pages:
            if p.get('type') == 'system':
                system_pages.append(p)
            elif p.get('type') == 'windows_apps':
                windows_pages.append(p)
            else:
                normal_pages.append(p)
    reordered = normal_pages + windows_pages + system_pages
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
    
    for app in config_data['apps']:
        if app['id'] == app_id and app.get('is_windows_app'):
            return jsonify({"status": "error", "msg": "Cannot move Windows app"}), 400
    
    if from_page_id:
        for page in config_data['pages']:
            if page['id'] == from_page_id:
                if app_id in page['appIds']:
                    page['appIds'].remove(app_id)
                break
    if to_page_id is not None:
        for page in config_data['pages']:
            if page['id'] == to_page_id and page.get('type') in ['windows_apps', 'system']:
                return jsonify({"status": "error", "msg": "Cannot move to special page"}), 400
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
    export_data = config_data.copy()
    icons = {}
    for app in config_data['apps']:
        app_id = app['id']
        icon_path = os.path.join(ICON_DIR, f'{app_id}.png')
        if os.path.exists(icon_path):
            with open(icon_path, 'rb') as f:
                icon_data = base64.b64encode(f.read()).decode('utf-8')
                icons[app_id] = icon_data
    export_data['icons'] = icons
    return jsonify(export_data)

@app.route('/api/import', methods=['POST'])
def import_config():
    imported = request.json
    if not imported or 'apps' not in imported or 'pages' not in imported or 'settings' not in imported:
        return jsonify({"status": "error", "msg": "Invalid data"}), 400
    
    if 'icons' in imported:
        for app_id, icon_base64 in imported['icons'].items():
            icon_path = os.path.join(ICON_DIR, f'{app_id}.png')
            try:
                icon_data = base64.b64decode(icon_base64)
                with open(icon_path, 'wb') as f:
                    f.write(icon_data)
            except:
                pass
    imported.pop('icons', None)
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
