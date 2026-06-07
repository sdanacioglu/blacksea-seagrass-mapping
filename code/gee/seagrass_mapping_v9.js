// =============================================================================
// SEAGRASS HABITAT MAPPING — WESTERN BLACK SEA COAST (TÜRKİYE)
// İğneada–Karaburun, ~130 km | Sentinel-2 L2A | RF & SVM binary classification
// v9.0 — ETOPO1 depth mask removed; coastal-distance-only biophysical mask
// =============================================================================
// Author  : Ş. Danacıoğlu — İzmir Bakırçay University, Geography Dept.
// Contact : sdanacioglu@gmail.com
// AI Asst.: Claude Opus 4.6 (Anthropic) — code review, refactoring, comments
// GitHub  : github.com/sdanacioglu/blacksea-seagrass-mapping
// Web App : sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping
// =============================================================================
// v8 → v9 changes:
//   (1) ETOPO1/GEBCO depth mask removed — biophysical mask now uses coastal
//       distance only (JRC 3 km buffer). Rationale: SDB provides indirect
//       depth constraint; Secchi depth 2–5 m already limits optical penetration
//       in Case-2 Black Sea waters (Canuti, 2025; Grégoire vd., 2023).
//   (2) Comments cleaned up for publication readiness.
//   (3) Asset paths migrated to projects/sdanacioglu/.
// =============================================================================

// =============================================================================
// 1. STUDY AREA
// =============================================================================
var STUDY_AREA_ASSET = 'projects/sdanacioglu/assets/blacksea_studyarea';

var studyAreaAsset = ee.FeatureCollection(STUDY_AREA_ASSET);
var studyAreasGeom = studyAreaAsset.geometry();

Map.centerObject(studyAreasGeom, 10);
Map.addLayer(studyAreasGeom, {color: 'cyan'}, '0. Study Area', true, 0.4);

print('=== STUDY AREA ===');
print('Asset:', STUDY_AREA_ASSET);
print('Total area (km²):', studyAreasGeom.area().divide(1e6));

// =============================================================================
// 2. CLOUD MASKING (QA60)
// =============================================================================
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1 << 10).eq(0)
              .and(qa.bitwiseAnd(1 << 11).eq(0));
  return image.updateMask(mask).copyProperties(image, image.propertyNames());
}

// =============================================================================
// 3. SUN GLINT CORRECTION (Hedley et al., 2005) — per-tile reference geometry
// =============================================================================
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

// =============================================================================
// 4. TILE ISOLATION — longitude-based split + per-half Hedley correction
// =============================================================================
var DATE_START = '2025-07-01';
var DATE_END   = '2025-09-15';
var CLOUD_PCT  = 20;
var BANDS      = ['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11', 'QA60'];

var TILE_SPLIT_LON = 28.30;
var OVERLAP_DEG    = 0.10;

// Overlap geometries for radiometric matching
var westGeom = ee.Geometry.Rectangle([27.7, 41.1, TILE_SPLIT_LON + OVERLAP_DEG, 42.2])
                 .intersection(studyAreasGeom, ee.ErrorMargin(10));
var eastGeom = ee.Geometry.Rectangle([TILE_SPLIT_LON - OVERLAP_DEG, 41.1, 29.0, 42.2])
                 .intersection(studyAreasGeom, ee.ErrorMargin(10));
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

var composite_west_raw = buildHalfComposite(westGeom, 'West');
var composite_east_raw = buildHalfComposite(eastGeom, 'East');

// =============================================================================
// 4b. LINEAR RADIOMETRIC NORMALIZATION (Schott et al., 1988; Yang & Lo, 2000)
// =============================================================================
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
    return targetImg.select(band)
      .subtract(tMean).divide(tStd).multiply(rStd).add(rMean).rename(band);
  });

  var matched = ee.ImageCollection(matchedBands).toBands().rename(bands);
  return ee.Image(matched.copyProperties(targetImg, targetImg.propertyNames()));
}

var composite_west_matched = matchMeanStd(
  composite_west_raw, composite_east_raw, BANDS_TO_MATCH, overlapGeom);

print('=== RADIOMETRIC MATCHING APPLIED ===');
print('Reference: East composite | Target: West composite');

var composite = ee.ImageCollection([
  composite_west_matched.clip(westGeom_final),
  composite_east_raw.clip(eastGeom_final)
]).mosaic().clip(studyAreasGeom);

print('Composite bands:', composite.bandNames());

// =============================================================================
// 5. WATER QUALITY MASKING
// =============================================================================
var turbidityIndex = composite.expression(
  '(RED / GREEN)', {
    'RED': composite.select('B4'),
    'GREEN': composite.select('B3')
  }).rename('Turbidity_Index');

var clearWaterMask = turbidityIndex.lt(1.5);
composite = composite.updateMask(clearWaterMask);

var mndwi = composite.normalizedDifference(['B3', 'B11']).rename('MNDWI');
var strictWaterMask = mndwi.gt(0);
composite = composite.updateMask(strictWaterMask);

var turbidity = turbidityIndex.updateMask(clearWaterMask).updateMask(strictWaterMask);

// =============================================================================
// 6. DERIVED FEATURES — 11 features
// =============================================================================
// NDAVI = (B8 − B2) / (B8 + B2)
var ndavi = composite.normalizedDifference(['B8', 'B2']).rename('NDAVI');

// SDB — log-ratio bathymetry (Stumpf et al., 2003)
var sdb = composite.expression(
  'log(1000 * BLUE) / log(1000 * GREEN)', {
    'BLUE': composite.select('B2'),
    'GREEN': composite.select('B3')
  }).rename('SDB');

// PCA on B1–B5
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

var covarArray = ee.Array(covar);
var eigenDecomp = covarArray.eigen();
var eigenVectors = eigenDecomp.slice(1, 1);

var principalComponents = ee.Image(eigenVectors)
  .matrixMultiply(centered.toArray().toArray(1));
var pcImage = principalComponents
  .arrayProject([0])
  .arrayFlatten([['PC1', 'PC2', 'PC3', 'PC4', 'PC5']]);

var pc1 = pcImage.select('PC1');
var pc2 = pcImage.select('PC2');

// =============================================================================
// 7. FEATURE STACK — 11 features
// =============================================================================
//  B1–B5, NDAVI, MNDWI, TI, SDB, TB1, TB2
var stackedFeatures = ee.Image.cat([
  composite.select(['B1', 'B2', 'B3', 'B4', 'B5']),
  ndavi, mndwi,
  turbidity.rename('Turbidity_Index'),
  sdb,
  pc1.rename('TB1'), pc2.rename('TB2')
]);

var FEATURE_BANDS = [
  'B1', 'B2', 'B3', 'B4', 'B5',
  'NDAVI', 'MNDWI',
  'Turbidity_Index', 'SDB',
  'TB1', 'TB2'
];

// =============================================================================
// 8. VISUALIZATION
// =============================================================================
Map.addLayer(composite,
  {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.15},
  '1. RGB Composite');
Map.addLayer(composite,
  {bands: ['B5', 'B3', 'B2'], min: 0, max: 0.15},
  '1b. False Color (B5-B3-B2)', false);
Map.addLayer(ndavi,
  {min: -0.3, max: 0.1, palette: ['brown', 'white', 'green']},
  '2. NDAVI', false);
Map.addLayer(sdb,
  {min: 0.8, max: 1.3, palette: ['navy', 'cyan', 'yellow']},
  '3. SDB', false);

// =============================================================================
// 9. QUALITY CHECK
// =============================================================================
var pixelCount = composite.select('B2').reduceRegion({
  reducer: ee.Reducer.count(), geometry: studyAreasGeom,
  scale: 100, maxPixels: 1e10, tileScale: 16
});
print('=== QUALITY CHECK ===');
print('Composite pixel count (B2):', pixelCount.get('B2'));
print('Feature list (11):', stackedFeatures.bandNames());

// =============================================================================
// 10. EXPORT PREPROCESSED FEATURES
// =============================================================================
Export.image.toDrive({
  image: stackedFeatures.toFloat(),
  description: 'GEE_DenizCayiri_v9_Features_11band_10M',
  folder: 'GEE_DenizCayiri_Proje',
  scale: 10, region: studyAreasGeom,
  crs: 'EPSG:32635', fileFormat: 'GeoTIFF', maxPixels: 1e13
});

// #############################################################################
// ###                     CLASSIFICATION WORKFLOW                           ###
// #############################################################################

// =============================================================================
// 11. TRAINING POLYGONS
// =============================================================================
var TRAINING_ASSET = 'projects/gen-lang-client-0552390047/assets/training_polys_v8';
var allTrainingPolys = ee.FeatureCollection(TRAINING_ASSET);

var seagrass_polys   = allTrainingPolys.filter(ee.Filter.eq('class_code', 1));
var sand_polys       = allTrainingPolys.filter(ee.Filter.eq('class_code', 2));
var deep_water_polys = allTrainingPolys.filter(ee.Filter.eq('class_code', 3));

print('=== TRAINING POLYGONS ===');
print('Total:', allTrainingPolys.size());
print('Seagrass  (1):', seagrass_polys.size());
print('Sand      (2):', sand_polys.size());
print('Deep water(3):', deep_water_polys.size());

// =============================================================================
// 12. NEGATIVE BUFFER — mixed pixel filter (Schütt et al., 2025)
// =============================================================================
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

print('Total polygons:', allPolygons.size());
Map.addLayer(seagrass_fc, {color: 'green'}, 'Poly: Seagrass', false);
Map.addLayer(sand_fc, {color: 'yellow'}, 'Poly: Sand', false);
Map.addLayer(deep_water_fc, {color: 'blue'}, 'Poly: Deep Water', false);

// =============================================================================
// 13. SPATIAL CROSS-VALIDATION — 3-fold latitudinal blocks (K/O/G)
// =============================================================================
var assetBounds = studyAreasGeom.bounds();
var boundsCoords = ee.List(assetBounds.coordinates().get(0));
var swCorner = ee.List(boundsCoords.get(0));
var neCorner = ee.List(boundsCoords.get(2));

var asset_minLat      = ee.Number(swCorner.get(1));
var asset_maxLat      = ee.Number(neCorner.get(1));
var asset_latRange    = asset_maxLat.subtract(asset_minLat);
var asset_blockHeight = asset_latRange.divide(3);

var block_G_bound = asset_minLat.add(asset_blockHeight);
var block_O_bound = asset_minLat.add(asset_blockHeight.multiply(2));

print('=== SPATIAL CV BLOCK BOUNDARIES ===');
print('Block G (South):', asset_minLat, '–', block_G_bound);
print('Block O (Mid):  ', block_G_bound, '–', block_O_bound);
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

// =============================================================================
// 14. FEATURE SAMPLING
// =============================================================================
var sampledFeatures = stackedFeatures.sampleRegions({
  collection: polygonsWithBlock,
  properties: ['class', 'class_sub', 'block'],
  scale: 10, geometries: false, tileScale: 16
});

print('=== SAMPLED PIXELS ===');
print('Total:', sampledFeatures.size());
print('SG (class=1):', sampledFeatures.filter(ee.Filter.eq('class', 1)).size());
print('NS (class=0):', sampledFeatures.filter(ee.Filter.eq('class', 0)).size());

// =============================================================================
// 14b. Z-SCORE NORMALIZATION + PER-BLOCK UNDERSAMPLING
// =============================================================================
var bandStats = stackedFeatures.reduceRegion({
  reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
  geometry: studyAreasGeom, scale: 100, maxPixels: 1e10,
  bestEffort: true, tileScale: 16
});

var normalizedBands = [];
FEATURE_BANDS.forEach(function(b) {
  var mean = ee.Number(bandStats.get(b + '_mean'));
  var std  = ee.Number(bandStats.get(b + '_stdDev'));
  normalizedBands.push(
    stackedFeatures.select(b).subtract(mean).divide(std).rename(b)
  );
});
var stackedFeatures_norm = ee.Image.cat(normalizedBands);

var sampledFeatures_norm = stackedFeatures_norm.sampleRegions({
  collection: polygonsWithBlock,
  properties: ['class', 'class_sub', 'block'],
  scale: 10, geometries: true, tileScale: 16
});

// Deterministic undersampling — coordinate-based key for reproducibility
function balanceBlock(blockName) {
  var blockData = sampledFeatures_norm.filter(ee.Filter.eq('block', blockName));
  var sg = blockData.filter(ee.Filter.eq('class', 1));
  var ns = blockData.filter(ee.Filter.eq('class', 0));
  var sgCount = sg.size();
  var nsKeyed = ns.map(function(f) {
    var coord = f.geometry().centroid(1).coordinates();
    var lon = ee.Number(coord.get(0));
    var lat = ee.Number(coord.get(1));
    var key = lon.multiply(1000000).add(lat.multiply(7919)).sin().abs();
    return f.set('rand', key);
  });
  var nsBalanced = nsKeyed.sort('rand').limit(sgCount);
  return sg.merge(nsBalanced);
}
var sampledBalanced = balanceBlock('G').merge(balanceBlock('O')).merge(balanceBlock('K'));

print('=== BALANCED SAMPLE ===');
print('Total:', sampledBalanced.size());
['G', 'O', 'K'].forEach(function(bn) {
  var bd = sampledBalanced.filter(ee.Filter.eq('block', bn));
  print('  Block ' + bn + ' — SG:', bd.filter(ee.Filter.eq('class', 1)).size(),
                         ' NS:', bd.filter(ee.Filter.eq('class', 0)).size());
});

sampledFeatures = sampledBalanced;

// =============================================================================
// 15. FOLD EVALUATION FUNCTION (shared by RF & SVM)
// =============================================================================
function evaluateFold(trainingSet, validationSet, classifierType, classifierParams) {
  var classifier;

  if (classifierType === 'RF') {
    classifier = ee.Classifier.smileRandomForest({
      numberOfTrees: classifierParams.numberOfTrees,
      variablesPerSplit: classifierParams.variablesPerSplit,
      seed: 42
    }).train({
      features: trainingSet, classProperty: 'class',
      inputProperties: FEATURE_BANDS
    });
  } else if (classifierType === 'SVM') {
    classifier = ee.Classifier.libsvm({
      kernelType: 'RBF',
      cost: classifierParams.cost,
      gamma: classifierParams.gamma
    }).train({
      features: trainingSet, classProperty: 'class',
      inputProperties: FEATURE_BANDS
    });
  }

  var validated = validationSet.classify(classifier);
  var confusionMatrix = validated.errorMatrix('class', 'classification');

  return {
    classifier:        classifier,
    confusionMatrix:   confusionMatrix,
    overallAccuracy:   confusionMatrix.accuracy(),
    kappa:             confusionMatrix.kappa(),
    producersAccuracy: confusionMatrix.producersAccuracy(),
    consumersAccuracy: confusionMatrix.consumersAccuracy()
  };
}

// =============================================================================
// 16. RANDOM FOREST (RF) — 3-fold spatial CV
// =============================================================================
var rfParams = {numberOfTrees: 100, variablesPerSplit: 3};

var rfFolds = ['G', 'O', 'K'].map(function(validationBlock) {
  var training   = sampledFeatures.filter(ee.Filter.neq('block', validationBlock));
  var validation = sampledFeatures.filter(ee.Filter.eq('block', validationBlock));
  return evaluateFold(training, validation, 'RF', rfParams);
});

print('=== RF 3-FOLD SPATIAL CV ===');
rfFolds.forEach(function(fold, i) {
  var fn = ['G', 'O', 'K'][i];
  print('Fold ' + fn + ' — OA:', fold.overallAccuracy, ' κ:', fold.kappa);
  print('  Confusion:', fold.confusionMatrix);
});

var rfOA_values    = ee.List(rfFolds.map(function(f) { return f.overallAccuracy; }));
var rfKappa_values = ee.List(rfFolds.map(function(f) { return f.kappa; }));
print('RF Mean OA:', rfOA_values.reduce(ee.Reducer.mean()));
print('RF Mean κ: ', rfKappa_values.reduce(ee.Reducer.mean()));

// Final RF (all data)
var rfClassifier_final = ee.Classifier.smileRandomForest({
  numberOfTrees: rfParams.numberOfTrees,
  variablesPerSplit: rfParams.variablesPerSplit,
  seed: 42
}).train({
  features: sampledFeatures, classProperty: 'class',
  inputProperties: FEATURE_BANDS
});

var rfImportance = ee.Dictionary(rfClassifier_final.explain().get('importance'));
print('=== RF VARIABLE IMPORTANCE ===');
print(rfImportance);

var rfClassified = stackedFeatures_norm.classify(rfClassifier_final).rename('RF_class');

// =============================================================================
// 17. SUPPORT VECTOR MACHINE (SVM) — grid search + 3-fold spatial CV
//     Grid: C ∈ {0.1,1,10,100,1000} × γ ∈ {0.0001,0.001,0.01,0.1,1} = 25
// =============================================================================
var SVM_C_GRID     = [0.1, 1, 10, 100, 1000];
var SVM_GAMMA_GRID = [0.0001, 0.001, 0.01, 0.1, 1];

var svmGridParams = [];
SVM_C_GRID.forEach(function(c) {
  SVM_GAMMA_GRID.forEach(function(g) {
    svmGridParams.push({cost: c, gamma: g});
  });
});

print('=== SVM GRID SEARCH (25 × 3 folds) ===');
var svmGridResults = svmGridParams.map(function(params) {
  var foldOAs = ['G', 'O', 'K'].map(function(validationBlock) {
    var training   = sampledFeatures.filter(ee.Filter.neq('block', validationBlock));
    var validation = sampledFeatures.filter(ee.Filter.eq('block', validationBlock));
    return evaluateFold(training, validation, 'SVM', params).overallAccuracy;
  });
  var meanOA = ee.List(foldOAs).reduce(ee.Reducer.mean());
  return {cost: params.cost, gamma: params.gamma, meanOA: meanOA};
});

svmGridResults.forEach(function(r) {
  print('C=' + r.cost + ' γ=' + r.gamma + ' → OA:', r.meanOA);
});

var meanOAList = ee.List(svmGridResults.map(function(r) { return r.meanOA; }));
var maxOA      = meanOAList.reduce(ee.Reducer.max());
var bestIdx    = meanOAList.indexOf(maxOA);
var nGamma     = SVM_GAMMA_GRID.length;
var bestC      = ee.List(SVM_C_GRID).get(ee.Number(bestIdx).divide(nGamma).floor());
var bestGamma  = ee.List(SVM_GAMMA_GRID).get(ee.Number(bestIdx).mod(nGamma));

print('=== BEST SVM PARAMETERS ===');
print('C*:', bestC, '| γ*:', bestGamma, '| OA:', maxOA);

var svmParams = {cost: bestC, gamma: bestGamma};

var svmFolds = ['G', 'O', 'K'].map(function(validationBlock) {
  var training   = sampledFeatures.filter(ee.Filter.neq('block', validationBlock));
  var validation = sampledFeatures.filter(ee.Filter.eq('block', validationBlock));
  return evaluateFold(training, validation, 'SVM', svmParams);
});

print('=== SVM 3-FOLD CV (best params) ===');
svmFolds.forEach(function(fold, i) {
  var fn = ['G', 'O', 'K'][i];
  print('Fold ' + fn + ' — OA:', fold.overallAccuracy, ' κ:', fold.kappa);
  print('  Confusion:', fold.confusionMatrix);
});

var svmOA_values    = ee.List(svmFolds.map(function(f) { return f.overallAccuracy; }));
var svmKappa_values = ee.List(svmFolds.map(function(f) { return f.kappa; }));
print('SVM Mean OA:', svmOA_values.reduce(ee.Reducer.mean()));
print('SVM Mean κ: ', svmKappa_values.reduce(ee.Reducer.mean()));

var svmClassifier_final = ee.Classifier.libsvm({
  kernelType: 'RBF', cost: svmParams.cost, gamma: svmParams.gamma
}).train({
  features: sampledFeatures, classProperty: 'class',
  inputProperties: FEATURE_BANDS
});
var svmClassified = stackedFeatures_norm.classify(svmClassifier_final).rename('SVM_class');

// =============================================================================
// 18. COMPARATIVE EVALUATION
// =============================================================================
print('=== COMPARATIVE PERFORMANCE ===');
print('RF  — OA:', rfOA_values.reduce(ee.Reducer.mean()),
            '  κ:', rfKappa_values.reduce(ee.Reducer.mean()));
print('SVM — OA:', svmOA_values.reduce(ee.Reducer.mean()),
            '  κ:', svmKappa_values.reduce(ee.Reducer.mean()));

// =============================================================================
// 19. POST-CLASSIFICATION FILTER — MMU = 5 px (Deeks et al., 2024)
// =============================================================================
function postClassificationFilter(classifiedImage) {
  var connected = classifiedImage.connectedPixelCount({
    maxSize: 100, eightConnected: false
  });
  return classifiedImage.updateMask(connected.gte(5));
}

var rfFiltered  = postClassificationFilter(rfClassified).rename('RF_class_filtered');
var svmFiltered = postClassificationFilter(svmClassified).rename('SVM_class_filtered');

var rfSeagrass  = rfFiltered.eq(1).selfMask().rename('RF_seagrass');
var svmSeagrass = svmFiltered.eq(1).selfMask().rename('SVM_seagrass');

// =============================================================================
// 19b. BIOPHYSICAL MASK — coastal distance only (≤ 3 km)
// -----------------------------------------------------------------------------
// JRC Global Surface Water → land mask → distance transform → 3 km buffer.
// ETOPO1/GEBCO depth mask removed in v9: SDB already provides indirect depth
// constraint; Secchi depth 2–5 m limits optical penetration in Case-2 waters.
// =============================================================================
var jrcWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
var permanentWater = jrcWater.gte(90).unmask(0);
var land = permanentWater.eq(0);
var distFromLand_m = land.fastDistanceTransform(50, 'pixels', 'squared_euclidean')
                          .sqrt().multiply(30);
var coastMask = distFromLand_m.lte(3000);

var bioMask = coastMask;

print('=== BIOPHYSICAL MASK ===');
print('Coastal distance ≤ 3 km (JRC)');

var rfSG_masked  = rfSeagrass.updateMask(bioMask).rename('RF_seagrass_masked');
var svmSG_masked = svmSeagrass.updateMask(bioMask).rename('SVM_seagrass_masked');

// =============================================================================
// 20. AREA CALCULATION
// =============================================================================
var pixelArea = ee.Image.pixelArea();

// Consensus — RF ∩ SVM (masked)
var consensusSeagrass = rfFiltered.eq(1)
  .and(svmFiltered.eq(1))
  .updateMask(bioMask)
  .selfMask()
  .rename('consensus_seagrass');

// Interactive preview (scale=100, approximate)
function calcAreaApprox(seagrassImage) {
  return seagrassImage.multiply(pixelArea).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: studyAreasGeom,
    scale: 100, maxPixels: 1e13, tileScale: 16, bestEffort: true
  });
}
print('=== AREA PREVIEW (approx, scale=100) ===');
print('RF  (masked):', calcAreaApprox(rfSG_masked));
print('SVM (masked):', calcAreaApprox(svmSG_masked));
print('Consensus:   ', calcAreaApprox(consensusSeagrass));

// Batch export — exact values at scale=10
function areaHa(img) {
  return ee.Number(img.multiply(pixelArea).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: studyAreasGeom,
    scale: 10, maxPixels: 1e13, tileScale: 16
  }).values().get(0)).divide(10000);
}

var areaTable = ee.FeatureCollection([
  ee.Feature(null, {product: 'RF_masked',        area_ha: areaHa(rfSG_masked)}),
  ee.Feature(null, {product: 'SVM_masked',       area_ha: areaHa(svmSG_masked)}),
  ee.Feature(null, {product: 'Consensus_masked', area_ha: areaHa(consensusSeagrass)}),
  ee.Feature(null, {product: 'RF_raw',           area_ha: areaHa(rfSeagrass)}),
  ee.Feature(null, {product: 'SVM_raw',          area_ha: areaHa(svmSeagrass)})
]);

Export.table.toDrive({
  collection: areaTable, description: 'Seagrass_Areas_v9',
  folder: 'GEE_DenizCayiri_Proje', fileFormat: 'CSV'
});

// =============================================================================
// 21. VISUALIZATION
// =============================================================================
Map.addLayer(rfSeagrass,
  {palette: ['darkgreen']}, 'RF (raw)', false);
Map.addLayer(svmSeagrass,
  {palette: ['orange']}, 'SVM (raw)', false);
Map.addLayer(rfSG_masked,
  {palette: ['darkgreen']}, 'RF (masked)', true);
Map.addLayer(svmSG_masked,
  {palette: ['orange']}, 'SVM (masked)', true);
Map.addLayer(consensusSeagrass,
  {palette: ['red']}, 'Consensus RF ∩ SVM (masked)', true);
Map.addLayer(coastMask.selfMask(),
  {palette: ['yellow']}, 'Mask: coast ≤ 3 km', false, 0.3);

// =============================================================================
// 22. EXPORT — ASSET + DRIVE
// =============================================================================
var OUTPUT_ASSET_PATH = 'projects/sdanacioglu/assets/denizcayiri';
var exportRegion = studyAreasGeom.bounds();

// Assets
Export.image.toAsset({
  image: rfSG_masked.unmask(0).toByte(),
  description: 'RF_Seagrass_v9_masked_Asset',
  assetId: OUTPUT_ASSET_PATH + '/RF_seagrass_masked_v9',
  scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
});
Export.image.toAsset({
  image: svmSG_masked.unmask(0).toByte(),
  description: 'SVM_Seagrass_v9_masked_Asset',
  assetId: OUTPUT_ASSET_PATH + '/SVM_seagrass_masked_v9',
  scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
});
Export.image.toAsset({
  image: consensusSeagrass.unmask(0).toByte(),
  description: 'Consensus_Seagrass_v9_masked_Asset',
  assetId: OUTPUT_ASSET_PATH + '/Consensus_seagrass_masked_v9',
  scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
});

// Drive — Cloud-Optimized GeoTIFF
Export.image.toDrive({
  image: consensusSeagrass.unmask(0).toByte(),
  description: 'Consensus_Seagrass_Kiyikoy_v9_MASKED',
  folder: 'GEE_DenizCayiri_Proje',
  scale: 10, region: exportRegion, crs: 'EPSG:32635',
  fileFormat: 'GeoTIFF', formatOptions: {cloudOptimized: true}, maxPixels: 1e13
});
Export.image.toDrive({
  image: svmSG_masked.unmask(0).toByte(),
  description: 'SVM_Seagrass_Kiyikoy_v9_MASKED',
  folder: 'GEE_DenizCayiri_Proje',
  scale: 10, region: exportRegion, crs: 'EPSG:32635',
  fileFormat: 'GeoTIFF', formatOptions: {cloudOptimized: true}, maxPixels: 1e13
});
Export.image.toDrive({
  image: rfSG_masked.unmask(0).toByte(),
  description: 'RF_Seagrass_Kiyikoy_v9_MASKED',
  folder: 'GEE_DenizCayiri_Proje',
  scale: 10, region: exportRegion, crs: 'EPSG:32635',
  fileFormat: 'GeoTIFF', formatOptions: {cloudOptimized: true}, maxPixels: 1e13
});
Export.image.toDrive({
  image: bioMask.toByte(),
  description: 'BioMask_Kiyikoy_v9',
  folder: 'GEE_DenizCayiri_Proje',
  scale: 30, region: studyAreasGeom, crs: 'EPSG:32635',
  fileFormat: 'GeoTIFF', maxPixels: 1e13
});
