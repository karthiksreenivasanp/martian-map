#!/usr/bin/env python3
"""
Generate enhanced Google Maps-style Terrain and Slope Hazard rasters for Gale Crater.
- Terrain: Natural warm Martian sand/ochre hypsometry with hillshade relief and subtle contours.
- Slope: Google Maps hazard style where walkable flat ground (<10 deg) is natural/clear,
  10-15 deg caution is amber/gold, and >15 deg hazard is bold red.
Zero emojis.
"""

import math
import numpy as np
from PIL import Image, ImageFilter

def get_simulated_elevation(x, y):
    # Matches src/nav.js getSimulatedTerrainElevation
    dist_ms = math.sqrt(x * x + (y + 12000.0) ** 2)
    ms_grad = max(0.0, 4200.0 - dist_ms * 0.32)

    macro_ridge = math.sin(x * 0.004 + y * 0.003) * 12.0
    dune_swell = math.cos(x * 0.012 - y * 0.009) * 4.8
    micro_ripples = math.sin(x * 0.035 + y * 0.025) * 1.6
    crater = -14.0 * math.exp(-(((x - 120) ** 2 + (y - 90) ** 2) / 3600.0))

    return (ms_grad * 0.04) + macro_ridge + dune_swell + micro_ripples + crater

def generate_maps():
    size = 2048
    half = size / 2.0
    meters_span = 4000.0
    scale = meters_span / size # ~1.953 m / pixel

    print(f"[INFO] Generating {size}x{size} elevation grid...")
    elev = np.zeros((size, size), dtype=np.float32)

    # Sample elevation grid
    # Vectorized / grid sampling
    xs = (np.arange(size) - half) * scale
    ys = (half - np.arange(size)) * scale # Y positive North
    X, Y = np.meshgrid(xs, ys)

    dist_ms = np.sqrt(X * X + (Y + 12000.0) ** 2)
    ms_grad = np.maximum(0.0, 4200.0 - dist_ms * 0.32)
    macro_ridge = np.sin(X * 0.004 + Y * 0.003) * 12.0
    dune_swell = np.cos(X * 0.012 - Y * 0.009) * 4.8
    micro_ripples = np.sin(X * 0.035 + Y * 0.025) * 1.6
    crater = -14.0 * np.exp(-(((X - 120.0) ** 2 + (Y - 90.0) ** 2) / 3600.0))

    elev = (ms_grad * 0.04) + macro_ridge + dune_swell + micro_ripples + crater
    print(f"[INFO] Elevation range: {elev.min():.2f}m to {elev.max():.2f}m")

    # 1. Horn Slope (Baseline >= 5m)
    # 3x3 window with cell spacing of 3 pixels (~5.86 m)
    d = 3
    dz_dx = (np.roll(elev, -d, axis=1) - np.roll(elev, d, axis=1)) / (2 * d * scale)
    dz_dy = (np.roll(elev, -d, axis=0) - np.roll(elev, d, axis=0)) / (2 * d * scale)
    slope_rad = np.arctan(np.sqrt(dz_dx * dz_dx + dz_dy * dz_dy))
    slope_deg = np.degrees(slope_rad)
    print(f"[INFO] Slope range: {slope_deg.min():.2f} deg to {slope_deg.max():.2f} deg, mean: {slope_deg.mean():.2f} deg")

    # 2. Hillshade (Sun at Azimuth 135 deg SE, Elevation 45 deg)
    sun_az = math.radians(135.0)
    sun_alt = math.radians(45.0)
    aspect = np.arctan2(-dz_dy, dz_dx)
    hillshade = 255.0 * (
        (math.sin(sun_alt) * np.cos(slope_rad)) +
        (math.cos(sun_alt) * np.sin(slope_rad) * np.cos(sun_az - aspect))
    )
    hillshade = np.clip(hillshade, 0.0, 255.0)

    # Load satellite base for natural texturing
    sat_img = Image.open('data/map/satellite_4km.jpg').convert('RGB')
    sat_arr = np.array(sat_img, dtype=np.float32)

    # -------------------------------------------------------------
    # A. Google Maps Terrain Style (Authentic HiRISE Satellite + Topographic Relief Shading + 5m Contours)
    # -------------------------------------------------------------
    # Grounded on the authentic NASA HiRISE orthophoto
    # Hillshade visibly illuminates topographical crests and shadows depressions
    elev_norm = (elev - elev.min()) / (elev.max() - elev.min())
    hs_factor = np.clip(hillshade / 140.0, 0.55, 1.55)

    # Modulate real satellite orthophoto with hillshade relief
    terrain_r = sat_arr[:, :, 0] * hs_factor
    terrain_g = sat_arr[:, :, 1] * hs_factor
    terrain_b = sat_arr[:, :, 2] * hs_factor

    # Hypsometric warmth: low crater floors slightly cooler, higher ridges warmer ochre
    terrain_r = terrain_r * 0.82 + (sat_arr[:, :, 0] + elev_norm * 35.0) * 0.18
    terrain_g = terrain_g * 0.82 + (sat_arr[:, :, 1] + elev_norm * 22.0) * 0.18
    terrain_b = terrain_b * 0.82 + (sat_arr[:, :, 2] + elev_norm * 10.0) * 0.18

    # Add visible 5-meter topographic elevation contour lines (Google Maps Terrain style)
    contour_interval = 5.0
    c_phase = np.abs(elev % contour_interval)
    contour_mask = (c_phase < 0.35) | (c_phase > (contour_interval - 0.35))
    
    # 25-meter index contours (thicker / darker)
    index_interval = 25.0
    c_idx_phase = np.abs(elev % index_interval)
    index_contour_mask = (c_idx_phase < 0.5) | (c_idx_phase > (index_interval - 0.5))

    # Apply subtle dark ochre contour line
    contour_color = np.array([120, 60, 25], dtype=np.float32)
    terrain_r[contour_mask] = terrain_r[contour_mask] * 0.65 + contour_color[0] * 0.35
    terrain_g[contour_mask] = terrain_g[contour_mask] * 0.65 + contour_color[1] * 0.35
    terrain_b[contour_mask] = terrain_b[contour_mask] * 0.65 + contour_color[2] * 0.35

    terrain_r[index_contour_mask] = terrain_r[index_contour_mask] * 0.50 + contour_color[0] * 0.50
    terrain_g[index_contour_mask] = terrain_g[index_contour_mask] * 0.50 + contour_color[1] * 0.50
    terrain_b[index_contour_mask] = terrain_b[index_contour_mask] * 0.50 + contour_color[2] * 0.50

    final_terrain = np.zeros((size, size, 3), dtype=np.uint8)
    final_terrain[:, :, 0] = np.clip(terrain_r, 0, 255).astype(np.uint8)
    final_terrain[:, :, 1] = np.clip(terrain_g, 0, 255).astype(np.uint8)
    final_terrain[:, :, 2] = np.clip(terrain_b, 0, 255).astype(np.uint8)

    terrain_out = Image.fromarray(final_terrain)
    terrain_out.save('data/map/terrain_hillshade_4km.jpg', quality=92)
    terrain_out.save('public/data/map/terrain_hillshade_4km.jpg', quality=92)
    thumb_terrain = terrain_out.resize((96, 96), Image.Resampling.LANCZOS)
    thumb_terrain.save('data/map/thumb_elevation.jpg', quality=90)
    thumb_terrain.save('public/data/map/thumb_elevation.jpg', quality=90)
    print("[SUCCESS] Saved authentic Google Maps-style terrain_hillshade_4km.jpg and thumbnail.")

    # -------------------------------------------------------------
    # B. Google Maps Slope Hazard Style
    # Walkable flat ground (<10 deg): Visible subtle emerald green tint (25% overlay)
    # Caution (10-15 deg): Amber/Gold highlight (55% overlay #ffb300)
    # Hazard (>15 deg): High-visibility Crimson Red (75% overlay #ff2a2a)
    # -------------------------------------------------------------
    slope_rgb = np.array(sat_arr, dtype=np.float32)

    # Walkable flat ground (<10 deg)
    walkable_mask = (slope_deg < 10.0)
    # Caution (10 to 15 deg)
    caution_mask = (slope_deg >= 10.0) & (slope_deg < 15.0)
    # Hazard (> 15 deg)
    hazard_mask = (slope_deg >= 15.0)

    # Blend Emerald Green for safe walkable ground (matching legend chip <10 deg Walkable)
    green_r, green_g, green_b = 46.0, 204.0, 113.0
    slope_rgb[walkable_mask, 0] = slope_rgb[walkable_mask, 0] * 0.75 + green_r * 0.25
    slope_rgb[walkable_mask, 1] = slope_rgb[walkable_mask, 1] * 0.75 + green_g * 0.25
    slope_rgb[walkable_mask, 2] = slope_rgb[walkable_mask, 2] * 0.75 + green_b * 0.25

    # Blend Amber for caution (55% amber tint over natural satellite imagery)
    amber_r, amber_g, amber_b = 243.0, 156.0, 18.0
    slope_rgb[caution_mask, 0] = slope_rgb[caution_mask, 0] * 0.45 + amber_r * 0.55
    slope_rgb[caution_mask, 1] = slope_rgb[caution_mask, 1] * 0.45 + amber_g * 0.55
    slope_rgb[caution_mask, 2] = slope_rgb[caution_mask, 2] * 0.45 + amber_b * 0.55

    # Blend Red for hazard (75% red tint over natural satellite imagery)
    red_r, red_g, red_b = 231.0, 76.0, 60.0
    slope_rgb[hazard_mask, 0] = slope_rgb[hazard_mask, 0] * 0.25 + red_r * 0.75
    slope_rgb[hazard_mask, 1] = slope_rgb[hazard_mask, 1] * 0.25 + red_g * 0.75
    slope_rgb[hazard_mask, 2] = slope_rgb[hazard_mask, 2] * 0.25 + red_b * 0.75

    final_slope = Image.fromarray(np.clip(slope_rgb, 0, 255).astype(np.uint8))
    final_slope.save('data/map/slope_4km.jpg', quality=92)
    final_slope.save('public/data/map/slope_4km.jpg', quality=92)
    thumb_slope = final_slope.resize((96, 96), Image.Resampling.LANCZOS)
    thumb_slope.save('data/map/thumb_slope.jpg', quality=90)
    thumb_slope.save('public/data/map/thumb_slope.jpg', quality=90)
    print("[SUCCESS] Saved authentic Google Maps hazard-style slope_4km.jpg and thumbnail.")

    # -------------------------------------------------------------
    # C. Cesium / ArcGIS MOLA Rainbow Elevation Hypsometry
    # (Purple low datum -> Blue -> Cyan -> Green -> Yellow -> Crimson high rim)
    # -------------------------------------------------------------
    stops = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    colors = np.array([
        [75, 20, 140],   # Purple (-4,520m floor)
        [25, 118, 210],  # Blue
        [0, 188, 212],   # Cyan
        [67, 160, 71],   # Green
        [253, 216, 53],  # Yellow
        [225, 40, 40]    # Crimson Red (-4,445m high rim)
    ], dtype=np.float32)

    mola_r = np.interp(elev_norm, stops, colors[:, 0]) * hs_factor
    mola_g = np.interp(elev_norm, stops, colors[:, 1]) * hs_factor
    mola_b = np.interp(elev_norm, stops, colors[:, 2]) * hs_factor

    final_mola = np.zeros((size, size, 3), dtype=np.uint8)
    final_mola[:, :, 0] = np.clip(mola_r * 0.82 + sat_arr[:, :, 0] * 0.18, 0, 255).astype(np.uint8)
    final_mola[:, :, 1] = np.clip(mola_g * 0.82 + sat_arr[:, :, 1] * 0.18, 0, 255).astype(np.uint8)
    final_mola[:, :, 2] = np.clip(mola_b * 0.82 + sat_arr[:, :, 2] * 0.18, 0, 255).astype(np.uint8)

    mola_out = Image.fromarray(final_mola)
    mola_out.save('data/map/mola_elevation_4km.jpg', quality=92)
    mola_out.save('public/data/map/mola_elevation_4km.jpg', quality=92)
    thumb_mola = mola_out.resize((96, 96), Image.Resampling.LANCZOS)
    thumb_mola.save('data/map/thumb_mola.jpg', quality=90)
    thumb_mola.save('public/data/map/thumb_mola.jpg', quality=90)
    print("[SUCCESS] Saved Cesium / ArcGIS MOLA rainbow elevation mola_elevation_4km.jpg and thumbnail.")

if __name__ == '__main__':
    generate_maps()
