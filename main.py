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
import winreg
from ctypes import wintypes
from flask import Flask, request, render_template, jsonify, send_from_directory
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QLabel, QWidget
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QPixmap
import qrcode
from io import BytesIO
from zeroconf import ServiceInfo, Zeroconf
from PIL import Image, ImageDraw, ImageFont

print("\n" + "="*70)
print("🚀 WINLAUNCHER - Starting with ENHANCED Windows App Detection")
print("="*70 + "\n")

# ---------- Windows App Detection - MULTIPLE METHODS ----------

def get_installed_programs_from_registry():
    """Get installed programs from Windows Registry (MOST RELIABLE)"""
    programs = []
    print("📚 Method 1: Reading from Windows Registry...")
    
    reg_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    
    count = 0
    for hkey, path in reg_paths:
        try:
            with winreg.OpenKey(hkey, path) as key:
                i = 0
                while True:
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(hkey, path + "\\" + subkey_name) as subkey:
                            try:
                                display_name = winreg.QueryValueEx(subkey, "DisplayName")[0]
                                try:
                                    install_location = winreg.QueryValueEx(subkey, "InstallLocation")[0]
                                except:
                                    install_location = ""
                                
                                # Look for executable
                                if install_location and os.path.exists(install_location):
                                    # Find main exe
                                    exe_path = None
                                    app_name = display_name.split()[0]  # First word
                                    
                                    # Common exe names
                                    for exe_name in [app_name.lower(), "application.exe", app_name.lower() + ".exe"]:
                                        potential_path = os.path.join(install_location, exe_name)
                                        if os.path.exists(potential_path) and potential_path.lower().endswith('.exe'):
                                            exe_path = potential_path
                                            break
                                    
                                    # Search in folder
                                    if not exe_path:
                                        for file in os.listdir(install_location):
                                            if file.lower().endswith('.exe'):
                                                exe_path = os.path.join(install_location, file)
                                                break
                                    
                                    if exe_path and os.path.exists(exe_path):
                                        app_id = f"winapp_{hash(exe_path) & 0xFFFFFFFF:08x}"
                                        programs.append({
                                            "id": app_id,
                                            "name": display_name,
                                            "path": exe_path,
                                            "icon": "fas fa-windows",  # Font Awesome icon
                                            "is_windows_app": True,
                                            "is_system": False
                                        })
                                        count += 1
                                        if count <= 5:  # Show first 5
                                            print(f"   ✅ Found: {display_name}")
                            except:
                                pass
                        i += 1
                    except WindowsError:
                        break
        except Exception as e:
            print(f"   ⚠️ Registry path error: {str(e)[:50]}")
            pass
    
    print(f"   📊 Registry method found: {count} programs\n")
    return programs


def get_installed_windows_apps_from_shortcuts():
    """Fallback: Get apps from Start Menu shortcuts (.lnk files)"""
    apps = []
    print("📂 Method 2: Scanning Start Menu Shortcuts...")
    
    folders = [
        os.path.expandvars("%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs"),
        os.path.expandvars("%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs"),
    ]
    
    seen = set()
    total_scanned = 0
    
    for folder in folders:
        if not os.path.exists(folder):
            print(f"   ⊘ Folder not found: {folder}")
            continue
        
        print(f"   ✅ Scanning: {folder}")
        try:
            for root, dirs, files in os.walk(folder):
                for file in files:
                    if file.lower().endswith('.lnk'):
                        total_scanned += 1
                        lnk_path = os.path.join(root, file)
                        
                        # Try to extract target path from .lnk binary
                        try:
                            with open(lnk_path, 'rb') as f:
                                data = f.read()
                            
                            # Extract strings from binary
                            strings = []
                            current = b''
                            for byte in data:
                                if 32 <= byte <= 126:
                                    current += bytes([byte])
                                else:
                                    if len(current) > 5:
                                        strings.append(current.decode('utf-8', errors='ignore'))
                                    current = b''
                            
                            # Find .exe path
                            for s in strings:
                                if '.exe' in s.lower() and len(s) > 10:
                                    if os.path.exists(s):
                                        if s not in seen:
                                            seen.add(s)
                                            name = os.path.splitext(file)[0].replace(' - Shortcut', '').strip()
                                            app_id = f"winapp_{hash(s) & 0xFFFFFFFF:08x}"
                                            apps.append({
                                                "id": app_id,
                                                "name": name,
                                                "path": s,
                                                "icon": "fas fa-windows",
                                                "is_windows_app": True,
                                                "is_system": False
                                            })
                                            print(f"   ✅ From shortcut: {name}")
                                            break
                        except:
                            pass
        except Exception as e:
            print(f"   ⚠️ Error scanning folder: {str(e)[:50]}")
    
    print(f"   📊 Shortcut method found: {len(apps)} apps (scanned {total_scanned} .lnk files)\n")
    return apps


def get_installed_windows_apps():
    """Combined method - tries Registry first, then shortcuts"""
    print("\n" + "="*70)
    print("🔍 DETECTING WINDOWS APPLICATIONS...")
    print("="*70 + "\n")
    
    all_apps = []
    seen_ids = set()
    
    # Try registry first (most reliable)
    try:
        registry_apps = get_installed_programs_from_registry()
        for app in registry_apps:
            if app['id'] not in seen_ids:
                all_apps.append(app)
                seen_ids.add(app['id'])
    except Exception as e:
        print(f"⚠️ Registry method failed: {str(e)[:50]}\n")
    
    # Try shortcuts as fallback
    try:
        shortcut_apps = get_installed_windows_apps_from_shortcuts()
        for app in shortcut_apps:
            if app['id'] not in seen_ids:
                all_apps.append(app)
                seen_ids.add(app['id'])
    except Exception as e:
        print(f"⚠️ Shortcut method failed: {str(e)[:50]}\n")
    
    print("="*70)
    if len(all_apps) > 0:
        print(f"✅ DETECTION COMPLETE: Found {len(all_apps)} Windows applications!")
    else:
        print("⚠️ No Windows applications detected!")
        print("   • Registry may be restricted")
        print("   • Start Menu may be empty")
        print("   • Try manually adding apps via UI")
    print("="*70 + "\n")
    
    return all_apps


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
    # Social Media Apps
    {"id": "instagram", "name": "Instagram", "path": "https://instagram.com", "icon": "fab fa-instagram"},
    {"id": "youtube", "name": "YouTube", "path": "https://youtube.com", "icon": "fab fa-youtube"},
    {"id": "facebook", "name": "Facebook", "path": "https://facebook.com", "icon": "fab fa-facebook"},
    {"id": "google", "name": "Google", "path": "https://google.com", "icon": "fab fa-google"},
    {"id": "twitter", "name": "Twitter", "path": "https://twitter.com", "icon": "fab fa-twitter"},
    {"id": "chat", "name": "Chat", "path": "https://chat.openai.com", "icon": "fas fa-comment-dots"},  # or any chat
    {"id": "deepseek", "name": "DeepSeek", "path": "https://chat.deepseek.com", "icon": "fas fa-robot"},
    {"id": "gemini", "name": "Gemini", "path": "https://gemini.google.com", "icon": "fas fa-brain"},
    {"id": "claude", "name": "Claude", "path": "https://claude.ai", "icon": "fas fa-hand-sparkles"},
    {"id": "grok", "name": "Grok", "path": "https://grok.x.ai", "icon": "fas fa-arrow-trend-up"},
    {"id": "whatsapp_web", "name": "Web WhatsApp", "path": "https://web.whatsapp.com", "icon": "fab fa-whatsapp"},
    {"id": "telegram_web", "name": "Web Telegram", "path": "https://web.telegram.org", "icon": "fab fa-telegram-plane"},

    # VLC, MS Word, OBS Studio
    {"id": "vlc", "name": "VLC", "path": "vlc.exe", "icon": "fas fa-play-circle"},
    {"id": "word", "name": "MS Word", "path": "WINWORD.EXE", "icon": "fas fa-file-word"},
    {"id": "obs", "name": "OBS Studio", "path": "obs64.exe", "icon": "fas fa-video"},

    # Quick Settings Apps
    {"id": "volup", "name": "Volume +", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]175)", "icon": "fas fa-volume-up"},
    {"id": "voldown", "name": "Volume -", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]174)", "icon": "fas fa-volume-down"},
    {"id": "brightup", "name": "Brightness +", "path": "powershell -c (Get-WmiObject -Class WmiMonitorBrightnessMethods -Namespace root\\wmi).WmiSetBrightness(1,100)", "icon": "fas fa-sun"},
    {"id": "brightdown", "name": "Brightness -", "path": "powershell -c (Get-WmiObject -Class WmiMonitorBrightnessMethods -Namespace root\\wmi).WmiSetBrightness(1,50)", "icon": "fas fa-sun"},
    {"id": "mute", "name": "Mute", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]173)", "icon": "fas fa-volume-mute"},
    {"id": "unmute", "name": "Unmute", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]173)", "icon": "fas fa-volume-up"},  # Toggle
    {"id": "micmute", "name": "Mic Mute", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]173)", "icon": "fas fa-microphone-slash"},  # Might need actual toggle
    {"id": "micunmute", "name": "Mic Unmute", "path": "powershell -c (New-Object -ComObject WScript.Shell).SendKeys([char]173)", "icon": "fas fa-microphone"},
    {"id": "bluetooth", "name": "Add Bluetooth", "path": "ms-settings:bluetooth", "icon": "fab fa-bluetooth-b"},
    {"id": "minimizeall", "name": "Minimize All", "path": "powershell -c (New-Object -ComObject shell.application).MinimizeAll()", "icon": "fas fa-window-minimize"},
    {"id": "closeall", "name": "Close All Apps", "path": "taskkill /IM chrome.exe /F & taskkill /IM msedge.exe /F & taskkill /IM firefox.exe /F", "icon": "fas fa-times-circle"},
    {"id": "taskmgr", "name": "Task Manager", "path": "taskmgr.exe", "icon": "fas fa-tasks"},
    {"id": "control", "name": "Control Center", "path": "control.exe", "icon": "fas fa-cogs"},

    # Additional system tools (existing)
    {"id": "wifi", "name": "WiFi", "path": "ms-settings:network-wifi", "icon": "fas fa-wifi"},
    {"id": "display", "name": "Display", "path": "ms-settings:display", "icon": "fas fa-desktop"},
    {"id": "sound", "name": "Sound", "path": "ms-settings:sound", "icon": "fas fa-volume-up"},
    {"id": "lockpc", "name": "Lock PC", "path": "rundll32.exe user32.dll,LockWorkStation", "icon": "fas fa-lock"},
    {"id": "snipping", "name": "Snipping Tool", "path": "SnippingTool.exe", "icon": "fas fa-scissors"},
    {"id": "notepad", "name": "Notepad", "path": "notepad.exe", "icon": "fas fa-edit"},
    {"id": "calc", "name": "Calculator", "path": "calc.exe", "icon": "fas fa-calculator"},
    {"id": "explorer", "name": "Explorer", "path": "explorer.exe", "icon": "fas fa-folder"},
    {"id": "cmd", "name": "Command Prompt", "path": "cmd.exe", "icon": "fas fa-terminal"},

    # System (non-removable) tools
    {"id": "edit_shortcuts", "name": "Edit Shortcuts", "path": "system:edit", "icon": "fas fa-pencil-alt", "is_system": True},
    {"id": "grid_settings", "name": "Grid Settings", "path": "system:settings", "icon": "fas fa-cog", "is_system": True},
    {"id": "restore_windows_apps", "name": "Restore Windows Apps", "path": "system:restore_windows", "icon": "fas fa-sync-alt", "is_system": True}
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
    return DEFAULT_SETTINGS["grid"]["cols"] * DEFAULT_SETTINGS["grid"]["rows"]

# ---------- Windows Apps Refresh Logic ----------
def refresh_windows_apps():
    """Re-scan for new Windows apps and add them to config"""
    global config_data
    installed = get_installed_windows_apps()
    installed_ids = {app['id'] for app in installed}
    existing_windows_ids = {app['id'] for app in config_data['apps'] if app.get('is_windows_app', False)}
    
    new_apps = [app for app in installed if app['id'] not in existing_windows_ids]
    
    if not new_apps:
        ensure_windows_page_exists()
        return len(new_apps)
    
    config_data['apps'].extend(new_apps)
    rebuild_windows_pages()
    save_config(config_data)
    return len(new_apps)

def ensure_windows_page_exists():
    """Create Windows Applications page if none exist"""
    has_windows_page = any(p.get('type') == 'windows_apps' for p in config_data['pages'])
    if has_windows_page:
        return
    rebuild_windows_pages()

def rebuild_windows_pages():
    """Rebuild the Windows Applications page(s) based on current windows apps"""
    # Remove existing Windows pages
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
    
    # Insert Windows pages before System Tools
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
        print("📝 Creating new config...")
        all_apps = DEFAULT_APPS[:]
        system_apps = [a for a in all_apps if a['id'] in SYSTEM_APP_IDS]
        normal_apps = [a for a in all_apps if a['id'] not in SYSTEM_APP_IDS and not a.get('is_windows_app', False)]
        
        # Define pages: Social Media, Quick Settings, VLC, MS Word, OBS, then System Tools
        page_defs = [
            {"name": "Social Media", "app_ids": ["instagram", "youtube", "facebook", "google", "twitter", "chat", "deepseek", "gemini", "claude", "grok", "whatsapp_web", "telegram_web"]},
            {"name": "Quick Settings", "app_ids": ["volup", "voldown", "brightup", "brightdown", "mute", "unmute", "micmute", "micunmute", "bluetooth", "minimizeall", "closeall", "taskmgr", "control", "wifi", "display", "sound", "lockpc", "snipping", "notepad", "calc", "explorer", "cmd"]},
            {"name": "VLC", "app_ids": ["vlc"]},
            {"name": "MS Word", "app_ids": ["word"]},
            {"name": "OBS Studio", "app_ids": ["obs"]}
        ]
        pages = []
        for pdef in page_defs:
            page_id = str(uuid.uuid4())[:8]
            pages.append({
                "id": page_id,
                "name": pdef["name"],
                "appIds": [aid for aid in pdef["app_ids"] if aid in [a["id"] for a in all_apps]]
            })
        # System Tools page
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
        print("✅ Config created\n")
        return data
    
    with open(CONFIG_FILE, 'r') as f:
        data = json.load(f)
    
    # Ensure all default apps exist
    existing_ids = {app['id'] for app in data.get('apps', [])}
    for default_app in DEFAULT_APPS:
        if default_app['id'] not in existing_ids:
            data['apps'].append(default_app)
    
    # Ensure System Tools page exists and is last
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
    
    # Ensure system apps are in system page
    system_page['appIds'] = [aid for aid in system_page['appIds'] if aid in SYSTEM_APP_IDS]
    for aid in SYSTEM_APP_IDS:
        if aid not in system_page['appIds']:
            system_page['appIds'].append(aid)
    
    # Remove system apps from other pages
    for page in other_pages:
        page['appIds'] = [aid for aid in page['appIds'] if aid not in SYSTEM_APP_IDS]
    
    # Ensure the new default pages exist if not present
    default_page_names = ["Social Media", "Quick Settings", "VLC", "MS Word", "OBS Studio"]
    existing_page_names = [p['name'] for p in other_pages]
    for name in default_page_names:
        if name not in existing_page_names:
            # Create page with corresponding app IDs
            page_id = str(uuid.uuid4())[:8]
            app_ids_for_page = []
            if name == "Social Media":
                app_ids_for_page = ["instagram", "youtube", "facebook", "google", "twitter", "chat", "deepseek", "gemini", "claude", "grok", "whatsapp_web", "telegram_web"]
            elif name == "Quick Settings":
                app_ids_for_page = ["volup", "voldown", "brightup", "brightdown", "mute", "unmute", "micmute", "micunmute", "bluetooth", "minimizeall", "closeall", "taskmgr", "control", "wifi", "display", "sound", "lockpc", "snipping", "notepad", "calc", "explorer", "cmd"]
            elif name == "VLC":
                app_ids_for_page = ["vlc"]
            elif name == "MS Word":
                app_ids_for_page = ["word"]
            elif name == "OBS Studio":
                app_ids_for_page = ["obs"]
            # Filter only existing apps
            app_ids_for_page = [aid for aid in app_ids_for_page if aid in [a['id'] for a in data['apps']]]
            new_page = {"id": page_id, "name": name, "appIds": app_ids_for_page}
            # Insert before System Tools
            sys_idx = None
            for i, p in enumerate(other_pages):
                if p.get('name') == SYSTEM_PAGE_NAME:
                    sys_idx = i
                    break
            if sys_idx is not None:
                other_pages.insert(sys_idx, new_page)
            else:
                other_pages.append(new_page)
    
    # Now rebuild pages: remove Windows pages and regenerate based on current windows apps
    data['pages'] = [p for p in other_pages if p.get('type') != 'windows_apps']
    win_apps = [app for app in data['apps'] if app.get('is_windows_app', False)]
    if win_apps:
        capacity = get_capacity()
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
        # Insert Windows pages before System Tools
        sys_idx = None
        for i, p in enumerate(data['pages']):
            if p.get('name') == SYSTEM_PAGE_NAME:
                sys_idx = i
                break
        if sys_idx is not None:
            data['pages'][sys_idx:sys_idx] = win_page_apps
        else:
            data['pages'].extend(win_page_apps)
    
    # Ensure System Tools is last
    if system_page not in data['pages']:
        data['pages'].append(system_page)
    else:
        data['pages'].remove(system_page)
        data['pages'].append(system_page)
    
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

# Load config and detect Windows apps
print("📥 Loading configuration...")
config_data = load_config()

print("🔄 Scanning for Windows applications...")
initial_windows_apps = get_installed_windows_apps()
if initial_windows_apps:
    existing_windows_ids = {app['id'] for app in config_data['apps'] if app.get('is_windows_app', False)}
    new_apps = [app for app in initial_windows_apps if app['id'] not in existing_windows_ids]
    if new_apps:
        print(f"✨ Adding {len(new_apps)} new Windows applications to config...")
        config_data['apps'].extend(new_apps)
        rebuild_windows_pages()
        save_config(config_data)
        print(f"✅ Successfully added {len(new_apps)} Windows apps!\n")
    else:
        print("ℹ️ No new Windows apps to add\n")
else:
    print("⚠️ No Windows apps detected\n")

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
    icon_emoji = request.form.get('icon', 'fas fa-box')  # default Font Awesome
    edit_id = request.form.get('edit_id')
    file = request.files.get('icon_file')
    page_id = request.form.get('page_id')

    if not path:
        return jsonify({"status": "error", "msg": "Path required"}), 400
    if not name:
        name = ""

    if edit_id:
        # Allow editing only non-system apps (system apps are locked)
        for app in config_data['apps']:
            if app['id'] == edit_id and app.get('is_system', False):
                return jsonify({"status": "error", "msg": "Cannot edit system app"}), 400

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
    # Allow deletion of any app except system apps (is_system=True)
    for app in config_data['apps']:
        if app['id'] == app_id and app.get('is_system', False):
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
        if p.get('type') in ['windows_apps', 'system'] or p.get('name') == SYSTEM_PAGE_NAME:
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
    # Prevent deleting System Tools page
    for page in config_data['pages']:
        if page['id'] == page_id:
            if page.get('name') == SYSTEM_PAGE_NAME:
                return jsonify({"status": "error", "msg": "Cannot delete System Tools page"}), 400
            break
    config_data['pages'] = [p for p in config_data['pages'] if p['id'] != page_id]
    save_config(config_data)
    return jsonify({"status": "deleted"})

@app.route('/api/pages/<page_id>', methods=['PUT'])
def rename_page(page_id):
    new_name = request.json.get('name')
    for page in config_data['pages']:
        if page['id'] == page_id:
            if page.get('name') == SYSTEM_PAGE_NAME:
                return jsonify({"status": "error", "msg": "Cannot rename System Tools page"}), 400
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
        if p.get('name') == SYSTEM_PAGE_NAME:
            system_pages.append(p)
        elif p.get('type') == 'windows_apps':
            windows_pages.append(p)
        else:
            normal_pages.append(p)
    for p in config_data['pages']:
        if p not in normal_pages and p not in windows_pages and p not in system_pages:
            if p.get('name') == SYSTEM_PAGE_NAME:
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
    
    # Prevent moving system apps
    for app in config_data['apps']:
        if app['id'] == app_id and app.get('is_system', False):
            return jsonify({"status": "error", "msg": "Cannot move system app"}), 400
    
    if from_page_id:
        for page in config_data['pages']:
            if page['id'] == from_page_id:
                if app_id in page['appIds']:
                    page['appIds'].remove(app_id)
                break
    if to_page_id is not None:
        # Prevent moving into System Tools page
        for page in config_data['pages']:
            if page['id'] == to_page_id and page.get('name') == SYSTEM_PAGE_NAME:
                return jsonify({"status": "error", "msg": "Cannot move app to System Tools page"}), 400
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
    print(f"\n✅ mDNS: http://winlauncher.local:{PORT}\n")
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
    print("="*70)
    print("🚀 STARTING FLASK SERVER AND UI")
    print("="*70)
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
