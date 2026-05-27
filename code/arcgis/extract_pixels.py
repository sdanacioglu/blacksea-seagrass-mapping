"""
Per-pixel extraction from a 13-band Sentinel-2 feature stack TIFF for each
training polygon. Output CSV is used downstream by Python figure generation
scripts (Figures 9-11, Table 5).

Usage (in ArcGIS Pro "Python Window"):
    exec(open(r"path/to/code/arcgis/extract_pixels.py").read())

Estimated runtime: 1-3 minutes (174 polygons, ExtractByMask per polygon).
"""
import arcpy
import numpy as np
import pandas as pd
import os

# ============================================================
# CONFIG — replace with your own paths
# ============================================================
multiband_tif = r"path/to/Features_v7_13band_10M.tif"  # GEE export
polygons      = r"path/to/training_polygons.shp"        # Training shapefile
workspace     = r"path/to/training.gdb"                 # File geodatabase
output_csv    = r"path/to/spectral_pixels.csv"          # Output CSV

# v7 GEE FEATURE_BANDS order (same as export)
BANDS = ['B1', 'B2', 'B3', 'B4', 'B5',
         'NDAVI', 'WAVI', 'MNDWI', 'TI', 'SDB',
         'TB1', 'TB2', 'NDRE']

# ============================================================
# SETUP
# ============================================================
arcpy.CheckOutExtension("Spatial")
arcpy.env.workspace = workspace
arcpy.env.overwriteOutput = True
arcpy.env.snapRaster = multiband_tif

# Ensure POLY_ID field exists (consistent ID for downstream join)
if "POLY_ID" not in [f.name for f in arcpy.ListFields(polygons)]:
    arcpy.management.AddField(polygons, "POLY_ID", "LONG")
    arcpy.management.CalculateField(polygons, "POLY_ID", "!FID!", "PYTHON3")

# Band count sanity check
n_tif_bands = arcpy.Describe(multiband_tif).bandCount
print(f"TIF band count: {n_tif_bands} (expected: {len(BANDS)})")
if n_tif_bands != len(BANDS):
    print("!!! WARNING: Band count mismatch. Verify BANDS list. !!!")

# ============================================================
# EXTRACTION LOOP
# ============================================================
print("\n=== EXTRACTION STARTED ===")
all_pixels = []
errors = 0
processed = 0
empty = 0

with arcpy.da.SearchCursor(polygons, ['POLY_ID', 'class_code', 'SHAPE@']) as cur:
    for poly_id, ccode, shape in cur:
        try:
            # Mask raster to polygon extent
            masked = arcpy.sa.ExtractByMask(multiband_tif, shape)
            arr = arcpy.RasterToNumPyArray(masked, nodata_to_value=np.nan)

            # Ensure (bands, rows, cols)
            if arr.ndim == 2:
                arr = arr[np.newaxis, :, :]

            # Valid pixels (all bands non-NaN)
            valid_mask = np.all(~np.isnan(arr), axis=0)
            n_valid = int(valid_mask.sum())

            if n_valid == 0:
                empty += 1
                del masked, arr
                continue

            # Extract per-pixel rows
            rows_idx, cols_idx = np.where(valid_mask)
            for r, c in zip(rows_idx, cols_idx):
                row = {'POLY_ID': poly_id, 'class_code': ccode}
                for bi, band in enumerate(BANDS):
                    row[band] = float(arr[bi, r, c])
                all_pixels.append(row)

            del masked, arr
            processed += 1

            if processed % 25 == 0:
                print(f"  {processed} polygons | {len(all_pixels)} pixels...")

        except Exception as e:
            errors += 1
            print(f"  ERROR POLY_ID={poly_id}: {e}")

print(f"\nProcessed: {processed} | Empty: {empty} | Errors: {errors}")
print(f"Total pixels extracted: {len(all_pixels)}")

# ============================================================
# SAVE CSV
# ============================================================
df = pd.DataFrame(all_pixels)
df['class_name'] = df['class_code'].map({1: 'Seagrass', 2: 'Sand', 3: 'DeepWater'})
df = df[['POLY_ID', 'class_code', 'class_name'] + BANDS]
df.to_csv(output_csv, index=False, encoding='utf-8-sig')

print(f"\n=== DONE ===")
print(f"Output: {output_csv}")
print("\n--- Pixel count by class ---")
print(df['class_name'].value_counts())
