// ==============================================================================
// BATI KARADENİZ (İĞNEADA-KIYIKÖY) KIYILARINDA DENİZ ÇAYIRI HARİTALAMA
// v8.0 - NDRE + WAVI + GBM KALDIRILDI; RF/SVM İKİLİ KARŞILAŞTIRMA
// ------------------------------------------------------------------------------
// v7'den v8'e temel değişiklikler:
//   (1) GBM (Gradient Boosting Machine) sınıflandırıcısı KALDIRILDI.
//       → Çalışma RF (RO) ve SVM (DVM) ikili karşılaştırmasına indirgendi.
//   (2) NDRE öznitelik setinden KALDIRILDI (ön analizde en düşük katkı; B5'in
//       Case-2 sularda sınırlı nüfuzu + NDAVI ile yüksek korelasyon).
//   (3) WAVI öznitelik setinden KALDIRILDI (NDAVI ile r≈1,00 fonksiyonel özdeşlik;
//       L=0,5 ayarlama terimi sığ deniz koşullarında pratik fark üretmiyor).
//       → 13 → 11 öznitelik. RF variablesPerSplit: √11 ≈ 3.
//   (4) Çoğunluk uzlaşması (3-model) yerine 2-model KESİŞİM (yüksek-güven)
//       haritası: yalnızca RF ve SVM birlikte deniz çayırı dediğinde işaretlenir.
//   (5) DII öznitelikleri v7'de zaten kaldırılmıştı (Yol B kararı — korunuyor).
//   * Tile izolasyonu (Hedley güneş parlaması, tile-bağımsız) v7'den korunuyor.
// ------------------------------------------------------------------------------
// Çalışma alanı sınırları (STUDY_AREA_ASSET'inden):
//   Kuzey: 41,996°K  (İğneada, Kırklareli)
//   Güney: 41,342°K  (Karaburun-Yeniköy, Arnavutköy/İstanbul)
//   Batı:  27,977°D
//   Doğu:  28,785°D
//   Toplam alan: 1.133,51 km² (kıyı uzunluğu ~130 km)
// ==============================================================================

// ==============================================================================
// 1. ÇALIŞMA ALANI ASSET'İNİ YÜKLEME
// ==============================================================================
var STUDY_AREA_ASSET = 'projects/YOUR_GEE_PROJECT/assets/STUDY_AREA_ASSET';

var studyAreaAsset = ee.FeatureCollection(STUDY_AREA_ASSET);
var studyAreasGeom = studyAreaAsset.geometry();

Map.centerObject(studyAreasGeom, 10);
Map.addLayer(studyAreasGeom, {color: 'cyan'}, '0. Çalışma Alanı (STUDY_AREA)', true, 0.4);

print('=== ÇALIŞMA ALANI ===');
print('Asset:', STUDY_AREA_ASSET);
print('Toplam alan (km²):', studyAreasGeom.area().divide(1e6));

// ==============================================================================
// 2. BULUT MASKELEME
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
// 3. GÜNEŞ PARLAMASI DÜZELTMESİ (Hedley vd., 2005) — refGeom PARAMETRELİ
// ------------------------------------------------------------------------------
// v7 DEĞİŞİKLİĞİ: refGeom artık tile'a özgü geometri alır.
// Her tile kendi NIR minimum ve regresyon eğimini kendi derin su piksellerinden
// hesaplar → tile sınırında oluşan atmosferik süreksizlik giderilir.
// ==============================================================================
function deglint(image, refGeom) {
  var tempMndwi = image.normalizedDifference(['B3', 'B11']).rename('tempMNDWI');
  var deepWater = tempMndwi.gt(0.5);

  var nirStats = image.select('B8').updateMask(deepWater).reduceRegion({
    reducer: ee.Reducer.percentile([5]).combine(ee.Reducer.count(), '', true),
    geometry: refGeom,
    scale: 300,
    maxPixels: 1e10,
    tileScale: 16
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
        geometry: refGeom,
        scale: 300,
        maxPixels: 1e10,
        tileScale: 16
      });
    var rawSlope = regression.get('scale');
    var slope = ee.Number(ee.Algorithms.If(rawSlope, rawSlope, 0));

    var correctedBand = image.select(band)
      .subtract(nir.subtract(nirMin).multiply(slope));

    return ee.Image(ee.Algorithms.If(
      hasDeepWater,
      correctedBand.rename(band),
      image.select(band)
    ));
  });

  var correctedImage = ee.Image(corrected)
    .addBands(image.select(['B8', 'B11']));

  return ee.Image(correctedImage.copyProperties(image, image.propertyNames())).toFloat();
}

// ==============================================================================
// 4. BOYLAM KESİMİ İLE TİLE İZOLASYONU — v7 TEMEL DEĞİŞİKLİĞİ
// ------------------------------------------------------------------------------
// MGRS_TILE filtresi yerine boylam sınırı kullanılır: bu yaklaşım tile ID'sini
// bilmeye gerek duymadan çalışır ve tile değişse de geçerliliğini korur.
//
// Her yarı için:
//   (a) Çalışma alanı boylam ortasından (≈28.30°D) kesilir
//   (b) Her görüntü kendi yarısına clip() ile sınırlandırılır
//   (c) Hedley düzeltmesi yalnızca o yarının derin su piksellerini kullanır
//   → Sağ/sol yarı kompozitleri mosaic() ile birleştirilir
//
// Tanılama: Gerçek tile isimlerini konsolda görmek için:
//   print('Tile listesi:', ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
//     .filterBounds(studyAreasGeom).filterDate('2025-07-01','2025-09-15')
//     .aggregate_array('MGRS_TILE').distinct());
// ==============================================================================

var DATE_START = '2025-07-01';
var DATE_END   = '2025-09-15';
var CLOUD_PCT  = 20;
var BANDS      = ['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11', 'QA60'];

// Gözlemlenen tile dikişi boylamı (kullanıcı doğrulamasına göre güncelle)
var TILE_SPLIT_LON = 28.30;
// Histogram matching için overlap (tile sınırı etrafında ±0.10° ≈ 11 km)
var OVERLAP_DEG    = 0.10;

// Histogram hesaplaması için OVERLAP (geniş) geometriler — composite üretiminde
var westGeom = ee.Geometry.Rectangle([27.7, 41.1, TILE_SPLIT_LON + OVERLAP_DEG, 42.2])
                 .intersection(studyAreasGeom, ee.ErrorMargin(10));
var eastGeom = ee.Geometry.Rectangle([TILE_SPLIT_LON - OVERLAP_DEG, 41.1, 29.0, 42.2])
                 .intersection(studyAreasGeom, ee.ErrorMargin(10));
// Histogram matching için ortak overlap zone (her iki tile da burada piksel üretir)
var overlapGeom = ee.Geometry.Rectangle([TILE_SPLIT_LON - OVERLAP_DEG, 41.1,
                                          TILE_SPLIT_LON + OVERLAP_DEG, 42.2])
                    .intersection(studyAreasGeom, ee.ErrorMargin(10));

// Final clip geometriler (kesişimsiz, mozaik sonrası)
var westGeom_final = ee.Geometry.Rectangle([27.7, 41.1, TILE_SPLIT_LON, 42.2])
                       .intersection(studyAreasGeom, ee.ErrorMargin(10));
var eastGeom_final = ee.Geometry.Rectangle([TILE_SPLIT_LON, 41.1, 29.0, 42.2])
                       .intersection(studyAreasGeom, ee.ErrorMargin(10));

function buildHalfComposite(halfGeom, halfLabel) {
  // Yarı koleksiyonu — Hedley için halfGeom referans
  // NOT: per-image clip() kaldırıldı → 155 görüntüye clip memory overflow.
  // Final clip yine yapılmaz çünkü histogram matching için overlap pikseli gerek.
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(halfGeom)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_PCT))
    .filterDate(DATE_START, DATE_END)
    .select(BANDS)
    .map(maskS2clouds);

  print(halfLabel + ' görüntü sayısı:', col.size());

  var deglinted = col.map(function(img) {
    return deglint(img, halfGeom);
  });

  return deglinted
    .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11'])
    .reduce(ee.Reducer.percentile([25]))
    .rename(['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11']);
  // Clip burada YOK — histogram matching sonrasında uygulanacak
}

var composite_west_raw = buildHalfComposite(westGeom, 'Batı (≤28.40°D)');
var composite_east_raw = buildHalfComposite(eastGeom, 'Doğu (≥28.20°D)');

// ==============================================================================
// 4b. LINEAR RADYOMETRIK NORMALIZASYON (Mean-Std Matching)  [YENİ]
// ------------------------------------------------------------------------------
// Schott vd. (1988) ile Yang & Lo (2000) çerçevesinde, batı tile kompozitinin
// spektral dağılımı doğu tile kompozitine (referans) lineer dönüşümle eşlenir.
//
// Formül (her bant için):
//   x_new = ((x_old - μ_target) / σ_target) × σ_ref + μ_ref
//
// İstatistikler OVERLAP zone'da hesaplanır (her iki tile da piksel üretir).
// CDF/histogram matching yerine mean-std seçildi: (1) memory dostu,
// (2) su yansıma dağılımları yarı-Gauss → lineer yeterli, (3) açık formül.
//
// Referans: Doğu (35TMG, 93 görüntü — daha güvenilir istatistik)
// Hedef: Batı (35TLG, 62 görüntü) → Doğu'nun radyometrik bandına çekilir
// ==============================================================================
var BANDS_TO_MATCH = ['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B11'];

function matchMeanStd(targetImg, refImg, bands, geom) {
  // Hedef (Batı) için overlap zone'da mean & stdDev
  var targetStats = targetImg.select(bands).reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
    geometry: geom,
    scale: 300,            // 300m: istatistiksel örneklem yeterli, memory korunur
    maxPixels: 1e10,
    tileScale: 16
  });

  // Referans (Doğu) için overlap zone'da mean & stdDev
  var refStats = refImg.select(bands).reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
    geometry: geom,
    scale: 300,
    maxPixels: 1e10,
    tileScale: 16
  });

  // Her bant için lineer dönüşüm uygula
  var matchedBands = bands.map(function(band) {
    var tMean = ee.Number(targetStats.get(band + '_mean'));
    var tStd  = ee.Number(targetStats.get(band + '_stdDev'));
    var rMean = ee.Number(refStats.get(band + '_mean'));
    var rStd  = ee.Number(refStats.get(band + '_stdDev'));

    return targetImg.select(band)
      .subtract(tMean)
      .divide(tStd)
      .multiply(rStd)
      .add(rMean)
      .rename(band);
  });

  // Bantları birleştir + tip cast (copyProperties Element döner, Image'a cast şart)
  var matched = ee.ImageCollection(matchedBands).toBands().rename(bands);
  return ee.Image(matched.copyProperties(targetImg, targetImg.propertyNames()));
}

var composite_west_matched = matchMeanStd(
  composite_west_raw,    // hedef (Batı, T35TLG)
  composite_east_raw,    // referans (Doğu, T35TMG)
  BANDS_TO_MATCH,
  overlapGeom            // istatistikler yalnızca overlap zone'da
);

print('=== LINEAR RADYOMETRIK MATCHING (Schott 1988; Yang & Lo 2000) UYGULANDI ===');
print('Referans: Doğu kompozit (35TMG, 93 görüntü)');
print('Hedef: Batı kompozit (35TLG, 62 görüntü) → matched');
print('Overlap zone: ±0.10° tile sınırı (~11 km), scale=300m');

// Final clip ve mosaic
var composite = ee.ImageCollection([
  composite_west_matched.clip(westGeom_final),
  composite_east_raw.clip(eastGeom_final)
]).mosaic().clip(studyAreasGeom);

print('=== BOYLAM KESİMİ + HISTOGRAM MATCHING KOMPOZİT (v7) ===');
print('Öznitelik bantları:', composite.bandNames());

// ==============================================================================
// 5. SU KALİTESİ KONTROLÜ VE MASKELEME
// ==============================================================================
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

// ==============================================================================
// 6. TÜRETİLMİŞ ÖZNİTELİKLER — 11 öznitelik (v8: NDRE + WAVI kaldırıldı)
// ==============================================================================

// --- 6a. Sucul Vejetasyon İndeksi ---
// NDAVI = (B8 − B2) / (B8 + B2)
// NOT (v8): WAVI çıkarıldı — NDAVI ile r≈1,00 fonksiyonel özdeşlik gösterdiği,
// L=0,5 ayarlama teriminin sığ deniz koşullarında pratik fark üretmediği için.
var ndavi = composite.normalizedDifference(['B8', 'B2']).rename('NDAVI');

// NOT (v8): NDRE [(B8 − B5)/(B8 + B5)] çıkarıldı — ön analizde 13 öznitelik
// arasında en düşük değişken önem skorunu vermiş; B5'in (704 nm) Case-2
// sularındaki sınırlı nüfuz derinliği ve NDAVI ile yüksek korelasyonu nedeniyle
// benzersiz bilgi katmanı sunmadığı belirlenmiştir.

// --- 6c. Uydu Türevli Batimetri ---
var sdb = composite.expression(
  'log(1000 * BLUE) / log(1000 * GREEN)', {
    'BLUE': composite.select('B2'),
    'GREEN': composite.select('B3')
  }).rename('SDB');

// --- 6d. Temel Bileşenler Analizi (TBA) — B1-B5 üzerinden ---
var pcaBands = ['B1', 'B2', 'B3', 'B4', 'B5'];
var pcaImage = composite.select(pcaBands);

var meanDict = pcaImage.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: studyAreasGeom,
  scale: 300,
  maxPixels: 1e10,
  tileScale: 16
});
var meansImage = ee.Image.constant(meanDict.values(pcaBands));
var centered = pcaImage.subtract(meansImage);

var covar = centered.toArray().reduceRegion({
  reducer: ee.Reducer.centeredCovariance(),
  geometry: studyAreasGeom,
  scale: 300,
  maxPixels: 1e10,
  tileScale: 16
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

// ==============================================================================
// 7. ÖZNİTELİKLERİN İSTİFLENMESİ — 11 öznitelik (v8)
// ------------------------------------------------------------------------------
//  Kategori             Öznitelik          Açıklama
//  Spektral bantlar     B1-B5              Sentinel-2 yüzey yansıması
//  Sucul vejetasyon     NDAVI              Sığ su vejetasyon indeksi
//  Su / maskeleme       MNDWI, TI          Su ve türbidite
//  Batimetri            SDB                Log-oran batimetri
//  TBA                  TB1, TB2           1. ve 2. temel bileşen
// ==============================================================================
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
// Toplam: 11 öznitelik (v8: NDRE + WAVI kaldırıldı; DII v7'de kaldırılmıştı)

// ==============================================================================
// 8. ÖN İŞLEME GÖRSELLEŞTİRMESİ
// ==============================================================================
Map.addLayer(composite,
  {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.15},
  '1. RGB Kompozit (Yaz, tile-izolasyonlu)');

Map.addLayer(composite,
  {bands: ['B5', 'B3', 'B2'], min: 0, max: 0.15},
  '1b. Yanlış Renk (B5-B3-B2)', false);

Map.addLayer(ndavi,
  {min: -0.3, max: 0.1, palette: ['brown', 'white', 'green']},
  '2. NDAVI', false);

Map.addLayer(sdb,
  {min: 0.8, max: 1.3, palette: ['navy', 'cyan', 'yellow']},
  '4. SDB', false);

// ==============================================================================
// 9. KALİTE KONTROL
// ==============================================================================
var pixelCount = composite.select('B2').reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: studyAreasGeom,
  scale: 100,
  maxPixels: 1e10,
  tileScale: 16
});
print('=== KALİTE KONTROL ===');
print('Kompozit piksel sayısı (B2):', pixelCount.get('B2'));
print('Öznitelik listesi (11):', stackedFeatures.bandNames());

// ==============================================================================
// 10. ÖN İŞLENMİŞ ÖZNİTELİKLERİ DRIVE'A EXPORT
// ==============================================================================
Export.image.toDrive({
  image: stackedFeatures.toFloat(),
  description: 'GEE_DenizCayiri_v8_Features_11band_10M',
  folder: 'YOUR_DRIVE_FOLDER',
  scale: 10,
  region: studyAreasGeom,
  crs: 'EPSG:32635',
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13
});

// ##############################################################################
// ###                  SINIFLANDIRMA İŞ AKIŞI                                ###
// ##############################################################################

// ==============================================================================
// 11. EĞİTİM POLİGONLARI — training_polys_v4 (son poligon seti)
// ==============================================================================
var TRAINING_ASSET = 'projects/YOUR_GEE_PROJECT/assets/TRAINING_POLYGONS_ASSET';
var allTrainingPolys = ee.FeatureCollection(TRAINING_ASSET);

var seagrass_polys   = allTrainingPolys.filter(ee.Filter.eq('class_code', 1));
var sand_polys       = allTrainingPolys.filter(ee.Filter.eq('class_code', 2));
var deep_water_polys = allTrainingPolys.filter(ee.Filter.eq('class_code', 3));

print('=== EĞİTİM POLİGONLARI (v4 asset) ===');
print('Toplam kayıt:', allTrainingPolys.size());
print('Seagrass    (class_code=1):', seagrass_polys.size());
print('Sand        (class_code=2):', sand_polys.size());
print('Deepwater   (class_code=3):', deep_water_polys.size());

// ==============================================================================
// 12. NEGATİF TAMPON (Schütt vd., 2025 — karma piksel filtresi)
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

print('=== POLİGON İSTATİSTİKLERİ ===');
print('Toplam poligon:', allPolygons.size());
Map.addLayer(seagrass_fc, {color: 'green'}, 'Poligon: Deniz Çayırı', false);
Map.addLayer(sand_fc, {color: 'yellow'}, 'Poligon: Kum', false);
Map.addLayer(deep_water_fc, {color: 'blue'}, 'Poligon: Derin Su', false);

// ==============================================================================
// 13. MEKÂNSAL ÇAPRAZ DOĞRULAMA — OTOMATİK BLOK HESAPLAMA (K/O/G)
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

print('=== MEKÂNSAL CV BLOK SINIRLARI ===');
// Yerleşim adları (enleme göre kuzeyden güneye):
//   Beğendik 41.96°K | İğneada 41.88°K | Kıyıköy 41.64°K | Yalıköy 41.48°K | Karaburun 41.35°K
print('Blok G (Güney — Yalıköy/Karaburun):', asset_minLat, '–', block_G_bound);
print('Blok O (Orta — Kıyıköy):           ', block_G_bound, '–', block_O_bound);
print('Blok K (Kuzey — Beğendik/İğneada): ', block_O_bound, '–', asset_maxLat);

var polygonsWithBlock = allPolygons.map(function(f) {
  var centroid_lat = ee.Number(f.geometry().centroid().coordinates().get(1));
  var block = ee.Algorithms.If(
    centroid_lat.lt(block_G_bound), 'G',
    ee.Algorithms.If(centroid_lat.lt(block_O_bound), 'O', 'K')
  );
  return f.set('block', block);
});

print('=== BLOKLARA GÖRE DAĞILIM ===');
['G', 'O', 'K'].forEach(function(bn) {
  var bp = polygonsWithBlock.filter(ee.Filter.eq('block', bn));
  print('Blok ' + bn + ' — toplam:', bp.size(),
        ' SG:', bp.filter(ee.Filter.eq('class', 1)).size(),
        ' NS:', bp.filter(ee.Filter.eq('class', 0)).size());
});

// ==============================================================================
// 14. ÖZNİTELİK DEĞERLERİNİN ÖRNEKLENMESİ
// ==============================================================================
var sampledFeatures = stackedFeatures.sampleRegions({
  collection: polygonsWithBlock,
  properties: ['class', 'class_sub', 'block'],
  scale: 10,
  geometries: false,
  tileScale: 16
});

print('=== ÖRNEKLENMİŞ PİKSELLER (HAM) ===');
print('Toplam:', sampledFeatures.size());
print('SG (class=1):', sampledFeatures.filter(ee.Filter.eq('class', 1)).size());
print('NS (class=0):', sampledFeatures.filter(ee.Filter.eq('class', 0)).size());

// ==============================================================================
// 14b. Z-SCORE NORMALİZASYON + PER-BLOCK UNDERSAMPLING
// ==============================================================================
var bandStats = stackedFeatures.reduceRegion({
  reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true),
  geometry: studyAreasGeom,
  scale: 100,
  maxPixels: 1e10,
  bestEffort: true,
  tileScale: 16
});
print('=== BANT İSTATİSTİKLERİ (z-score temeli) ===');
print(bandStats);

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
  scale: 10,
  geometries: true,   // v8 REPRO DÜZELTMESİ: deterministik anahtar için piksel koordinatı gerekli
  tileScale: 16
});

function balanceBlock(blockName) {
  var blockData = sampledFeatures_norm.filter(ee.Filter.eq('block', blockName));
  var sg = blockData.filter(ee.Filter.eq('class', 1));
  var ns = blockData.filter(ee.Filter.eq('class', 0));
  var sgCount = sg.size();
  // ----------------------------------------------------------------------------
  // REPRODÜKLENEBİLİRLİK DÜZELTMESİ (v8):
  // randomColumn('rand',42) geometri yokken kararsız system:index'i hash'lediği
  // için her evaluate farklı dengeli alt-örneklem materialize ediyordu; bu da
  // fold κ'ları ile ortalamanın birbirini tutmamasına yol açıyordu (seed sabit
  // olsa bile). Çözüm: her pikselin SABİT koordinatından deterministik sıralama
  // anahtarı türetmek. Böylece alt-örneklem değerlendirmeler arası bire bir aynı
  // olur ve fold sonuçları ile ortalama tam uyuşur.
  // ----------------------------------------------------------------------------
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

print('=== DENGELİ ÖRNEKLEM (z-score + per-block undersampling) ===');
print('Toplam piksel:', sampledBalanced.size());
print('SG:', sampledBalanced.filter(ee.Filter.eq('class', 1)).size());
print('NS:', sampledBalanced.filter(ee.Filter.eq('class', 0)).size());
['G', 'O', 'K'].forEach(function(bn) {
  var bd = sampledBalanced.filter(ee.Filter.eq('block', bn));
  print('  Blok ' + bn + ' — SG:', bd.filter(ee.Filter.eq('class', 1)).size(),
                         ' NS:', bd.filter(ee.Filter.eq('class', 0)).size());
});

sampledFeatures = sampledBalanced;

// ==============================================================================
// 15. FOLD DEĞERLENDİRME FONKSİYONU (RF / SVM ortak kullanır)
// ==============================================================================
function evaluateFold(trainingSet, validationSet, classifierType, classifierParams) {
  var classifier;

  if (classifierType === 'RF') {
    classifier = ee.Classifier.smileRandomForest({
      numberOfTrees: classifierParams.numberOfTrees,
      variablesPerSplit: classifierParams.variablesPerSplit,
      seed: 42
    }).train({
      features: trainingSet,
      classProperty: 'class',
      inputProperties: FEATURE_BANDS
    });
  } else if (classifierType === 'SVM') {
    classifier = ee.Classifier.libsvm({
      kernelType: 'RBF',
      cost: classifierParams.cost,
      gamma: classifierParams.gamma
    }).train({
      features: trainingSet,
      classProperty: 'class',
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

// ==============================================================================
// 16. RASTGELE ORMAN (RO) — 3-KATLI MEKÂNSAL CV
// ------------------------------------------------------------------------------
// numberOfTrees: 100 | variablesPerSplit: 3 (√11 ≈ 3)
// ==============================================================================
var rfParams = {numberOfTrees: 100, variablesPerSplit: 3};

var rfFolds = ['G', 'O', 'K'].map(function(validationBlock) {
  var training   = sampledFeatures.filter(ee.Filter.neq('block', validationBlock));
  var validation = sampledFeatures.filter(ee.Filter.eq('block', validationBlock));
  return evaluateFold(training, validation, 'RF', rfParams);
});

print('=== RF 3-KATLI MEKÂNSAL CV SONUÇLARI ===');
rfFolds.forEach(function(fold, i) {
  var foldName = ['G', 'O', 'K'][i];
  print('--- Fold ' + foldName + ' ---');
  print('Hata Matrisi:', fold.confusionMatrix);
  print('Genel Doğruluk:', fold.overallAccuracy);
  print('Kappa:', fold.kappa);
  print('Üretici Doğruluğu:', fold.producersAccuracy);
  print('Kullanıcı Doğruluğu:', fold.consumersAccuracy);
});

var rfOA_values    = ee.List(rfFolds.map(function(f) { return f.overallAccuracy; }));
var rfKappa_values = ee.List(rfFolds.map(function(f) { return f.kappa; }));
print('RF Ort. Genel Doğruluk:', rfOA_values.reduce(ee.Reducer.mean()));
print('RF Ort. Kappa:',          rfKappa_values.reduce(ee.Reducer.mean()));

// Nihai RF (tüm veri)
var rfClassifier_final = ee.Classifier.smileRandomForest({
  numberOfTrees: rfParams.numberOfTrees,
  variablesPerSplit: rfParams.variablesPerSplit,
  seed: 42
}).train({
  features: sampledFeatures,
  classProperty: 'class',
  inputProperties: FEATURE_BANDS
});

var rfImportance = ee.Dictionary(rfClassifier_final.explain().get('importance'));
print('=== RF DEĞİŞKEN ÖNEM ANALİZİ (11 öznitelik) ===');
print(rfImportance);

var rfClassified = stackedFeatures_norm.classify(rfClassifier_final).rename('RF_class');

// ==============================================================================
// 17. DESTEK VEKTÖR MAKİNELERİ (DVM) — GRID SEARCH + 3-KATLI MEKÂNSAL CV
// ------------------------------------------------------------------------------
// Grid: C ∈ {0.1,1,10,100,1000} × γ ∈ {0.0001,0.001,0.01,0.1,1} = 25 kombinasyon
// ==============================================================================
var SVM_C_GRID     = [0.1, 1, 10, 100, 1000];
var SVM_GAMMA_GRID = [0.0001, 0.001, 0.01, 0.1, 1];

var svmGridParams = [];
SVM_C_GRID.forEach(function(c) {
  SVM_GAMMA_GRID.forEach(function(g) {
    svmGridParams.push({cost: c, gamma: g});
  });
});
print('=== SVM GRID SEARCH (25 kombinasyon × 3 fold) ===');

var svmGridResults = svmGridParams.map(function(params) {
  var foldOAs = ['G', 'O', 'K'].map(function(validationBlock) {
    var training   = sampledFeatures.filter(ee.Filter.neq('block', validationBlock));
    var validation = sampledFeatures.filter(ee.Filter.eq('block', validationBlock));
    return evaluateFold(training, validation, 'SVM', params).overallAccuracy;
  });
  var meanOA = ee.List(foldOAs).reduce(ee.Reducer.mean());
  return { cost: params.cost, gamma: params.gamma, foldOAs: foldOAs, meanOA: meanOA };
});

print('=== SVM GRID SONUÇLARI (C, γ, ort. OA) ===');
svmGridResults.forEach(function(r) {
  print('C=' + r.cost + ' | γ=' + r.gamma + ' → ort. OA:', r.meanOA);
});

var meanOAList  = ee.List(svmGridResults.map(function(r) { return r.meanOA; }));
var maxOA       = meanOAList.reduce(ee.Reducer.max());
var bestIdx     = meanOAList.indexOf(maxOA);
var nGamma      = SVM_GAMMA_GRID.length;
var bestC       = ee.List(SVM_C_GRID).get(ee.Number(bestIdx).divide(nGamma).floor());
var bestGamma   = ee.List(SVM_GAMMA_GRID).get(ee.Number(bestIdx).mod(nGamma));

print('=== EN İYİ SVM PARAMETRELERİ ===');
print('C*:', bestC, '| γ*:', bestGamma, '| Ort. OA:', maxOA);

var svmParams = {cost: bestC, gamma: bestGamma};

var svmFolds = ['G', 'O', 'K'].map(function(validationBlock) {
  var training   = sampledFeatures.filter(ee.Filter.neq('block', validationBlock));
  var validation = sampledFeatures.filter(ee.Filter.eq('block', validationBlock));
  return evaluateFold(training, validation, 'SVM', svmParams);
});

print('=== SVM 3-KATLI CV SONUÇLARI (en iyi parametre) ===');
svmFolds.forEach(function(fold, i) {
  var foldName = ['G', 'O', 'K'][i];
  print('--- Fold ' + foldName + ' ---');
  print('Hata Matrisi:', fold.confusionMatrix);
  print('Genel Doğruluk:', fold.overallAccuracy);
  print('Kappa:', fold.kappa);
  print('Üretici Doğruluğu:', fold.producersAccuracy);
  print('Kullanıcı Doğruluğu:', fold.consumersAccuracy);
});

var svmOA_values    = ee.List(svmFolds.map(function(f) { return f.overallAccuracy; }));
var svmKappa_values = ee.List(svmFolds.map(function(f) { return f.kappa; }));
print('SVM Ort. Genel Doğruluk:', svmOA_values.reduce(ee.Reducer.mean()));
print('SVM Ort. Kappa:',          svmKappa_values.reduce(ee.Reducer.mean()));

var svmClassifier_final = ee.Classifier.libsvm({
  kernelType: 'RBF',
  cost: svmParams.cost,
  gamma: svmParams.gamma
}).train({
  features: sampledFeatures,
  classProperty: 'class',
  inputProperties: FEATURE_BANDS
});
var svmClassified = stackedFeatures_norm.classify(svmClassifier_final).rename('SVM_class');

// ==============================================================================
// 18. KARŞILAŞTIRMALI DEĞERLENDİRME (RF / SVM)
// ==============================================================================
print('\n================================================================');
print('=== KARŞILAŞTIRMALI PERFORMANS — 3-Katlı Mekânsal CV Ortalaması ===');
print('================================================================');
print('RF  — Ort. GD:', rfOA_values.reduce(ee.Reducer.mean()),
              '| Ort. κ:', rfKappa_values.reduce(ee.Reducer.mean()));
print('SVM — Ort. GD:', svmOA_values.reduce(ee.Reducer.mean()),
              '| Ort. κ:', svmKappa_values.reduce(ee.Reducer.mean()));

// ==============================================================================
// 19. SINIFLANDIRMA SONRASI FİLTRELEME (MHB = 4 piksel, Deeks vd., 2024)
// ==============================================================================
function postClassificationFilter(classifiedImage) {
  var connected = classifiedImage.connectedPixelCount({
    maxSize: 100,
    eightConnected: false
  });
  return classifiedImage.updateMask(connected.gte(5));
}

var rfFiltered  = postClassificationFilter(rfClassified).rename('RF_class_filtered');
var svmFiltered = postClassificationFilter(svmClassified).rename('SVM_class_filtered');

var rfSeagrass  = rfFiltered.eq(1).selfMask().rename('RF_seagrass');
var svmSeagrass = svmFiltered.eq(1).selfMask().rename('SVM_seagrass');

// ==============================================================================
// 19b. BİYOFİZİKSEL MASKE (DERİNLİK + KIYI MESAFESİ)
// ------------------------------------------------------------------------------
// Sığ deniz çayırı biyolojik olarak yalnızca dar bir kuşakta yetişir:
//   - Z. marina:  0-10 m derinlik
//   - Z. noltei:  intertidal - 3 m
//   - Sentinel-2 etkin sığ su sinyali: 0-12 m (Case-2 koşulları)
// Bu fiziksel sınırlar dışında "deniz çayırı" sınıflandırması üretilmesi
// spektral karışıklık veya tile dikişi artefaktıdır → maskelenmelidir.
//
// İki katmanlı maske (Traganos & Reinartz 2018; Roelfsema vd. 2018 standardı):
//   (a) GEBCO batimetri: derinlik ≤ 15 m
//   (b) Kıyıdan mesafe ≤ 3 km (JRC Surface Water'dan kara maskesi)
// ==============================================================================

// --- (a) GEBCO/ETOPO batimetri maskesi (≤ 15 m) ---
// ETOPO1 ~1.8 km çözünürlük — kıyı için kaba ama maske amaçlı yeterli
// Alternatif: GEBCO 2023 sat-io community asset (varsa daha iyi)
var bathymetry = ee.Image('NOAA/NGDC/ETOPO1').select('bedrock');
// Negatif değerler deniz derinliği → pozitif metreye çevir
var depth = bathymetry.multiply(-1).rename('depth_m');
// 0-15 m bandı: deniz çayırı için biyofiziksel olarak uygun
var depthMask = depth.lte(15).and(depth.gte(0));

// --- (b) Kıyı mesafesi maskesi (≤ 3 km) ---
// JRC Global Surface Water'dan kalıcı su tespit edilir, ters çevrilerek kara
// elde edilir. fastDistanceTransform ile her piksele en yakın karaya mesafe
// hesaplanır.
var jrcWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
var permanentWater = jrcWater.gte(90).unmask(0);
var land = permanentWater.eq(0);
// fastDistanceTransform: piksel cinsinden kare mesafe — sqrt + ölçek çevirimi
var distFromLand_m = land.fastDistanceTransform(50, 'pixels', 'squared_euclidean')
                          .sqrt()
                          .multiply(30);  // JRC ~30m piksel
var coastMask = distFromLand_m.lte(3000);  // 3 km

// --- Birleşik biyofiziksel maske ---
var bioMask = depthMask.and(coastMask);

print('=== BİYOFİZİKSEL MASKE UYGULANDI ===');
print('Maskeler: GEBCO derinlik ≤15m + kıyıdan ≤3km');

// Maskelenmiş sınıflandırma sonuçları
var rfSG_masked  = rfSeagrass.updateMask(bioMask).rename('RF_seagrass_masked');
var svmSG_masked = svmSeagrass.updateMask(bioMask).rename('SVM_seagrass_masked');

// ==============================================================================
// 20. ALAN HESAPLAMA
// ------------------------------------------------------------------------------
// TIMEOUT DÜZELTMESİ (v8): İnteraktif reduceRegion, 10 m sınıflandırma
// görüntüsünü tüm ROI (~1.133 km²) üzerinde değerlendirdiğinden 5 dk
// interaktif limitini aşıp "Computation timed out" veriyordu. Çözüm: alan
// hesapları (i) interaktifte yalnızca KABA bir ön-izleme için scale=100 +
// bestEffort ile yaklaşık raporlanır; (ii) NİHAİ doğru değerler ise süre
// limiti olmayan bir BATCH görevine (Export.table.toDrive) gönderilir.
// Makaledeki [ALAN_*] değerleri (ii)'deki CSV'den alınmalıdır.
// ==============================================================================
var pixelArea = ee.Image.pixelArea();

// Kesişim (yüksek-güven) — RF ve SVM birlikte deniz çayırı dediğinde — MASKELENMİŞ
var consensusSeagrass = rfFiltered.eq(1)
  .and(svmFiltered.eq(1))
  .updateMask(bioMask)
  .selfMask()
  .rename('consensus_seagrass');

// --- (i) İnteraktif KABA ön-izleme (scale=100, yaklaşık) ---
function calcAreaApprox(seagrassImage) {
  return seagrassImage.multiply(pixelArea).reduceRegion({
    reducer:    ee.Reducer.sum(),
    geometry:   studyAreasGeom,
    scale:      100,               // kaba ön-izleme; nihai değer Export CSV'den
    maxPixels:  1e13,
    tileScale:  16,
    bestEffort: true
  });
}
print('=== DENİZ ÇAYIRI ALAN (KABA ÖN-İZLEME, scale=100, m²) ===');
print('Not: NİHAİ değerler "Seagrass_Areas_v8" CSV görevinden (scale=10) alınmalıdır.');
print('RF  (maskeli ~):',  calcAreaApprox(rfSG_masked));
print('SVM (maskeli ~):',  calcAreaApprox(svmSG_masked));
print('Kesişim (~):',      calcAreaApprox(consensusSeagrass));

// --- (ii) NİHAİ alan değerleri — BATCH görevi (süre limiti yok, scale=10) ---
function areaHa(img) {
  return ee.Number(img.multiply(pixelArea).reduceRegion({
    reducer:    ee.Reducer.sum(),
    geometry:   studyAreasGeom,
    scale:      10,
    maxPixels:  1e13,
    tileScale:  16
  }).values().get(0)).divide(10000);   // m² → hektar
}

var areaTable = ee.FeatureCollection([
  ee.Feature(null, {urun: 'RF_maskeli',        alan_ha: areaHa(rfSG_masked)}),
  ee.Feature(null, {urun: 'SVM_maskeli',       alan_ha: areaHa(svmSG_masked)}),
  ee.Feature(null, {urun: 'Kesisim_maskeli',   alan_ha: areaHa(consensusSeagrass)}),
  ee.Feature(null, {urun: 'RF_ham',            alan_ha: areaHa(rfSeagrass)}),
  ee.Feature(null, {urun: 'SVM_ham',           alan_ha: areaHa(svmSeagrass)})
]);

Export.table.toDrive({
  collection:  areaTable,
  description: 'Seagrass_Areas_v8',
  folder:      'YOUR_DRIVE_FOLDER',
  fileFormat:  'CSV'
});

// ==============================================================================
// 21. GÖRSELLEŞTİRME
// ==============================================================================
// Ham (maskelenmemiş) — referans karşılaştırma
Map.addLayer(rfSeagrass,
  {palette: ['darkgreen']}, 'RF SG (ham, maskesiz)', false);
Map.addLayer(svmSeagrass,
  {palette: ['orange']}, 'SVM SG (ham, maskesiz)', false);

// Maskelenmiş (gerçek seagrass alanı)
Map.addLayer(rfSG_masked,
  {palette: ['darkgreen']}, 'RF SG (maskelenmiş)', true);
Map.addLayer(svmSG_masked,
  {palette: ['orange']}, 'SVM SG (maskelenmiş)', true);
Map.addLayer(consensusSeagrass,
  {palette: ['red']}, 'Kesişim RF ∩ SVM (yüksek-güven, maskelenmiş)', true);

// Maske katmanları (görsel doğrulama için)
Map.addLayer(depthMask.selfMask(),
  {palette: ['cyan']}, 'Maske: derinlik ≤ 15 m (GEBCO)', false, 0.3);
Map.addLayer(coastMask.selfMask(),
  {palette: ['yellow']}, 'Maske: kıyıdan ≤ 3 km', false, 0.3);
Map.addLayer(bioMask.selfMask(),
  {palette: ['lime']}, 'Maske: BİRLEŞİK (derinlik + kıyı)', false, 0.4);

// ==============================================================================
// 22. EXPORT — ASSET + DRIVE
// ==============================================================================
var OUTPUT_ASSET_PATH = 'projects/YOUR_GEE_PROJECT/assets/OUTPUT_FOLDER';

// Asset export — MASKELENMİŞ versiyonları kaydet (ana ürün)
Export.image.toAsset({
  image: rfSG_masked.unmask(0).toByte(),
  description: 'RF_Seagrass_v8_masked_Asset',
  assetId: OUTPUT_ASSET_PATH + '/RF_seagrass_masked_v8',
  scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
});
Export.image.toAsset({
  image: svmSG_masked.unmask(0).toByte(),
  description: 'SVM_Seagrass_v8_masked_Asset',
  assetId: OUTPUT_ASSET_PATH + '/SVM_seagrass_masked_v8',
  scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
});
Export.image.toAsset({
  image: consensusSeagrass.unmask(0).toByte(),
  description: 'Consensus_Seagrass_v8_masked_Asset',
  assetId: OUTPUT_ASSET_PATH + '/Consensus_seagrass_masked_v8',
  scale: 10, region: studyAreasGeom, crs: 'EPSG:32635', maxPixels: 1e13
});

// Drive export — MASKELENMİŞ sınıflandırıcı çıktıları + kesişim
// NOT (v8): ArcGIS'e güvenli aktarım için region = dikdörtgen sınırlayıcı kutu
// (karmaşık kıyı poligonu yerine) ve Cloud-Optimized GeoTIFF kullanılır.
// İNDİRME UYARISI: Bu görevler BATCH'tir; konsoldaki print'ler bitse bile
// dosya HAZIR DEĞİLDİR. Tasks sekmesinden her görevi "RUN" edip YEŞİL (tamam)
// olmasını bekleyin, ardından Drive'dan indirin. Tek-bant 0/1 maskeli GeoTIFF
// LZW/COG ile yüksek sıkışır; ~birkaç yüz KB NORMAL ve geçerli bir dosyadır.
var exportRegion = studyAreasGeom.bounds();
Export.image.toDrive({
  image: consensusSeagrass.unmask(0).toByte(),
  description: 'Consensus_Seagrass_Kiyikoy_v8_MASKED',
  folder: 'YOUR_DRIVE_FOLDER',
  scale: 10, region: exportRegion,
  crs: 'EPSG:32635', fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}, maxPixels: 1e13
});
Export.image.toDrive({
  image: svmSG_masked.unmask(0).toByte(),
  description: 'SVM_Seagrass_Kiyikoy_v8_MASKED',
  folder: 'YOUR_DRIVE_FOLDER',
  scale: 10, region: exportRegion,
  crs: 'EPSG:32635', fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}, maxPixels: 1e13
});
Export.image.toDrive({
  image: rfSG_masked.unmask(0).toByte(),
  description: 'RF_Seagrass_Kiyikoy_v8_MASKED',
  folder: 'YOUR_DRIVE_FOLDER',
  scale: 10, region: exportRegion,
  crs: 'EPSG:32635', fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}, maxPixels: 1e13
});
// Birleşik maske (görselleştirme + Tartışma için)
Export.image.toDrive({
  image: bioMask.toByte(),
  description: 'BioMask_Kiyikoy_v8',
  folder: 'YOUR_DRIVE_FOLDER',
  scale: 30, region: studyAreasGeom,
  crs: 'EPSG:32635', fileFormat: 'GeoTIFF', maxPixels: 1e13
});
