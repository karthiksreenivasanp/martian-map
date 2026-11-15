import cv2
import os
import sys
import zipfile
import json
import time

def process_video():
    video_path = 'Screen Recording 2026-11-15 at 12.16.58 PM.mov'
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found")
        sys.exit(1)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open {video_path}")
        sys.exit(1)

    orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    orig_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / orig_fps if orig_fps > 0 else 0

    print("==================================================")
    print("NEW SCREEN RECORDING SOURCE METADATA:")
    print(f"  Source Path: {video_path}")
    print(f"  Dimensions: {orig_width} x {orig_height}")
    print(f"  Native FPS: {orig_fps:.2f}")
    print(f"  Total Video Frames: {total_frames}")
    print(f"  Duration: {duration_sec:.2f} s ({duration_sec / 60:.2f} min)")
    print("==================================================")

    # Configuration for ~24.5 MB target zip:
    # step = 8 -> 1 frame every ~0.139s (7.16 effective FPS)
    # 800 x 502 px (maintaining exact 16:10 aspect ratio 2940:1846)
    # JPEG Quality: 62
    step = 8
    target_width, target_height = 800, 502
    jpeg_quality = 62
    expected_frames = (total_frames + step - 1) // step

    zip_filename = 'screen_recording_frames_25mb.zip'
    alt_zip_filename = 'screen_recording_new_25mb.zip'

    print(f"\nExtracting {expected_frames} frames into {zip_filename}...")
    t0 = time.time()

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_idx = 0
    extracted_count = 0

    metadata = {
        "source_file": video_path,
        "source_resolution": f"{orig_width}x{orig_height}",
        "source_native_fps": round(orig_fps, 2),
        "source_total_frames": total_frames,
        "source_duration_seconds": round(duration_sec, 2),
        "extracted_frames_count": expected_frames,
        "extracted_resolution": f"{target_width}x{target_height}",
        "sampling_step": step,
        "effective_fps": round(orig_fps / step, 2),
        "frame_interval_seconds": round(step / orig_fps, 3),
        "jpeg_quality": jpeg_quality,
        "target_archive_size": "24-25 MB"
    }

    with zipfile.ZipFile(zip_filename, 'w', compression=zipfile.ZIP_STORED) as zf:
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % step == 0:
                resized = cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_AREA)
                _, enc = cv2.imencode('.jpg', resized, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality])
                timestamp_s = frame_idx / orig_fps
                frame_filename = f"frames/frame_{extracted_count + 1:04d}_t{timestamp_s:06.2f}s.jpg"
                zf.writestr(frame_filename, enc.tobytes())
                extracted_count += 1

                if extracted_count % 100 == 0 or extracted_count == expected_frames:
                    elapsed = time.time() - t0
                    print(f"  Processed {extracted_count}/{expected_frames} frames ({timestamp_s:.1f}s / {duration_sec:.1f}s) in {elapsed:.1f}s...")

            frame_idx += 1

    cap.release()

    final_size_bytes = os.path.getsize(zip_filename)
    final_size_mb = final_size_bytes / (1024 * 1024)

    print("\n==================================================")
    print("FRAME EXTRACTION COMPLETE:")
    print(f"  Zip Archive: {zip_filename}")
    print(f"  Total Extracted Frames: {extracted_count}")
    print(f"  Dimensions: {target_width} x {target_height}")
    print(f"  Archive Size: {final_size_mb:.2f} MB ({final_size_bytes:,} bytes)")
    print(f"  Elapsed Time: {time.time() - t0:.1f} seconds")
    print("==================================================")

    # Also copy to screen_recording_new_25mb.zip for explicit naming
    import shutil
    shutil.copy2(zip_filename, alt_zip_filename)
    print(f"Created copy: {alt_zip_filename}")

if __name__ == '__main__':
    process_video()
