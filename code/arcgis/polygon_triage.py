"""
Polygon quality control (triage) script for training data validation.
Applies six spectral / index criteria per class to flag polygons for inspection.

Categories:
  - DEFINITE:    score 5/5 → accept directly
  - SUSPECT:     score 3-4/5 → visual review recommended
  - REJECT:      score 0-2/5 → likely problematic, remove or relocate
  - MISSING:     all bands NaN → fell on water mask / shore / cloud → visual check

Thresholds calibrated for Black Sea Case-2 waters using GEE band statistics:
  B3 reflectance:  0.0317 ± 0.0093
  NDAVI:          -0.360 ± 0.108
  SDB:             1.021 ± 0.008
  TI:              0.657 ± 0.123

Usage (ArcGIS Pro Python Window):
    exec(open(r"path/to/code/arcgis/polygon_triage.py").read())
"""
import arcpy
import pandas as pd
import os

# ============================================================
# CONFIG — replace with your own paths
# ============================================================
multiband_tif = r"path/to/Features_v7_13band_10M.tif"   # GEE export
polygons      = r"path/to/training_polygons.shp"
workspace     = r"path/to/training.gdb"
output_csv    = r"path/to/polygon_triage.csv"

BANDS = {
    1: "B1", 2: "B2", 3: "B3", 4: "B4", 5: "B5",
    6: "NDAVI", 7: "WAVI", 8: "MNDWI",
    9: "TI", 10: "SDB",
    11: "TB1", 12: "TB2", 13: "NDRE",
}
USED_BANDS = ["B1", "B2", "B3", "B4", "B5", "NDAVI", "MNDWI", "TI", "SDB"]

# ============================================================
# SETUP
# ============================================================
arcpy.CheckOutExtension("Spatial")
if not arcpy.Exists(workspace):
    arcpy.management.CreateFileGDB(
        os.path.dirname(workspace), os.path.basename(workspace))
arcpy.env.workspace = workspace
arcpy.env.overwriteOutput = True

if "POLY_ID" not in [f.name for f in arcpy.ListFields(polygons)]:
    arcpy.management.AddField(polygons, "POLY_ID", "LONG")
    arcpy.management.CalculateField(polygons, "POLY_ID", "!FID!", "PYTHON3")

# ============================================================
# ZONAL STATS (per band)
# ============================================================
print("=== ZONAL STATISTICS ===")
results = {}
for band_idx, band_name in BANDS.items():
    if band_name not in USED_BANDS:
        continue
    layer_name = f"lyr_{band_name}"
    arcpy.management.MakeRasterLayer(multiband_tif, layer_name, band_index=band_idx)
    out_table = os.path.join(workspace, f"zonal_{band_name}")
    arcpy.sa.ZonalStatisticsAsTable(
        polygons, "POLY_ID", layer_name, out_table, "DATA", "MEAN")
    with arcpy.da.SearchCursor(out_table, ["POLY_ID", "MEAN"]) as cur:
        for poly_id, mean_val in cur:
            results.setdefault(poly_id, {})[band_name] = mean_val
    print(f"  {band_name} -> OK")

classes = {}
with arcpy.da.SearchCursor(polygons, ["POLY_ID", "class_code", "SHAPE@AREA"]) as cur:
    for poly_id, ccode, area in cur:
        classes[poly_id] = {"class_code": ccode, "area_m2": area}

# ============================================================
# CLASS-SPECIFIC EVALUATORS
# ============================================================
def safe(d, k, default=None):
    v = d.get(k)
    return v if v is not None else default

def has_data(b):
    return all(safe(b, k) is not None for k in USED_BANDS)

def evaluate_seagrass(b):
    b3, b4 = safe(b, 'B3', 0), safe(b, 'B4', 0)
    K1 = (b3 >= b4) and (b3/10000 >= 0.025)              # B3 slight peak
    K2 = -0.30 <= safe(b, 'NDAVI', -99) <= -0.05         # Vegetation signal
    K3 = safe(b, 'MNDWI', -99) > 0                       # Water
    K4 = 0 < safe(b, 'TI', 99) < 1.5                     # Clear water
    K5 = 1.005 <= safe(b, 'SDB', -99) <= 1.035           # Shallow-mid depth
    return [K1, K2, K3, K4, K5]

def evaluate_sand(b):
    b2_r = safe(b, 'B2', 0)/10000
    b2, b3, b4 = safe(b, 'B2', 0), safe(b, 'B3', 0), safe(b, 'B4', 0)
    K1 = (b2_r >= 0.045) or (b2 > b3 > b4)               # High B2 or monotonic
    K2 = safe(b, 'NDAVI', 0) < -0.30                     # No vegetation
    K3 = safe(b, 'MNDWI', -99) > 0
    K4 = 0 < safe(b, 'TI', 99) < 1.5
    K5 = 1.000 <= safe(b, 'SDB', -99) <= 1.025           # Shallow
    return [K1, K2, K3, K4, K5]

def evaluate_deep(b):
    b4_r = safe(b, 'B4', 99)/10000
    b3_r = safe(b, 'B3', 99)/10000
    sdb  = safe(b, 'SDB', 0)
    K1 = b4_r < 0.025                                    # Low B4 (deep absorption)
    K2 = safe(b, 'NDAVI', 0) < -0.20                     # No vegetation
    K3 = safe(b, 'MNDWI', -99) > 0
    K4 = 0 < safe(b, 'TI', 99) < 1.5
    K5 = (sdb > 1.010) or (b3_r < 0.035)                 # Mid-deep
    return [K1, K2, K3, K4, K5]

EVALUATORS  = {1: evaluate_seagrass, 2: evaluate_sand, 3: evaluate_deep}
CLASS_NAMES = {1: "Seagrass", 2: "Sand", 3: "DeepWater"}

# ============================================================
# EVALUATE EACH POLYGON
# ============================================================
print("\n=== CRITERION EVALUATION ===")
rows = []
for poly_id, bands in results.items():
    if poly_id not in classes:
        continue
    ccode = classes[poly_id]["class_code"]
    if ccode not in [1, 2, 3]:
        continue

    if not has_data(bands):
        decision = "MISSING"
        criteria = [None]*5
        score = -1
    else:
        criteria = EVALUATORS[ccode](bands)
        score = sum(criteria)
        decision = "DEFINITE" if score == 5 else ("SUSPECT" if score >= 3 else "REJECT")

    rows.append({
        'POLY_ID': poly_id,
        'class_code': ccode,
        'class_name': CLASS_NAMES[ccode],
        'area_m2': round(classes[poly_id]["area_m2"], 1),
        'B1_refl': round(safe(bands, 'B1', 0)/10000, 4) if safe(bands, 'B1') else None,
        'B2_refl': round(safe(bands, 'B2', 0)/10000, 4) if safe(bands, 'B2') else None,
        'B3_refl': round(safe(bands, 'B3', 0)/10000, 4) if safe(bands, 'B3') else None,
        'B4_refl': round(safe(bands, 'B4', 0)/10000, 4) if safe(bands, 'B4') else None,
        'B5_refl': round(safe(bands, 'B5', 0)/10000, 4) if safe(bands, 'B5') else None,
        'NDAVI':   round(safe(bands, 'NDAVI', 0), 3) if safe(bands, 'NDAVI') else None,
        'MNDWI':   round(safe(bands, 'MNDWI', 0), 3) if safe(bands, 'MNDWI') else None,
        'TI':      round(safe(bands, 'TI', 0), 3) if safe(bands, 'TI') else None,
        'SDB':     round(safe(bands, 'SDB', 0), 4) if safe(bands, 'SDB') else None,
        'K1': criteria[0], 'K2': criteria[1], 'K3': criteria[2],
        'K4': criteria[3], 'K5': criteria[4],
        'SCORE': score, 'DECISION': decision
    })

df = pd.DataFrame(rows).sort_values(['class_code', 'SCORE'], ascending=[True, False])
df.to_csv(output_csv, index=False, encoding='utf-8-sig')

# ============================================================
# SUMMARY REPORT
# ============================================================
print(f"\n=== TRIAGE COMPLETED ===")
print(f"Output: {output_csv}\n")

print("--- Decision distribution by class ---")
summary = df.groupby(['class_name', 'DECISION']).size().unstack(fill_value=0)
for col in ['DEFINITE', 'SUSPECT', 'REJECT', 'MISSING']:
    if col not in summary.columns:
        summary[col] = 0
print(summary[['DEFINITE', 'SUSPECT', 'REJECT', 'MISSING']])

print("\n--- Class-wise value distributions (excl. MISSING) ---")
for ccode in [1, 2, 3]:
    sub = df[(df['class_code'] == ccode) & (df['DECISION'] != 'MISSING')]
    if len(sub) == 0:
        continue
    print(f"\n  {CLASS_NAMES[ccode]}: n={len(sub)}")
    for col in ['B3_refl', 'NDAVI', 'TI', 'SDB']:
        s = sub[col].dropna()
        if len(s) > 0:
            print(f"    {col:10s}: mean={s.mean():.4f}  std={s.std():.4f}  "
                  f"min={s.min():.4f}  max={s.max():.4f}")
