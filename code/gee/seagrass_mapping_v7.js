// ==============================================================================
// BATI KARADENİZ (İĞNEADA-KIYIKÖY) KIYILARINDA DENİZ ÇAYIRI HARİTALAMA
// v7.0 - TILE ISOLATION + NDRE + GBM (DII REMOVED)
// ------------------------------------------------------------------------------
// Reproducible Seagrass Mapping Pipeline for the Western Black Sea Coast
// (İğneada–Karaburun, Türkiye) using Sentinel-2 imagery and three machine
// learning classifiers (Random Forest, SVM, Gradient Boosting Machine).
//
// KEY FEATURES (v7):
//   (1) Tile-aware Hedley sunglint correction (T35TLG / T35TMG independent reference)
//   (2) Linear radiometric matching (Schott 1988; Yang & Lo 2000) for tile seam removal
//   (3) NDRE red-edge index added (13th feature)
//   (4) DII excluded (Kuhwald 2021; Mederos-Barrera 2022)
//   (5) GBM classifier added for 3-way comparison (RF, SVM, GBM)
//
// CONFIGURATION: Replace placeholders with your own GEE project paths:
//   STUDY_AREA_ASSET, TRAINING_ASSET, OUTPUT_ASSET_PATH, 'YOUR_DRIVE_FOLDER'
//
// Author: Şevki Danacıoğlu | License: MIT
// ==============================================================================

// ==============================================================================
// 1. STUDY AREA ASSET
// ==============================================================================
var STUDY_AREA_ASSET = 'projects/YOUR_GEE_PROJECT/assets/STUDY_AREA_ASSET';

var studyAreaAsset = ee.FeatureCollection(STUDY_AREA_ASSET);
var studyAreasGeom = studyAreaAsset.geometry();

Map.centerObject(studyAreasGeom, 10);
Map.addLayer(studyAreasGeom, {color: 'cyan'}, '0. Study Area', true, 0.4);

print('=== STUDY AREA ===');
print('Asset:', STUDY_AREA_ASSET);
print('Total area (km²):', studyAreasGeom.area().divide(1e6));

// ==============================================================================
// 2. CLOUD MASKING (QA60 bits 10/11)
// ==============================================================================
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
              .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).copyProperties(image, image.propertyNames());
}

// ==============================================================================
// 3. HEDLEY SUNGLINT CORRECTION (Hedley et al., 2005)
// ------------------------------------------------------------------------------
// refGeom parameter enables per-tile independent correction (v7 enhancement)
// ==============================================================================
function deglint(image, refGeom) {
  var tempMndwi = image.normalizedDifference(['B3', 'B11']).rename('tempMNDWI');
  var deepWater = tempMndwi.gt(0.5);

  var nirStats = image.select('B8').updateMask(deepWater).reduceRegion({
    reducer: ee.Reducer.percentile([5]).combine(ee.Reducer.count(), '', true),
    geometry: refGeom, scale: 300, maxPixels: 1e10, tileScale: 16
  });

  var rawCount = nirStats.get('B8_count');
  var deepPixelCount = ee.Number(ee.Algorithms.If(rawCount, rawCount, 0));
  var hasDeepWater = deepPixelCount.gte(100);

  var rawNirMin = nirStats.get('B8_p5');
  var nirMin = ee.Number(ee.Algorithms.If(rawNirMin, rawNirMin, 0));

  var bandsToCorrect = ['B1', 'B2', 'B3', 'B4', 'B5'];
  var nir = image.select('B8');

  var corrected = bandsToCorrect.map(function(band) {
    var regression = image.select([band, 'B8']).updateMask(deepWater)
      .reduceRegion({
        reducer: ee.Reducer.linearFit(),
        geometry: refGeom, scale: 300, maxPixels: 1e10, tileScale: 16
      });
    var rawSlope = regression.get('scale');
    var slope = ee.Number(ee.Algorithms.If(rawSlope, rawSlope, 0));

    var correctedBand = image.select(band)
      .subtract(nir.subtract(nirMin).multiply(slope));

    return ee.Image(ee.Algorithms.If(
      hasDeepWater, correctedBand.rename(band), image.select(band)
    ));
  });

  var correctedImage = ee.Image(corrected).addBands(image.select(['B8', 'B11']));
  return ee.Image(correctedImage.copyProperties(image, image.propertyNames())).toFloat();
}

// ==============================================================================
// 4. TILE ISOLATION VIA LONGITUDE SPLIT — v7 CORE CHANGE
// ------------------------------------------------------------------------------
// MGRS_TILE filter is replaced by longitude-based split: independent of tile ID,
// remains valid even if tile coverage changes.
//
// For each half:
//   (a) Image collection filtered by half geometry
//   (b) Per-image Hedley correction with half-specific reference
//   (c) 25th percentile composite per half
//   → Halves combined by mosaic() after linear matching (Section 4b)
// ==============================================================================

var DATE_START = '2025-07-01';
var DATE_END   = '2025-09-15';
var CLOUD_PCT  = 20;
var BANDS      = ['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11', 'QA60'];

// Observed tile-seam longitude (verify in your study area)
var TILE_SPLIT_LON = 28.30;
// Overlap zone width for histogram matching (±0.10° ≈ 11 km)
var OVERLAP_DEG    = 0.10;

// Wide geometries (with overlap) for composite building
var westGeom = ee.Geometry.Rectangle([27.7, 41.1, TILE_SPLIT_LON + OVERLAP_DEG, 42.2])
                 .intersection(studyAreasGeom, ee.ErrorMargin(10));
var eastGeom = ee.Geometry.Rectangle([TILE_SPLIT_LON - OVERLAP_DEG, 41.1, 29.0, 42.2])
                 .intersection(studyAreasGeom, ee.ErrorMargin(10));
// Overlap zone for histogram statistics
var overlapGeom = ee.Geometry.Rectangle([TILE_SPLIT_LON - OVERLAP_DEG, 41.1,
                                          TILE_SPLIT_LON + OVERLAP_DEG, 42.2])
                    .intersection(studyAreasGeom, ee.ErrorMargin(10));

// Final clip geometries (non-overlapping)
var westGeom_final = ee.Geometry.Rectangle([27.7, 41.1, TILE_SPLIT_LON, 42.2])
                       .intersection(studyAreasGeom, ee.ErrorMargin(10));
var eastGeom_final = ee.Geometry.Rectangle([TILE_SPLIT_LON, 41.1, 29.0, 42.2])
                       .intersection(studyAreasGeom, ee.ErrorMargin(10));

function buildHalfComposite(halfGeom, halfLabel) {
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(halfGeom)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_PCT))
    .filterDate(DATE_START, DATE_END)
    .select(BANDS)
    .map(maskS2clouds);

  print(halfLabel + ' image count:', col.size());

  var deglinted = col.map(function(img) { return deglint(img, halfGeom); });

  return deglinted
    .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11'])
    .reduce(ee.Reducer.percentile([25]))
    .rename(['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11']);
}

var composite_west_raw = buildHalfComposite(westGeom, 'West (≤28.40°E)');
var composite_east_raw = buildHalfComposite(eastGeom, 'East (≥28.20°E)');

// ==============================================================================
// 4b. LINEAR RADIOMETRIC NORMALIZATION (Mean-Std Matching)
// ------------------------------------------------------------------------------
// Following Schott et al. (1988) and Yang & Lo (2000):
// For each band: x_new = ((x_old − μ_target) / σ_target) × σ_ref + μ_ref
// Statistics computed within the overlap zone (where both tiles produce pixels).
// Reference: East composite (more images = more robust histogram).
// ==============================================================================
var BANDS_TO_MATCH = ['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11'];

function matchMeanStd(targetImg, refImg, bands, geom) {
  var targetStats = targetImg.select(bands).reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
    geometry: geom, scale: 300, maxPixels: 1e10, tileScale: 16
  });
  var refStats = refImg.select(bands).reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
    geometry: geom, scale: 300, maxPixels: 1e10, tileScale: 16
  });

  var matchedBands = bands.map(function(band) {
    var tMean = ee.Number(targetStats.get(band + '_mean'));
    var tStd  = ee.Number(targetStats.get(band + '_stdDev'));
    var rMean = ee.Number(refStats.get(band + '_mean'));
    var rStd  = ee.Number(refStats.get(band + '_stdDev'));
    return targetImg.select(band).subtract(tMean).divide(tStd)
             .multiply(rStd).add(rMean).rename(band);
  });

  var matched = ee.ImageCollection(matchedBands).toBands().rename(bands);
  return ee.Image(matched.copyProperties(targetImg, targetImg.propertyNames()));
}

var composite_west_matched = matchMeanStd(
  composite_west_raw, composite_east_raw, BANDS_TO_MATCH, overlapGeom
);

print('=== LINEAR RADIOMETRIC MATCHING APPLIED (Schott 1988; Yang & Lo 2000) ===');

// Mosaic
var composite = ee.ImageCollection([
  composite_west_matched.clip(westGeom_final),
  composite_east_raw.clip(eastGeom_final)
]).mosaic().clip(studyAreasGeom);

// ==============================================================================
// 5. WATER QUALITY MASKING
// ==============================================================================
var turbidityIndex = composite.expression('(RED / GREEN)', {
  'RED': composite.select('B4'), 'GREEN': composite.select('B3')
}).rename('Turbidity_Index');

var clearWaterMask = turbidityIndex.lt(1.5);  // TI < 1.5 (Lacaux et al. 2006)
composite = composite.updateMask(clearWaterMask);

var mndwi = composite.normalizedDifference(['B3', 'B11']).rename('MNDWI');
var strictWaterMask = mndwi.gt(0);  // MNDWI > 0 (Xu 2006)
composite = composite.updateMask(strictWaterMask);

var turbidity = turbidityIndex.updateMask(clearWaterMask).updateMask(strictWaterMask);

// ==============================================================================
// 6. DERIVED FEATURES — 13 features total
// ==============================================================================

// Aquatic vegetation indices (Villa et al. 2014)
var ndavi = composite.normalizedDifference(['B8', 'B2']).rename('NDAVI');
var wavi = composite.expression('((B8 - B2) / (B8 + B2 + 0.5)) * 1.5', {
  'B8': composite.select('B8'), 'B2': composite.select('B2')
}).rename('WAVI');

// NDRE — Red-edge index (Wicaksono & Hafizt 2013)
var ndre = composite.normalizedDifference(['B8', 'B5']).rename('NDRE');

// SDB — Satellite-Derived Bathymetry (Stumpf et al. 2003)
var sdb = composite.expression('log(1000 * BLUE) / log(1000 * GREEN)', {
  'BLUE': composite.select('B2'), 'GREEN': composite.select('B3')
}).rename('SDB');

// PCA components TB1, TB2
var pcaBands = ['B1', 'B2', 'B3', 'B4', 'B5'];
var pcaImage = composite.select(pcaBands);
var meanDict = pcaImage.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: studyAreasGeom,
  scale: 300, maxPixels: 1e10, tileScale: 16
});
var meansImage = ee.Image.constant(meanDict.values(pcaBands));
var centered = pcaImage.subtract(meansImage);
var covar = centered.toArray().reduceRegion({
  reducer: ee.Reducer.centeredCovariance(), geometry: studyAreasGeom,
  scale: 300, maxPixels: 1e10, tileScale: 16
}).get('array');
var eigenDecomp = ee.Array(covar).eigen();
var eigenVectors = eigenDecomp.slice(1, 1);
var principalComponents = ee.Image(eigenVectors)
  .matrixMultiply(centered.toArray().toArray(1));
var pcImage = principalComponents.arrayProject([0])
  .arrayFlatten([['PC1', 'PC2', 'PC3', 'PC4', 'PC5']]);
var pc1 = pcImage.select('PC1');
var pc2 = pcImage.select('PC2');

// ==============================================================================
// 7. FEATURE STACK — 13 features
// ==============================================================================
var stackedFeatures = ee.Image.cat([
  composite.select(['B1', 'B2', 'B3', 'B4', 'B5']),
  ndavi, wavi, mndwi,
  turbidity.rename('Turbidity_Index'),
  sdb,
  pc1.rename('TB1'), pc2.rename('TB2'),
  ndre
]);

var FEATURE_BANDS = [
  'B1', 'B2', 'B3', 'B4', 'B5',
  'NDAVI', 'WAVI', 'MNDWI',
  'Turbidity_Index', 'SDB',
  'TB1', 'TB2', 'NDRE'
];

// ==============================================================================
// 8. VISUALIZATION (preprocessing)
// ==============================================================================
Map.addLayer(composite, {bands: ['B4','B3','B2'], min: 0, max: 0.15},
  '1. RGB composite (tile-isolated)');
Map.addLayer(ndavi, {min: -0.3, max: 0.1,
  palette: ['brown','white','green']}, '2. NDAVI', false);
Map.addLayer(ndre, {min: -0.2, max: 0.2,
  palette: ['brown','white','darkgreen']}, '3. NDRE', false);
Map.addLayer(sdb, {min: 0.8, max: 1.3,
  palette: ['navy','cyan','yellow']}, '4. SDB', false);

// ==============================================================================
// 9. QUALITY CHECK
// ==============================================================================
var pixelCount = composite.select('B2').reduceRegion({
  reducer: ee.Reducer.count(), geometry: studyAreasGeom,
  scale: 100, maxPixels: 1e10, tileScale: 16
});
print('=== QC ===');
print('Composite pixel count (B2):', pixelCount.get('B2'));
print('Feature bands (13):', stackedFeatures.bandNames());

// ==============================================================================
// 10. EXPORT FEATURE STACK TO DRIVE
// ==============================================================================
Export.image.toDrive({
  image: stackedFeatures.toFloat(),
  description: 'Features_v7_13band_10M',
  folder: 'YOUR_DRIVE_FOLDER', scale: 10,
  region: studyAreasGeom, crs: 'EPSG:32635',
  fileFormat: 'GeoTIFF', maxPixels: 1e13
});

// ##############################################################################
// ###                  CLASSIFICATION WORKFLOW                               ###
// ##############################################################################

// ==============================================================================
// 11. TRAINING POLYGONS
// ------------------------------------------------------------------------------
// Required attributes:
//   - class_code (integer): 1=Seagrass, 2=Sand, 3=Deep water
// ==============================================================================
var TRAINING_ASSET = 'projects/YOUR_GEE_PROJECT/assets/TRAINING_POLYGONS_ASSET';
var allTrainingPolys = ee.FeatureCollection(TRAINING_ASSET);

var seagrass_polys   = allTrainingPolys.filter(ee.Filter.eq('class_code', 1));
var sand_polys       = allTrainingPolys.filter(ee.Filter.eq('class_code', 2));
var deep_water_polys = allTrainingPolys.filter(ee.Filter.eq('class_code', 3));

print('=== TRAINING POLYGONS ===');
print('Total:', allTrainingPolys.size());
print('Seagrass (1):', seagrass_polys.size());
print('Sand (2):', sand_polys.size());
print('Deepwater (3):', deep_water_polys.size());

// ==============================================================================
// 12. NEGATIVE BUFFER (Schütt et al., 2025 — mixed-pixel filter)
// ==============================================================================
var NEG_BUFFER_M = 5;
function applyNegativeBuffer(fc, bufferMeters) {
  return fc.map(function(f) {
    return f.setGeometry(f.geometry().buffer(-bufferMeters));
  });
}

var seagrass_fc = applyNegativeBuffer(seagrass_polys, NEG_BUFFER_M)
  .map(function(f) { return f.set({'class_sub': 'seagrass', 'class': 1}); });
var sand_fc = applyNegativeBuffer(sand_polys, NEG_BUFFER_M)
  .map(function(f) { return f.set({'class_sub': 'sand', 'class': 0}); });
var deep_water_fc = applyNegativeBuffer(deep_water_polys, NEG_BUFFER_M)
  .map(function(f) { return f.set({'class_sub': 'deep_water', 'class': 0}); });

var allPolygons = seagrass_fc.merge(sand_fc).merge(deep_water_fc);

// ==============================================================================
// 13. SPATIAL CROSS-VALIDATION — AUTO BLOCK ASSIGNMENT (K/O/G)
// ==============================================================================
var assetBounds = studyAreasGeom.bounds();
var boundsCoords = ee.List(assetBounds.coordinates().get(0));
var swCorner = ee.List(boundsCoords.get(0));
var neCorner = ee.List(boundsCoords.get(2));

var asset_minLat    = ee.Number(swCorner.get(1));
var asset_maxLat    = ee.Number(neCorner.get(1));
var asset_latRange  = asset_maxLat.subtract(asset_minLat);
var asset_blockHeight = asset_latRange.divide(3);

var block_G_bound = asset_minLat.add(asset_blockHeight);
var block_O_bound = asset_minLat.add(asset_blockHeight.multiply(2));

print('=== SPATIAL CV BLOCKS ===');
print('Block G (South):', asset_minLat, '–', block_G_bound);
print('Block O (Middle):', block_G_bound, '–', block_O_bound);
print('Block K (North):', block_O_bound, '–', asset_maxLat);

var polygonsWithBlock = allPolygons.map(function(f) {
  var centroid_lat = ee.Number(f.geometry().centroid().coordinates().get(1));
  var block = ee.Algorithms.If(
    centroid_lat.lt(block_G_bound), 'G',
    ee.Algorithms.If(centroid_lat.lt(block_O_bound), 'O', 'K')
  );
  return f.set('block', block);
});

['G', 'O', 'K'].forEach(function(bn) {
  var bp = polygonsWithBlock.filter(ee.Filter.eq('block', bn));
  print('Block ' + bn + ' — total:', bp.size(),
        ' SG:', bp.filter(ee.Filter.eq('class', 1)).size(),
        ' NS:', bp.filter(ee.Filter.eq('class', 0)).size());
});

// ==============================================================================
// 14. PIXEL SAMPLING + Z-SCORE NORMALIZATION + PER-BLOCK UNDERSAMPLING
// ==============================================================================
var sampledFeatures = stackedFeatures.sampleRegions({
  collection: polygonsWithBlock,
  properties: ['class', 'class_sub', 'block'],
  scale: 10, geometries: false, tileScale: 16
});

var bandStats = stackedFeatures.reduceRegion({
  reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
  geometry: studyAreasGeom, scale: 100, maxPixels: 1e10,
  bestEffort: true, tileScale: 16
});

var normalizedBands = [];
FEATURE_BANDS.forEach(function(b) {
  var mean = ee.Number(bandStats.get(b + '_mean'));
  var std  = ee.Number(bandStats.get(b + '_stdDev'));
  normalizedBands.push(stackedFeatures.select(b).subtract(mean).divide(std).rename(b));
});
var stackedFeatures_norm = ee.Image.cat(normalizedBands);

var sampledFeatures_norm = stackedFeatures_norm.sampleRegions({
  collection: polygonsWithBlock,
  properties: ['class', 'class_sub', 'block'],
  scale: 10, geometries: false, tileScale: 16
});

function balanceBlock(blockName) {
  var blockData = sampledFeatures_norm.filter(ee.Filter.eq('block', blockName));
  var sg = blockData.filter(ee.Filter.eq('class', 1));
  var ns = blockData.filter(ee.Filter.eq('class', 0));
  var sgCount = sg.size();
  var nsBalanced = ns.randomColumn('rand', 42).sort('rand').limit(sgCount);
  return sg.merge(nsBalanced);
}
sampledFeatures = balanceBlock('G').merge(balanceBlock('O')).merge(balanceBlock('K'));

print('=== BALANCED SAMPLE (z-score + per-block undersampling) ===');
print('Total pixels:', sampledFeatures.size());

// ==============================================================================
// 15. FOLD EVALUATION FUNCTION (shared by RF / SVM / GBM)
// ==============================================================================
function evaluateFold(trainingSet, validationSet, classifierType, classifierParams) {
  var classifier;
  if (classifierType === 'RF') {
    classifier = ee.Classifier.smileRandomForest({
      numberOfTrees: classifierParams.numberOfTrees,
      variablesPerSplit: classifierParams.variablesPerSplit, seed: 42
    }).train({features: trainingSet, classProperty: 'class', inputProperties: FEATURE_BANDS});
  } else if (classifierType === 'SVM') {
    classifier = ee.Classifier.libsvm({
      kernelType: 'RBF',
      cost: classifierParams.cost, gamma: classifierParams.gamma
    }).train({features: trainingSet, classProperty: 'class', inputProperties: FEATURE_BANDS});
  } else if (classifierType === 'GBM') {
    classifier = ee.Classifier.smileGradientTreeBoost({
      numberOfTrees: classifierParams.numberOfTrees,
      shrinkage: classifierParams.shrinkage,
      samplingRate: classifierParams.samplingRate,
      maxNodes: classifierParams.maxNodes, seed: 42
    }).train({features: trainingSet, classProperty: 'class', inputProperties: FEATURE_BANDS});
  }
  var validated = validationSet.classify(classifier);
  var cm = validated.errorMatrix('class', 'classification');
  return {
    classifier: classifier, confusionMatrix: cm,
    overallAccuracy: cm.accuracy(), kappa: cm.kappa(),
    producersAccuracy: cm.producersAccuracy(),
    consumersAccuracy: cm.consumersAccuracy()
  };
}

// ==============================================================================
// 16. RANDOM FOREST — 3-fold spatial CV
// ==============================================================================
var rfParams = {numberOfTrees: 100, variablesPerSplit: 4};
var rfFolds = ['G', 'O', 'K'].map(function(vb) {
  var tr = sampledFeatures.filter(ee.Filter.neq('block', vb));
  var va = sampledFeatures.filter(ee.Filter.eq('block', vb));
  return evaluateFold(tr, va, 'RF', rfParams);
});
print('=== RF SPATIAL CV ===');
rfFolds.forEach(function(fold, i) {
  print('--- Fold ' + ['G','O','K'][i] + ' ---');
  print('OA:', fold.overallAccuracy, '| Kappa:', fold.kappa);
});
var rfOA = ee.List(rfFolds.map(function(f) { return f.overallAccuracy; }));
var rfKp = ee.List(rfFolds.map(function(f) { return f.kappa; }));
print('RF Mean OA:', rfOA.reduce(ee.Reducer.mean()));
print('RF Mean Kappa:', rfKp.reduce(ee.Reducer.mean()));

var rfClassifier_final = ee.Classifier.smileRandomForest({
  numberOfTrees: rfParams.numberOfTrees,
  variablesPerSplit: rfParams.variablesPerSplit, seed: 42
}).train({features: sampledFeatures, classProperty: 'class', inputProperties: FEATURE_BANDS});

var rfImportance = ee.Dictionary(rfClassifier_final.explain().get('importance'));
print('=== RF VARIABLE IMPORTANCE ===');
print(rfImportance);

var rfClassified = stackedFeatures_norm.classify(rfClassifier_final).rename('RF_class');

// ==============================================================================
// 17. SVM — GRID SEARCH + 3-fold spatial CV
// ==============================================================================
var SVM_C_GRID     = [0.1, 1, 10, 100, 1000];
var SVM_GAMMA_GRID = [0.0001, 0.001, 0.01, 0.1, 1];

var svmGridParams = [];
SVM_C_GRID.forEach(function(c) {
  SVM_GAMMA_GRID.forEach(function(g) {
    svmGridParams.push({cost: c, gamma: g});
  });
});

var svmGridResults = svmGridParams.map(function(params) {
  var foldOAs = ['G', 'O', 'K'].map(function(vb) {
    var tr = sampledFeatures.filter(ee.Filter.neq('block', vb));
    var va = sampledFeatures.filter(ee.Filter.eq('block', vb));
    return evaluateFold(tr, va, 'SVM', params).overallAccuracy;
  });
  return {cost: params.cost, gamma: params.gamma,
          meanOA: ee.List(foldOAs).reduce(ee.Reducer.mean())};
});

print('=== SVM GRID SEARCH (25 combinations) ===');
svmGridResults.forEach(function(r) {
  print('C=' + r.cost + ' γ=' + r.gamma + ' → mean OA:', r.meanOA);
});

var meanOAList = ee.List(svmGridResults.map(function(r) { return r.meanOA; }));
var maxOA      = meanOAList.reduce(ee.Reducer.max());
var bestIdx    = meanOAList.indexOf(maxOA);
var nGamma     = SVM_GAMMA_GRID.length;
var bestC      = ee.List(SVM_C_GRID).get(ee.Number(bestIdx).divide(nGamma).floor());
var bestGamma  = ee.List(SVM_GAMMA_GRID).get(ee.Number(bestIdx).mod(nGamma));

print('=== BEST SVM PARAMS ===');
print('C*:', bestC, '| γ*:', bestGamma, '| Mean OA:', maxOA);

var svmParams = {cost: bestC, gamma: bestGamma};
var svmFolds = ['G', 'O', 'K'].map(function(vb) {
  var tr = sampledFeatures.filter(ee.Filter.neq('block', vb));
  var va = sampledFeatures.filter(ee.Filter.eq('block', vb));
  return evaluateFold(tr, va, 'SVM', svmParams);
});
print('=== SVM SPATIAL CV (best params) ===');
svmFolds.forEach(function(fold, i) {
  print('--- Fold ' + ['G','O','K'][i] + ' ---');
  print('OA:', fold.overallAccuracy, '| Kappa:', fold.kappa);
});
var svmOA = ee.List(svmFolds.map(function(f) { return f.overallAccuracy; }));
var svmKp = ee.List(svmFolds.map(function(f) { return f.kappa; }));
print('SVM Mean OA:', svmOA.reduce(ee.Reducer.mean()));
print('SVM Mean Kappa:', svmKp.reduce(ee.Reducer.mean()));

var svmClassifier_final = ee.Classifier.libsvm({
  kernelType: 'RBF', cost: svmParams.cost, gamma: svmParams.gamma
}).train({features: sampledFeatures, classProperty: 'class', inputProperties: FEATURE_BANDS});
var svmClassified = stackedFeatures_norm.classify(svmClassifier_final).rename('SVM_class');

// ==============================================================================
// 18. GBM — 3-fold spatial CV (Maxwell et al., 2021)
// ==============================================================================
var gbmParams = {numberOfTrees: 150, shrinkage: 0.05, samplingRate: 0.7, maxNodes: 30};
var gbmFolds = ['G', 'O', 'K'].map(function(vb) {
  var tr = sampledFeatures.filter(ee.Filter.neq('block', vb));
  var va = sampledFeatures.filter(ee.Filter.eq('block', vb));
  return evaluateFold(tr, va, 'GBM', gbmParams);
});
print('=== GBM SPATIAL CV ===');
gbmFolds.forEach(function(fold, i) {
  print('--- Fold ' + ['G','O','K'][i] + ' ---');
  print('OA:', fold.overallAccuracy, '| Kappa:', fold.kappa);
});
var gbmOA = ee.List(gbmFolds.map(function(f) { return f.overallAccuracy; }));
var gbmKp = ee.List(gbmFolds.map(function(f) { return f.kappa; }));
print('GBM Mean OA:', gbmOA.reduce(ee.Reducer.mean()));
print('GBM Mean Kappa:', gbmKp.reduce(ee.Reducer.mean()));

var gbmClassifier_final = ee.Classifier.smileGradientTreeBoost({
  numberOfTrees: gbmParams.numberOfTrees, shrinkage: gbmParams.shrinkage,
  samplingRate: gbmParams.samplingRate, maxNodes: gbmParams.maxNodes, seed: 42
}).train({features: sampledFeatures, classProperty: 'class', inputProperties: FEATURE_BANDS});
var gbmClassified = stackedFeatures_norm.classify(gbmClassifier_final).rename('GBM_class');

// ==============================================================================
// 19. COMPARATIVE PERFORMANCE SUMMARY
// ==============================================================================
print('\n=== COMPARATIVE PERFORMANCE (3-fold spatial CV means) ===');
print('RF  — Mean OA:', rfOA.reduce(ee.Reducer.mean()),  '| Mean κ:', rfKp.reduce(ee.Reducer.mean()));
print('SVM — Mean OA:', svmOA.reduce(ee.Reducer.mean()), '| Mean κ:', svmKp.reduce(ee.Reducer.mean()));
print('GBM — Mean OA:', gbmOA.reduce(ee.Reducer.mean()), '| Mean κ:', gbmKp.reduce(ee.Reducer.mean()));

// ==============================================================================
// 20. POST-CLASSIFICATION FILTER (MMU = 4 pixels, Deeks et al., 2024)
// ==============================================================================
function postClassificationFilter(classifiedImage) {
  var connected = classifiedImage.connectedPixelCount({maxSize: 100, eightConnected: false});
  return classifiedImage.updateMask(connected.gte(5));
}

var rfFiltered  = postClassificationFilter(rfClassified).rename('RF_class_filtered');
var svmFiltered = postClassificationFilter(svmClassified).rename('SVM_class_filtered');
var gbmFiltered = postClassificationFilter(gbmClassified).rename('GBM_class_filtered');

var rfSeagrass  = rfFiltered.eq(1).selfMask().rename('RF_seagrass');
var svmSeagrass = svmFiltered.eq(1).selfMask().rename('SVM_seagrass');
var gbmSeagrass = gbmFiltered.eq(1).selfMask().rename('GBM_seagrass');

// ==============================================================================
// 20b. BIOPHYSICAL MASK (DEPTH + COASTAL DISTANCE)
// ------------------------------------------------------------------------------
// Following Traganos & Reinartz (2018) and Roelfsema et al. (2018):
//   - GEBCO depth ≤ 15 m
//   - JRC-derived coastal distance ≤ 3 km
// ==============================================================================
var bathymetry = ee.Image('NOAA/NGDC/ETOPO1').select('bedrock');
var depth = bathymetry.multiply(-1).rename('depth_m');
var depthMask = depth.lte(15).and(depth.gte(0));

var jrcWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
var permanentWater = jrcWater.gte(90).unmask(0);
var land = permanentWater.eq(0);
var distFromLand_m = land.fastDistanceTransform(50, 'pixels', 'squared_euclidean')
                          .sqrt().multiply(30);
var coastMask = distFromLand_m.lte(3000);  // 3 km

var bioMask = depthMask.and(coastMask);

print('=== BIOPHYSICAL MASK APPLIED ===');
print('GEBCO ≤ 15 m + JRC coastal distance ≤ 3 km');

var rfSG_masked  = rfSeagrass.updateMask(bioMask).rename('RF_seagrass_masked');
var svmSG_masked = svmSeagrass.updateMask(bioMask).rename('SVM_seagrass_masked');
var gbmSG_masked = gbmSeagrass.updateMask(bioMask).rename('GBM_seagrass_masked');

// ==============================================================================
// 21. AREA CALCULATION (masked outputs)
// ==============================================================================
var pixelArea = ee.Image.pixelArea();
function calcArea(seagrassImage) {
  return seagrassImage.multiply(pixelArea).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: studyAreasGeom,
    scale: 30, maxPixels: 1e13, tileScale: 16, bestEffort: true
  });
}

print('=== SEAGRASS AREA (MASKED, m²) ===');
print('RF:',  calcArea(rfSG_masked));
print('SVM:', calcArea(svmSG_masked));
print('GBM:', calcArea(gbmSG_masked));

// Majority consensus (≥2 of 3 classifiers — Kuncheva 2004)
var majorityAgreement = rfFiltered.eq(1).add(svmFiltered.eq(1)).add(gbmFiltered.eq(1))
  .gte(2).updateMask(bioMask).selfMask().rename('majority_seagrass');

print('Majority consensus (≥2 classifiers, m²):', calcArea(majorityAgreement));

// ==============================================================================
// 22. VISUALIZATION (classification outputs)
// ==============================================================================
Map.addLayer(rfSG_masked,  {palette: ['darkgreen']}, 'RF seagrass (masked)', true);
Map.addLayer(svmSG_masked, {palette: ['orange']},    'SVM seagrass (masked)', true);
Map.addLayer(gbmSG_masked, {palette: ['blue']},      'GBM seagrass (masked)', false);
Map.addLayer(majorityAgreement, {palette: ['red']},  'Majority consensus (≥2)', true);
Map.addLayer(bioMask.selfMask(), {palette: ['lime']}, 'Biophysical mask', false, 0.4);

// ==============================================================================
// 23. EXPORT — ASSET + DRIVE
// ==============================================================================
var OUTPUT_ASSET_PATH = 'projects/YOUR_GEE_PROJECT/assets/OUTPUT_FOLDER';

// Asset exports
[
  {img: rfSG_masked,        name: 'RF_seagrass_masked_v7'},
  {img: svmSG_masked,       name: 'SVM_seagrass_masked_v7'},
  {img: gbmSG_masked,       name: 'GBM_seagrass_masked_v7'},
  {img: majorityAgreement,  name: 'Majority_seagrass_masked_v7'}
].forEach(function(x) {
  Export.image.toAsset({
    image: x.img.unmask(0).toByte(),
    description: x.name,
    assetId: OUTPUT_ASSET_PATH + '/' + x.name,
    scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
  });
});

// Drive exports (primary deliverables)
[
  {img: majorityAgreement,  name: 'Majority_Seagrass_v7_MASKED'},
  {img: svmSG_masked,       name: 'SVM_Seagrass_v7_MASKED'},
  {img: rfSG_masked,        name: 'RF_Seagrass_v7_MASKED'},
  {img: gbmSG_masked,       name: 'GBM_Seagrass_v7_MASKED'}
].forEach(function(x) {
  Export.image.toDrive({
    image: x.img.unmask(0).toByte(),
    description: x.name,
    folder: 'YOUR_DRIVE_FOLDER', scale: 10, region: studyAreasGeom,
    crs: 'EPSG:32635', fileFormat: 'GeoTIFF', maxPixels: 1e13
  });
});

Export.image.toDrive({
  image: bioMask.toByte(),
  description: 'BiophysicalMask_v7',
  folder: 'YOUR_DRIVE_FOLDER', scale: 30, region: studyAreasGeom,
  crs: 'EPSG:32635', fileFormat: 'GeoTIFF', maxPixels: 1e13
});
