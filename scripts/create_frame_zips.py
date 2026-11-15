import cv2
import os
import sys
import zipfile
import json
import time

def generate_zips():
    video_path = './Screen Recording 2026-11-15 at 9.51.00 AM.mov'
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found")
        sys.exit(1)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Error: Could not open video file")
        sys.exit(1)

    orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    orig_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / orig_fps if orig_fps > 0 else 0

    print("==================================================")
    print("VIDEO SOURCE METADATA:")
    print(f"  Path: {video_path}")
    print(f"  Dimensions: {orig_width} x {orig_height}")
    print(f"  Native FPS: {orig_fps:.2f}")
    print(f"  Total Frames: {total_frames}")
    print(f"  Duration: {duration_sec:.2f} seconds")
    print("==================================================")

    # We will build:
    # 1. HD Frame Sequence (960x603 @ 11.46 fps = 1093 frames, ~25 MB):
    #    Captures all user clicks, UI panels, globe, and terrain navigation in crisp high resolution.
    # 2. Complete Native Sequence (360x226 @ 57.31 fps = 5462 frames, ~25 MB):
    #    Contains 100% of consecutive frames without dropping any frame.

    # First, let us generate HD Frame Sequence:
    hd_zip_path = 'screen_recording_frames_hd.zip'
    step = 5
    hd_width, hd_height = 960, 603
    hd_quality = 72

    print(f"\n[1/2] Generating HD Frame Sequence: {hd_zip_path}...")
    t0 = time.time()
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_idx = 0
    extracted_hd_count = 0

    with zipfile.ZipFile(hd_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        metadata = {
            "source_video": "Screen Recording 2026-11-15 at 9.51.00 AM.mov",
            "source_dimensions": [orig_width, orig_height],
            "source_total_frames": total_frames,
            "source_fps": round(orig_fps, 2),
            "source_duration_seconds": round(duration_sec, 2),
            "extracted_type": "HD Visual Sequence",
            "frame_width": hd_width,
            "frame_height": hd_height,
            "sampling_step": step,
            "effective_fps": round(orig_fps / step, 2),
            "jpeg_quality": hd_quality,
            "frame_count": (total_frames + step - 1) // step
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % step == 0:
                resized = cv2.resize(frame, (hd_width, hd_height), interpolation=cv2.INTER_AREA)
                _, enc = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), hd_quality])
                frame_name = f"frame_{extracted_hd_count + 1:04d}_t{frame_idx / orig_fps:.2f}s.jpg"
                zf.writestr(f"frames/{frame_name}", enc.tobytes())
                extracted_hd_count += 1
                if extracted_hd_count % 200 == 0:
                    print(f"  Processed {extracted_hd_count} HD frames...")
            frame_idx += 1

    hd_size_bytes = os.path.getsize(hd_zip_path)
    hd_size_mb = hd_size_bytes / (1024 * 1024)
    print(f"  Finished HD Zip in {time.time() - t0:.2f}s:")
    print(f"  Frames: {extracted_hd_count}, Size: {hd_size_mb:.2f} MB ({hd_size_bytes:,} bytes)")

    # Second, generate Complete Native All-Frames Sequence:
    all_zip_path = 'screen_recording_frames_all.zip'
    all_width, all_height = 360, 226
    all_quality = 50

    print(f"\n[2/2] Generating All-Frames Sequence (5,462 frames): {all_zip_path}...")
    t0 = time.time()
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_idx = 0

    with zipfile.ZipFile(all_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        metadata = {
            "source_video": "Screen Recording 2026-11-15 at 9.51.00 AM.mov",
            "source_dimensions": [orig_width, orig_height],
            "source_total_frames": total_frames,
            "source_fps": round(orig_fps, 2),
            "source_duration_seconds": round(duration_sec, 2),
            "extracted_type": "Complete 100% Native Frame Sequence (No Frames Skipped)",
            "frame_width": all_width,
            "frame_height": all_height,
            "sampling_step": 1,
            "effective_fps": round(orig_fps, 2),
            "jpeg_quality": all_quality,
            "frame_count": total_frames
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            resized = cv2.resize(frame, (all_width, all_height), interpolation=cv2.INTER_AREA)
            _, enc = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), all_quality])
            frame_name = f"frame_{frame_idx + 1:05d}.jpg"
            zf.writestr(f"frames/{frame_name}", enc.tobytes())
            frame_idx += 1
            if frame_idx % 1000 == 0:
                print(f"  Processed {frame_idx} / {total_frames} frames...")

    cap.release()

    all_size_bytes = os.path.getsize(all_zip_path)
    all_size_mb = all_size_bytes / (1024 * 1024)
    print(f"  Finished All-Frames Zip in {time.time() - t0:.2f}s:")
    print(f"  Frames: {frame_idx}, Size: {all_size_mb:.2f} MB ({all_size_bytes:,} bytes)")

    # Also create the default alias screen_recording_frames.zip pointing to HD (or copy)
    default_zip_path = 'screen_recording_frames.zip'
    import shutil
    shutil.copy2(hd_zip_path, default_zip_path)
    print(f"\nDefault zip created: {default_zip_path} -> {os.path.getsize(default_zip_path) / (1024*1024):.2f} MB")

if __name__ == '__main__':
    generate_zips()
