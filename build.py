#!/usr/bin/env python3
"""
WinLauncher Build Script
Creates standalone .exe file using PyInstaller
Uses static/icon-512.png as the application icon
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def create_icon_from_png():
    """Convert static/icon-512.png to app.ico using PIL"""
    try:
        from PIL import Image
        
        png_path = Path("static/icon-512.png")
        ico_path = Path("app.ico")
        
        if not png_path.exists():
            print("❌ static/icon-512.png not found! Please place the icon there.")
            return False
        
        print(f"📐 Converting {png_path} to {ico_path}...")
        
        # Open the PNG and resize to common icon sizes
        img = Image.open(png_path)
        
        # Windows icon requires specific sizes: 16, 32, 48, 64, 128, 256
        sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        
        # Save as ICO with multiple sizes
        img.save(ico_path, format='ICO', sizes=sizes)
        print(f"✅ Icon created: {ico_path}")
        return True
    except ImportError:
        print("❌ PIL (Pillow) is required to convert the icon.")
        print("   Install it with: pip install Pillow")
        return False
    except Exception as e:
        print(f"❌ Failed to create icon: {e}")
        return False

def build_exe():
    """Build the WinLauncher executable"""
    
    current_dir = Path(__file__).parent.absolute()
    main_file = current_dir / "main.py"
    dist_dir = current_dir / "dist"
    build_dir = current_dir / "build"
    
    print("=" * 60)
    print("WinLauncher - Building Executable")
    print("=" * 60)
    
    # Clean previous builds
    print("\n📦 Cleaning previous builds...")
    for directory in [dist_dir, build_dir]:
        if directory.exists():
            shutil.rmtree(directory)
            print(f"   Removed {directory.name}/")
    
    # Create icon from static PNG
    if not create_icon_from_png():
        print("⚠️  Icon creation failed. Proceeding without a custom icon.")
        icon_arg = ""
    else:
        icon_arg = "--icon=app.ico"
    
    # PyInstaller command
    pyinstaller_cmd = [
        "pyinstaller",
        "--onefile",
        "--windowed",
        "--name=WinLauncher",
        icon_arg,
        "--add-data=static:static",
        "--add-data=templates:templates",
        "--hidden-import=flask_socketio",
        "--hidden-import=python_socketio",
        "--hidden-import=python_engineio",
        "--hidden-import=zeroconf",
        "--collect-all=flask",
        "--collect-all=flask_socketio",
        "--collect-all=PyQt5",
        f"{main_file}",
    ]
    
    # Remove empty strings from command
    pyinstaller_cmd = [cmd for cmd in pyinstaller_cmd if cmd]
    
    print("\n🔨 Building executable with PyInstaller...")
    print(f"   Command: {' '.join(pyinstaller_cmd)}\n")
    
    try:
        result = subprocess.run(pyinstaller_cmd, check=True)
        
        if result.returncode == 0:
            exe_path = dist_dir / "WinLauncher.exe"
            if exe_path.exists():
                print("\n" + "=" * 60)
                print("✅ BUILD SUCCESSFUL!")
                print("=" * 60)
                print(f"\n📍 Executable created at:")
                print(f"   {exe_path}")
                print(f"\n📊 File size: {exe_path.stat().st_size / (1024*1024):.2f} MB")
                print("\n🚀 To run the application:")
                print(f"   {exe_path}")
                print("\n💡 Tips:")
                print("   - The .exe is a standalone file")
                print("   - No Python installation required on target machines")
                print("   - First run may take a few seconds to extract")
                print("   - Settings are saved in %APPDATA%/WinLauncher/")
                print("=" * 60 + "\n")
                return True
            else:
                print("\n❌ Build completed but .exe not found!")
                return False
        else:
            print(f"\n❌ Build failed with return code {result.returncode}")
            return False
            
    except FileNotFoundError:
        print("\n❌ PyInstaller not found!")
        print("   Please install it first:")
        print("   pip install PyInstaller")
        return False
    except Exception as e:
        print(f"\n❌ Build error: {e}")
        return False

if __name__ == "__main__":
    print("\n🚀 WinLauncher Build System\n")
    success = build_exe()
    sys.exit(0 if success else 1)
