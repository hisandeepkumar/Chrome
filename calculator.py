import tkinter as tk
from tkinter import ttk, messagebox
import math

class Calculator:
    def __init__(self, root):
        self.root = root
        self.root.title("My Calculator")
        self.root.geometry("320x450")
        self.root.resizable(False, False)
        self.root.configure(bg="#2d2d2d")

        # Expression variable
        self.expression = ""
        self.result_var = tk.StringVar()
        self.result_var.set("0")

        # Display
        self.create_display()
        self.create_buttons()

        # Keyboard bindings
        self.bind_keys()

    def create_display(self):
        display_frame = tk.Frame(self.root, bg="#2d2d2d")
        display_frame.pack(expand=True, fill="both", padx=10, pady=10)

        self.display_label = tk.Label(
            display_frame,
            textvariable=self.result_var,
            font=("Segoe UI", 24, "bold"),
            bg="#1e1e1e",
            fg="#ffffff",
            anchor="e",
            padx=10,
            pady=10,
            relief=tk.SUNKEN,
            bd=2
        )
        self.display_label.pack(fill="both", expand=True)

    def create_buttons(self):
        button_frame = tk.Frame(self.root, bg="#2d2d2d")
        button_frame.pack(expand=True, fill="both", padx=10, pady=(0, 10))

        buttons = [
            ("C", 0, 0, "#f44336"), ("⌫", 0, 1, "#ff9800"), ("/", 0, 2, "#607d8b"), ("*", 0, 3, "#607d8b"),
            ("7", 1, 0, "#424242"), ("8", 1, 1, "#424242"), ("9", 1, 2, "#424242"), ("-", 1, 3, "#607d8b"),
            ("4", 2, 0, "#424242"), ("5", 2, 1, "#424242"), ("6", 2, 2, "#424242"), ("+", 2, 3, "#607d8b"),
            ("1", 3, 0, "#424242"), ("2", 3, 1, "#424242"), ("3", 3, 2, "#424242"), ("=", 3, 3, "#4caf50", 2),
            ("0", 4, 0, "#424242", 2), (".", 4, 2, "#424242")
        ]

        for btn in buttons:
            text = btn[0]
            row = btn[1]
            col = btn[2]
            bg_color = btn[3]
            colspan = btn[4] if len(btn) > 4 else 1

            if text == "C":
                command = self.clear
            elif text == "⌫":
                command = self.backspace
            elif text == "=":
                command = self.evaluate
            else:
                command = lambda x=text: self.append(x)

            btn_widget = tk.Button(
                button_frame,
                text=text,
                font=("Segoe UI", 14, "bold"),
                bg=bg_color,
                fg="white",
                relief=tk.RAISED,
                bd=2,
                activebackground="#555555",
                activeforeground="white",
                command=command
            )
            btn_widget.grid(row=row, column=col, columnspan=colspan, sticky="nsew", padx=3, pady=3)

        # Make grid expandable
        for i in range(5):
            button_frame.grid_rowconfigure(i, weight=1)
        for j in range(4):
            button_frame.grid_columnconfigure(j, weight=1)

    def append(self, char):
        if char == "." and self.expression.count(".") >= 1:
            # Prevent multiple decimals in current number
            last_number = self.expression.split("+")[-1].split("-")[-1].split("*")[-1].split("/")[-1]
            if "." in last_number:
                return
        self.expression += str(char)
        self.update_display()

    def clear(self):
        self.expression = ""
        self.update_display("0")

    def backspace(self):
        self.expression = self.expression[:-1]
        if not self.expression:
            self.update_display("0")
        else:
            self.update_display()

    def evaluate(self):
        try:
            # Replace '*' with '*' (already good) and '/' for division
            # But use eval safely – for simple calculator it's acceptable
            result = eval(self.expression)
            if result == int(result):
                result = int(result)
            self.expression = str(result)
            self.update_display()
        except ZeroDivisionError:
            messagebox.showerror("Math Error", "Cannot divide by zero!")
            self.clear()
        except Exception:
            messagebox.showerror("Syntax Error", "Invalid expression")
            self.clear()

    def update_display(self, value=None):
        if value is not None:
            self.result_var.set(value)
            self.expression = "" if value == "0" else value
        else:
            if self.expression == "":
                self.result_var.set("0")
            else:
                self.result_var.set(self.expression)

    def bind_keys(self):
        self.root.bind("<Key>", self.key_press)

    def key_press(self, event):
        key = event.char
        if key.isdigit() or key in ("+", "-", "*", "/", "."):
            self.append(key)
        elif key == "\r" or key == "=":  # Enter or = key
            self.evaluate()
        elif key == "\b":  # Backspace
            self.backspace()
        elif key.lower() == "c":
            self.clear()

if __name__ == "__main__":
    root = tk.Tk()
    app = Calculator(root)
    root.mainloop()
