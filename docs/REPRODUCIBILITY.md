# Reproducibility Guide

Step-by-step instructions to reproduce the published classification results.

---

## Prerequisites

1. **Google Earth Engine account** ([free signup](https://earthengine.google.com/signup/))
2. **GEE Cloud Project** with assets and storage enabled
3. (Optional) **ArcGIS Pro 3.x** for polygon-level analysis and pixel extraction

---

## Step 1 — Asset preparation

Upload the following to your GEE Cloud Project as assets:

### (a) Study area boundary
- A polygon feature collection covering the area of interest
- Suggested: a coastal polygon with ~100 m landward buffer to include intertidal pixels
- Asset path: `projects/YOUR_GEE_PROJECT/assets/STUDY_AREA_ASSET`

### (b) Training polygons
- A polygon feature collection with one **`class_code`** integer attribute (the polygons of this study are provided in [`data/training_polygons.geojson`](../data/training_polygons.geojson); derive `class_code` from its `class_sub` field):
  - `1` = Seagrass
  - `2` = Sand / bare substrate
  - `3` = Deep water
- Recommended: ≥ 50 polygons per class, distributed across latitudinal extent
- Asset path: `projects/YOUR_GEE_PROJECT/assets/TRAINING_POLYGONS_ASSET`

### (c) Output folder
- Empty asset folder for classification output rasters
- Asset path: `projects/YOUR_GEE_PROJECT/assets/OUTPUT_FOLDER`

---

## Step 2 — Configure and run the GEE pipeline

1. Open [`code/gee/seagrass_mapping_v9.js`](../code/gee/seagrass_mapping_v9.js) in the [GEE Code Editor](https://code.earthengine.google.com/)
2. Replace placeholder asset paths with your own
3. (Optional) Adjust date range, cloud threshold, or tile split longitude in Section 4 if your study area differs
4. Click **Run** — pipeline outputs will appear in the console (~3–10 min)
5. Export tasks will be queued in the **Tasks** tab — click **Run** to start exports to Google Drive

### Expected console output

- Image counts per longitudinal half (e.g., 62 west, 93 east)
- Linear matching confirmation
- Composite pixel count (~150,000)
- Polygon counts per block (script codes G/O/K = blocks S/C/N of the paper)
- Balanced sample sizes (2,460 pixels)
- 3-fold CV results for RF and SVM (with grid search)
- Variable importance scores for RF (11 features)
- Masked seagrass area estimates (`Export.table.toDrive` batch task; CSV in Drive)

---

## Step 3 — ArcGIS analysis (optional)

For polygon-level quality control and per-pixel feature extraction, two ArcGIS Pro scripts are provided:

### Polygon triage
Validates training polygons against six spectral/index criteria per class.

```python
# In ArcGIS Pro Python Window
exec(open(r"path/to/code/arcgis/polygon_triage.py").read())
```

Output: CSV with per-polygon decision (`DEFINITE` / `SUSPECT` / `REJECT` / `MISSING`).

### Pixel extraction
Extracts per-pixel feature values within each training polygon for spectral analysis.

```python
exec(open(r"path/to/code/arcgis/extract_pixels.py").read())
```

Output: CSV with all 11 feature values per pixel, joined with class labels.

---

## Expected results

| Classifier | OA | κ |
|---|---|---|
| Random Forest | 0.832 | 0.663 |
| **SVM** (C\*=10, γ\*=0.1) | **0.861** | **0.722** |

### Per-fold breakdown

| Fold | RF — OA / κ | SVM — OA / κ |
|---|---|---|
| Block S (South; script code G) | 0.681 / 0.363 | 0.697 / 0.394 |
| Block C (Centre; script code O) | 0.840 / 0.681 | 0.900 / 0.801 |
| Block N (North; script code K) | 0.973 / 0.946 | 0.985 / 0.970 |

**Reproducibility note**: The pipeline uses a coordinate-based key for per-block 1:1 undersampling, so the balanced sample (2,460 pixels) is the same in every run. The SVM results are stable; the RF results were observed to vary slightly between runs of the same configuration (mean OA 0.828–0.832). A sensitivity test over 20 RF parameter combinations (50–500 trees × 2–6 variables per split) gave mean OA 0.820–0.832 and κ 0.639–0.664.

### Area estimates (after MMU filter and coastal mask)

| Product | Area |
|---|---|
| SVM | 3,634 ha |
| RF | 3,509 ha |
| RF ∩ SVM (agreement) | 2,991 ha |

**Note on the coastal mask**: the script computes the distance to land in pixels and multiplies it by 30 (Section 19b, threshold 3,000). Evaluated on the 10 m export grid, this corresponds to an effective distance of **≈ 1 km**, which is the value reported in the paper. The published areas were produced with this setting.

---

## Troubleshooting

| Symptom | Likely cause | Solution |
|---|---|---|
| `Earth Engine memory capacity exceeded` | Per-image clip() before composite | Clip only on final composite, not per-image |
| `Computation timed out` (interactive area calc) | Interactive `reduceRegion` exceeds 5-min limit | Pipeline uses `Export.table.toDrive` batch task for final area values |
| Tile seam visible in output | Linear matching skipped | Verify Section 4b ran without error |
| Open-sea false positives | Biophysical mask not applied | Verify the JRC dataset is accessible (check Section 19b) |
| Stacked feature export `mixed dataType` error | Heterogeneous band types | Pipeline uses `.toFloat()` and `bounds()` region + COG profile |
