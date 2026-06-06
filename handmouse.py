import cv2
import mediapipe as mp
import pyautogui
import numpy as np
import math
import time
import threading
from pynput.mouse import Button, Controller as MouseController
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module='google.protobuf')

# ---------- ग्लोबल वेरिएबल ----------
# स्क्रीन साइज़ प्राप्त करें
screen_width, screen_height = pyautogui.size()

# स्मूदिंग फैक्टर (कर्सर को और स्मूद बनाने के लिए)
smoothing_factor = 1.0

# पिंच डिटेक्शन के लिए वेरिएबल
pinch_threshold = 30
is_pinching = False
pinch_start_time = None
pinch_hold_threshold = 0.5  # 0.5 सेकंड का होल्ड
double_pinch_threshold = 0.3  # 0.3 सेकंड के अंदर डबल पिंच
last_pinch_time = 0
current_pinch_start = None

# pynput माउस कंट्रोलर
mouse = MouseController()
mouse_button_held = False

# मूवमेंट के लिए वेरिएबल
prev_x, prev_y = 0, 0
smooth_x, smooth_y = 0, 0

# ---------- MediaPipe इनिशियलाइज़ करें ----------
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)
mp_drawing = mp.solutions.drawing_utils

# ---------- फिंगर टिप्स के लिए लैंडमार्क इंडेक्स ----------
# MediaPipe हाथ के 21 लैंडमार्क्स: https://google.github.io/mediapipe/solutions/hands.html
TIP_IDS = {
    'thumb': 4, 'index': 8, 'middle': 12, 'ring': 16, 'pinky': 20
}
# फिंगर MCP जोड़ (फिंगर के नीचे का जोड़)
MCP_IDS = {
    'thumb': 2, 'index': 5, 'middle': 9, 'ring': 13, 'pinky': 17
}

def distance(p1, p2):
    """दो बिंदुओं के बीच यूक्लिडियन दूरी निकालें"""
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

def is_finger_extended(landmarks, finger_name):
    """जांचें कि क्या फिंगर फैली हुई है"""
    tip_id = TIP_IDS[finger_name]
    mcp_id = MCP_IDS[finger_name]
    
    tip_y = landmarks[tip_id].y
    mcp_y = landmarks[mcp_id].y
    
    # अंगूठे के लिए अलग लॉजिक (क्योंकि यह अलग तरह से मूव करता है)
    if finger_name == 'thumb':
        tip_x = landmarks[tip_id].x
        mcp_x = landmarks[mcp_id].x
        return tip_x < mcp_x  # अंगूठा बाएं या दाएं फैला होता है
    else:
        # बाकी उंगलियों के लिए, अगर टिप MCP से नीचे है (y बड़ी है) तो फैली हुई है
        return tip_y < mcp_y

def is_pinched(landmarks):
    """जांचें कि अंगूठा और तर्जनी उंगली पिंच हो रही है या नहीं"""
    thumb_tip = landmarks[TIP_IDS['thumb']]
    index_tip = landmarks[TIP_IDS['index']]
    
    # 2D बिंदुओं में बदलें
    thumb_point = (thumb_tip.x, thumb_tip.y)
    index_point = (index_tip.x, index_tip.y)
    
    dist = distance(thumb_point, index_point)
    
    # डिबगिंग के लिए (वैकल्पिक)
    # print(f"Pinch distance: {dist:.3f}")
    
    return dist < pinch_threshold / 100  # नॉर्मलाइज़्ड कॉर्डिनेट्स के लिए थ्रेशोल्ड

def execute_click(action='click'):
    """माउस क्लिक करें या होल्ड करें"""
    global mouse_button_held
    
    if action == 'click':
        pyautogui.click()
        print("Click performed")
    elif action == 'double_click':
        pyautogui.doubleClick()
        print("Double-click performed")
    elif action == 'hold':
        if not mouse_button_held:
            mouse.press(Button.left)
            mouse_button_held = True
            print("Mouse button held")
    elif action == 'release':
        if mouse_button_held:
            mouse.release(Button.left)
            mouse_button_held = False
            print("Mouse button released")

def main():
    global is_pinching, pinch_start_time, last_pinch_time, current_pinch_start
    global prev_x, prev_y, smooth_x, smooth_y
    
    # वेबकैम शुरू करें
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # रिज़ॉल्यूशन प्राप्त करें
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # माउस सेंसिटिविटी (जितनी बड़ी संख्या, उतनी तेज)
    mouse_sensitivity = 2.5
    
    # स्मूदिंग के लिए वेरिएबल
    smooth_x = screen_width // 2
    smooth_y = screen_height // 2
    
    print("Hand Mouse Controller Started!")
    print("Controls:")
    print("  - Move cursor: Move your index finger")
    print("  - Click: Pinch thumb and index finger")
    print("  - Double click: Pinch twice quickly")
    print("  - Hold: Pinch and hold")
    print("  - Press 'q' to quit")
    
    # फ्रेम दर को नियंत्रित करने के लिए टाइमर
    frame_timer = time.time()
    fps_display = 0
    
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            print("Camera not accessible. Please check your webcam.")
            break
        
        # FPS कैलकुलेट करें
        current_time = time.time()
        if current_time - frame_timer >= 1.0:
            fps_display = int(1 / (current_time - frame_timer))
            frame_timer = current_time
        
        # फ्रेम को फ्लिप करें (मिरर इमेज)
        frame = cv2.flip(frame, 1)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # MediaPipe से हाथ डिटेक्ट करें
        results = hands.process(frame_rgb)
        
        # फ्रेम पर लैंडमार्क ड्रा करें
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    frame, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2))
                
                # तर्जनी उंगली का पॉइंट प्राप्त करें
                index_tip = hand_landmarks.landmark[TIP_IDS['index']]
                thumb_tip = hand_landmarks.landmark[TIP_IDS['thumb']]
                index_mcp = hand_landmarks.landmark[MCP_IDS['index']]
                
                # कर्सर मूवमेंट के लिए: तर्जनी उंगली की टिप को स्क्रीन कोऑर्डिनेट में मैप करें
                # स्मूथिंग के साथ मैपिंग करें
                target_x = np.interp(index_tip.x, [0.1, 0.9], [0, screen_width])
                target_y = np.interp(index_tip.y, [0.1, 0.9], [0, screen_height])
                
                # स्मूद मूवमेंट के लिए एक्सपोनेंशियल स्मूदिंग
                smooth_x = smooth_x * (1 - smoothing_factor) + target_x * smoothing_factor
                smooth_y = smooth_y * (1 - smoothing_factor) + target_y * smoothing_factor
                
                # सुनिश्चित करें कि कोऑर्डिनेट स्क्रीन की सीमा में हों
                cursor_x = max(0, min(screen_width - 1, int(smooth_x)))
                cursor_y = max(0, min(screen_height - 1, int(smooth_y)))
                
                # कर्सर मूव करें
                pyautogui.moveTo(cursor_x, cursor_y)
                
                # ------------- पिंच डिटेक्शन -------------
                pinched = is_pinched(hand_landmarks.landmark)
                
                if pinched and not is_pinching:
                    # पिंच शुरू हुई
                    is_pinching = True
                    pinch_start_time = time.time()
                    current_pinch_start = time.time()
                    
                    # चेक करें कि यह डबल पिंच है या नहीं
                    time_since_last_pinch = current_pinch_start - last_pinch_time
                    if time_since_last_pinch <= double_pinch_threshold and last_pinch_time > 0:
                        # डबल पिंच डिटेक्ट हुई
                        execute_click('double_click')
                        last_pinch_time = 0  # रीसेट करें ताकि एक ही पिंच से डबल बार ना हो
                    else:
                        # सिंगल पिंच - क्लिक के लिए थोड़ा इंतजार करें
                        # (एक थ्रेड में चलाएं ताकि ब्लॉक ना हो)
                        threading.Timer(0.05, check_pinch_hold, [hand_landmarks.landmark]).start()
                
                elif not pinched and is_pinching:
                    # पिंच खत्म हुई
                    is_pinching = False
                    pinch_duration = time.time() - pinch_start_time if pinch_start_time else 0
                    
                    # अगर पिंच होल्ड नहीं थी और पिछली पिंच डबल पिंच के लिए नहीं थी
                    if pinch_duration < pinch_hold_threshold and last_pinch_time > 0:
                        # सिंगल क्लिक
                        execute_click('click')
                        last_pinch_time = 0
                    elif pinch_duration >= pinch_hold_threshold:
                        # होल्ड खत्म हुई, बटन रिलीज करें
                        execute_click('release')
                    
                    last_pinch_time = time.time()
                    pinch_start_time = None
                
                # डिबगिंग डिस्प्ले
                cv2.putText(frame, f"Pinch Status: {'Active' if is_pinching else 'Inactive'}", 
                           (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                
                # पिंच सर्कल ड्रा करें
                thumb_point = (int(thumb_tip.x * frame_width), int(thumb_tip.y * frame_height))
                index_point = (int(index_tip.x * frame_width), int(index_tip.y * frame_height))
                cv2.circle(frame, thumb_point, 10, (0, 255, 0), -1)
                cv2.circle(frame, index_point, 10, (0, 255, 0), -1)
                
                # पिंच थ्रेशोल्ड दिखाएं
                pinch_dist = distance((thumb_tip.x, thumb_tip.y), (index_tip.x, index_tip.y))
                threshold_norm = pinch_threshold / 100
                status_color = (0, 0, 255) if pinch_dist < threshold_norm else (0, 255, 0)
                cv2.putText(frame, f"Pinch Distance: {pinch_dist:.3f}", (10, 120), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
                
        else:
            # अगर हाथ नहीं मिला तो पिंच स्टेटस रीसेट करें
            is_pinching = False
            pinch_start_time = None
            if mouse_button_held:
                execute_click('release')
        
        # FPS डिस्प्ले करें
        cv2.putText(frame, f"FPS: {fps_display}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # इंस्ट्रक्शन डिस्प्ले करें
        instructions = [
            "Instructions:",
            "1. Move cursor: Move your index finger",
            "2. Click: Pinch thumb & index finger",
            "3. Double Click: Pinch twice quickly",
            "4. Hold: Pinch and hold",
            "Press 'q' to quit"
        ]
        for i, text in enumerate(instructions):
            cv2.putText(frame, text, (10, frame_height - 20 - (i * 25)), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # फ्रेम दिखाएं
        cv2.imshow('Hand Mouse Controller', frame)
        
        # 'q' दबाने पर बाहर निकलें
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    # क्लीनअप
    if mouse_button_held:
        mouse.release(Button.left)
    cap.release()
    cv2.destroyAllWindows()
    hands.close()
    print("Hand Mouse Controller Stopped.")

def check_pinch_hold(landmarks):
    """चेक करें कि पिंच होल्ड हो रही है या नहीं"""
    global is_pinching, pinch_start_time
    
    if is_pinching and pinch_start_time:
        pinch_duration = time.time() - pinch_start_time
        if pinch_duration >= pinch_hold_threshold:
            # होल्ड डिटेक्ट हुई
            execute_click('hold')
            # होल्ड रिकॉर्ड करें ताकि रिलीज़ पर पता चले
            pinch_start_time = None
        else:
            # थोड़ी देर बाद फिर से चेक करें
            threading.Timer(0.05, check_pinch_hold, [landmarks]).start()

if __name__ == "__main__":
    main()
