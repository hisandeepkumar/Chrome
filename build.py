#!/usr/bin/env python3
"""
WinLauncher Build Script
Creates standalone .exe file using PyInstaller
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def build_exe():
    """Build the WinLauncher executable"""
    
    # Get the current directory
    current_dir = Path(__file__).parent.absolute()
    
    # Define paths
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
    
    # PyInstaller command
    pyinstaller_cmd = [
        "pyinstaller",
        "--onefile",
        "--windowed",
        "--name=WinLauncher",
        "--icon=app.ico" if Path("app.ico").exists() else "",
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

def create_icon():
    """Create a simple icon if it doesn't exist"""
    try:
        from PIL import Image, ImageDraw
        
        icon_path = Path("app.ico")
        if not icon_path.exists():
            print("📐 Creating app icon...")
            
            # Create a simple icon
            img = Image.new('RGB', (256, 256), color='#1a1a1a')
            draw = ImageDraw.Draw(img)
            
            # Draw a simple launcher icon (rocket emoji style)
            # Draw circle background
            draw.ellipse([20, 20, 236, 236], fill='#2a5f9e', outline='#1e3a5f', width=2)
            
            # Draw rocket shape (simplified)
            draw.polygon([128, 40, 160, 120, 128, 110, 96, 120], fill='#ff6b6b')
            
            # Draw rocket body
            draw.rectangle([110, 100, 146, 200], fill='#f5f5f5')
            
            # Draw flame
            draw.polygon([110, 200, 128, 230, 146, 200], fill='#ffaa00')
            
            # Save as ico
            img.save('app.ico')
            print("✅ Icon created: app.ico")
            return True
    except ImportError:
        print("⚠️  PIL not available for icon creation")
        return False
    except Exception as e:
        print(f"⚠️  Could not create icon: {e}")
        return False

if __name__ == "__main__":
    print("\n🚀 WinLauncher Build System\n")
    
    # Try to create an icon
    create_icon()
    
    # Build the executable
    success = build_exe()
    
    sys.exit(0 if success else 1)
