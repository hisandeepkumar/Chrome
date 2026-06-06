import cv2
import mediapipe as mp
import pyautogui
import numpy as np
import math
import time
import threading
from pynput.mouse import Button, Controller as MouseController

# ---------- Global Variables ----------
screen_width, screen_height = pyautogui.size()   # Get screen size
smoothing_factor = 0.7                           # Cursor smoothness (0.5-0.9)
pinch_threshold = 0.035                          # Normalized distance for pinch (0.025 to 0.045)
is_pinching = False
pinch_start_time = None
pinch_hold_threshold = 0.4                       # seconds to consider as hold
double_pinch_threshold = 0.3                     # max time between two pinches for double-click
last_pinch_time = 0
mouse = MouseController()
mouse_button_held = False

# For smooth cursor movement
smooth_x, smooth_y = screen_width // 2, screen_height // 2

# ---------- Initialize MediaPipe Hands ----------
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

# Finger landmark indices (MediaPipe)
TIP_IDS = {'thumb': 4, 'index': 8, 'middle': 12, 'ring': 16, 'pinky': 20}
MCP_IDS = {'thumb': 2, 'index': 5, 'middle': 9, 'ring': 13, 'pinky': 17}

def distance(p1, p2):
    """Euclidean distance between two points (x,y)"""
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def is_pinched(landmarks):
    """Check if thumb tip and index tip are close enough (pinch gesture)"""
    thumb = (landmarks[TIP_IDS['thumb']].x, landmarks[TIP_IDS['thumb']].y)
    index = (landmarks[TIP_IDS['index']].x, landmarks[TIP_IDS['index']].y)
    dist = distance(thumb, index)
    return dist < pinch_threshold

def execute_click(action):
    """Perform mouse click, double-click, hold, or release"""
    global mouse_button_held
    if action == 'click':
        pyautogui.click()
        print("Click")
    elif action == 'double_click':
        pyautogui.doubleClick()
        print("Double Click")
    elif action == 'hold':
        if not mouse_button_held:
            mouse.press(Button.left)
            mouse_button_held = True
            print("Hold started (left button down)")
    elif action == 'release':
        if mouse_button_held:
            mouse.release(Button.left)
            mouse_button_held = False
            print("Hold released")

def check_pinch_hold():
    """Timer callback: if still pinching after hold threshold, trigger hold"""
    global is_pinching, pinch_start_time
    if is_pinching and pinch_start_time:
        duration = time.time() - pinch_start_time
        if duration >= pinch_hold_threshold:
            execute_click('hold')
            pinch_start_time = None   # prevent triggering again

def main():
    global is_pinching, pinch_start_time, last_pinch_time
    global smooth_x, smooth_y, mouse_button_held

    # Open webcam
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot access camera. Please check your webcam.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print("Hand Mouse Controller Started!")
    print("Controls:")
    print("  - Move cursor: Move your index finger")
    print("  - Click: Pinch thumb and index finger")
    print("  - Double click: Pinch twice quickly")
    print("  - Hold (drag/select): Pinch and hold")
    print("  - Press 'q' to quit")

    fps_timer = time.time()
    fps = 0

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("Failed to read frame from camera.")
            break

        # Mirror display and convert to RGB
        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)

        # Calculate FPS for display
        now = time.time()
        if now - fps_timer >= 1.0:
            fps = int(1 / (now - fps_timer))
            fps_timer = now

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                # Draw landmarks on frame
                mp_drawing.draw_landmarks(
                    frame, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(0,0,255), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(0,255,0), thickness=2))

                # Index finger tip for cursor movement
                index_tip = hand_landmarks.landmark[TIP_IDS['index']]
                thumb_tip = hand_landmarks.landmark[TIP_IDS['thumb']]

                # Map normalized coordinates to screen coordinates
                target_x = np.interp(index_tip.x, [0.1, 0.9], [0, screen_width])
                target_y = np.interp(index_tip.y, [0.1, 0.9], [0, screen_height])

                # Exponential smoothing for smoother cursor
                smooth_x = smooth_x * (1 - smoothing_factor) + target_x * smoothing_factor
                smooth_y = smooth_y * (1 - smoothing_factor) + target_y * smoothing_factor
                cursor_x = int(max(0, min(screen_width-1, smooth_x)))
                cursor_y = int(max(0, min(screen_height-1, smooth_y)))

                pyautogui.moveTo(cursor_x, cursor_y)

                # ---- Pinch detection logic ----
                pinched = is_pinched(hand_landmarks.landmark)

                if pinched and not is_pinching:
                    # Pinch just started
                    is_pinching = True
                    pinch_start_time = time.time()
                    now_time = time.time()
                    # Check for double pinch
                    if last_pinch_time > 0 and (now_time - last_pinch_time) <= double_pinch_threshold:
                        execute_click('double_click')
                        last_pinch_time = 0  # reset to avoid triple click
                    else:
                        # Start a timer to detect hold (non-blocking)
                        threading.Timer(pinch_hold_threshold + 0.05, check_pinch_hold).start()

                elif not pinched and is_pinching:
                    # Pinch ended
                    is_pinching = False
                    duration = (time.time() - pinch_start_time) if pinch_start_time else 0

                    if duration < pinch_hold_threshold and last_pinch_time == 0:
                        # Short pinch: single click
                        execute_click('click')
                    elif duration >= pinch_hold_threshold:
                        # Hold released
                        execute_click('release')

                    last_pinch_time = time.time() if duration < pinch_hold_threshold else 0
                    pinch_start_time = None

                # Display pinch status and distance on frame
                thumb_point = (int(thumb_tip.x * frame_width), int(thumb_tip.y * frame_height))
                index_point = (int(index_tip.x * frame_width), int(index_tip.y * frame_height))
                cv2.circle(frame, thumb_point, 10, (0,255,0), -1)
                cv2.circle(frame, index_point, 10, (0,255,0), -1)
                p_dist = distance((thumb_tip.x, thumb_tip.y), (index_tip.x, index_tip.y))
                color = (0,0,255) if p_dist < pinch_threshold else (0,255,0)
                cv2.putText(frame, f"Pinch dist: {p_dist:.3f}", (10, 90),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                cv2.putText(frame, f"Pinching: {'YES' if is_pinching else 'NO'}", (10, 60),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)
        else:
            # No hand detected: release any ongoing hold
            if mouse_button_held:
                execute_click('release')
            is_pinching = False
            pinch_start_time = None

        # Display FPS and instructions
        cv2.putText(frame, f"FPS: {fps}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 2)
        instructions = [
            "Move cursor: index finger",
            "Click: pinch thumb+index",
            "Double click: pinch twice quickly",
            "Hold: pinch and hold",
            "Press 'q' to quit"
        ]
        for i, line in enumerate(instructions):
            cv2.putText(frame, line, (10, frame_height - 80 + i*25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200,200,200), 1)

        cv2.imshow('Hand Mouse Controller', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # Cleanup
    if mouse_button_held:
        mouse.release(Button.left)
    cap.release()
    cv2.destroyAllWindows()
    hands.close()
    print("Hand Mouse Controller stopped.")

if __name__ == "__main__":
    main()
