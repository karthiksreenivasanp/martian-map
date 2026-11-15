# Martian Map - Data Sources and Citations

## Overview
Martian Map utilizes authoritative open-access scientific datasets provided by NASA, the United States Geological Survey (USGS), and the International Astronomical Union (IAU). This document provides exact file mappings, acquisition instruments, spatial reference systems, and licensing details.

## Planetary Datasets

| Dataset Name | Mission / Instrument | Repository Files | Origin Source / URL | Projection / Datum | License / Rights |
|---|---|---|---|---|---|
| Mars Viking Colorized Global Mosaic | NASA Viking Orbiters 1 & 2 (MDIM 2.1) | data/globe/mars_viking_color_4096.jpg, data/globe/Mars_Viking_MDIM21_ClrMosaic_1km.jpg | USGS Astrogeology Science Center (https://astrogeology.usgs.gov) | IAU 2000 Mars Spherical (R = 3,396,190 m) | NASA Public Domain (17 U.S.C. 105) |
| MOLA Global Elevation & Hillshade | NASA Mars Global Surveyor (MGS) / MOLA | data/map/mars_global_mola.jpg, data/map/mars_global_terrain.jpg, data/map/mars_global_slope.jpg | NASA PDS Geosciences Node (https://pds-geosciences.wustl.edu) | IAU 2000 Mars Equirectangular, MOLA Areoid Datum (0 km = 3,396,000 m) | NASA Public Domain (17 U.S.C. 105) |
| Gale Crater Color Orthophoto Mosaic | NASA Mars Reconnaissance Orbiter (MRO) / HiRISE | data/map/satellite_4km.jpg, data/map/thumb_satellite.jpg | University of Arizona / NASA JPL (https://www.uahirise.org) | Local Gale Quad (4.5895 S, 137.4417 E), 25 cm/px native resolution | NASA Public Domain (17 U.S.C. 105) |
| Gale Crater Topographic DEM & Slope | NASA MRO HiRISE Stereo DTM & HRSC Blend | data/map/terrain_hillshade_4km.jpg, data/map/slope_4km.jpg, data/map/mola_elevation_4km.jpg | USGS MSL Landing Site DTM | MOLA Elevation Datum (-4,501 m Bradbury Landing reference) | NASA Public Domain (17 U.S.C. 105) |
| Planetary Nomenclature Gazetteer | USGS / IAU Working Group for Planetary System Nomenclature | data/places/mars_nomenclature.json, data/places/MARS_nomenclature_center_pts.kmz | USGS Gazetteer of Planetary Nomenclature (https://planetarynames.wr.usgs.gov) | Planetocentric Latitude (-90 to +90 deg), Positive East Longitude (0 to 360 deg) | Open Scientific Data / Public Domain |
| Curiosity Mastcam 360 Panoramas | NASA MSL Curiosity Rover / Mastcam (Mast Camera) | data/panos/pano_rocknest_clean.jpg, data/panos/pano_clean.jpg, data/panos/pano_sol3507.jpg, data/panos/pano_sol3512.jpg, data/panos/pano_montmercou_clean.jpg, data/panos/pano_murray_clean.jpg, data/panos/pano_namib_clean.jpg, data/panos/pano_verarubin_clean.jpg | NASA JPL-Caltech / Malin Space Science Systems (https://mars.nasa.gov/msl) | Cylindrical 360-degree equirectangular projection | NASA Public Domain (17 U.S.C. 105) |
| Curiosity REMS Surface Meteorology | NASA MSL / Rover Environmental Monitoring Station (REMS) | Algorithmic baseline model in src/ui.js | NASA JPL / Centro de Astrobiologia (CAB) (https://mars.nasa.gov/msl/weather) | Gale Crater Sol diurnal temperature and pressure cycles | NASA Public Domain (17 U.S.C. 105) |

## Software Dependencies and Licenses

| Component | Version | Purpose | Upstream URL | License |
|---|---|---|---|---|
| Three.js | ^0.187.0 | WebGL 3D terrain rendering, sky simulation, and planetary globe | https://threejs.org | MIT License |
| Leaflet | ^1.9.4 | 2D Mars equirectangular map pan and zoom engine | https://leafletjs.com | BSD-2-Clause License |
| Lucide Icons | Inline SVG | Tactical user interface iconography | https://lucide.dev | ISC License |
| Vite | ^8.3.8 | Modern frontend tooling and production bundler | https://vite.dev | MIT License |
| Puppeteer Core | ^25.17.0 | Headless test runner and regression screenshot automation | https://pptr.dev | Apache-2.0 License |

## Legal and Copyright Notice
United States Government works, including imagery, telemetry, and cartographic data produced by NASA and USGS personnel, are not subject to copyright protection within the United States pursuant to 17 U.S.C. Section 105. Use of NASA materials does not constitute an endorsement by NASA or the United States Government.
