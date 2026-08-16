// =============================================================================
// SEAGRASS MAPPING — WESTERN BLACK SEA COAST (TÜRKİYE)
// Danacıoğlu, 2026 — İzmir Bakırçay University
// Assisted by Claude Opus 4.6 (Anthropic)
// =============================================================================

// ── Assets ──────────────────────────────────────────────────────────────────
var rf  = ee.Image('projects/sdanacioglu/assets/RF_Seagrass_Masked');
var svm = ee.Image('projects/sdanacioglu/assets/SVM_Seagrass_Masked');
var con = ee.Image('projects/sdanacioglu/assets/RF_SVM_Consensus_Seagrass_Masked');
var studyArea = ee.FeatureCollection(
  'projects/sdanacioglu/assets/blacksea_studyarea');
var bounds = studyArea.geometry();

// ── Sentinel-2 ──────────────────────────────────────────────────────────────
var s2col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(bounds)
  .filterDate('2025-04-01', '2025-10-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

var s2rgb = s2col.filterDate('2025-07-01', '2025-09-15')
  .median().clip(bounds);

var s2idx = s2col.map(function(img) {
  return img.normalizedDifference(['B8', 'B2']).rename('NDAVI')
    .addBands(img.normalizedDifference(['B3', 'B11']).rename('MNDWI'))
    .copyProperties(img, ['system:time_start']);
});

// ── Style constants ─────────────────────────────────────────────────────────
var FONT = 'Helvetica, Arial, sans-serif';
var BG   = '#ffffff';
var CARD = '#f7fafc';
var CLR  = {
  title: '#1a1a2e', sub: '#4a5568', body: '#2d3748', muted: '#718096',
  accent: '#0077b6', divider: '#e2e8f0', link: '#0077b6',
  seagrass: '#16a34a'
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function divider() {
  return ui.Panel({style: {
    height: '1px', backgroundColor: CLR.divider,
    margin: '14px 0', stretch: 'horizontal'
  }});
}

function heading(text) {
  return ui.Label({value: text, style: {
    fontSize: '13px', fontWeight: 'bold', fontFamily: FONT,
    color: CLR.title, backgroundColor: BG, margin: '0 0 6px 0'
  }});
}

function hint(text) {
  return ui.Label({value: text, style: {
    fontSize: '10px', fontFamily: FONT, color: CLR.muted,
    backgroundColor: BG, margin: '0 0 2px 0'
  }});
}

function legendRow(color, label) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '1px 0', backgroundColor: BG}
  });
  row.add(ui.Label({value: '■', style: {
    color: color, fontSize: '13px', fontFamily: FONT,
    backgroundColor: BG, margin: '0 6px 0 0'
  }}));
  row.add(ui.Label({value: label, style: {
    fontSize: '10px', fontFamily: FONT, color: CLR.body, backgroundColor: BG
  }}));
  return row;
}

// ── Layer definitions ───────────────────────────────────────────────────────
var LAYERS = {
  'Random Forest (RF)':           {img: rf.selfMask(),  vis: {palette: [CLR.seagrass]}},
  'Support Vector Machine (SVM)': {img: svm.selfMask(), vis: {palette: [CLR.seagrass]}},
  'Consensus (RF ∩ SVM)':         {img: con.selfMask(), vis: {palette: [CLR.seagrass]}},
  'Sentinel-2 RGB':               {img: s2rgb,
    vis: {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000}}
};

var outlineImg = ee.Image().byte().paint({
  featureCollection: studyArea, color: 1, width: 2
});

// =============================================================================
//  MAP
// =============================================================================
var map = ui.Map();
map.setOptions('SATELLITE');
map.setCenter(28.35, 41.65, 10);
map.centerObject(bounds, 10);

// Study area outline — always visible
map.addLayer(outlineImg, {palette: ['#0077b6']}, 'Study Area', true, 0.8);

// Classification layers — added hidden, toggled by checkboxes
var layerIndex = {};
var idx = 1;
for (var name in LAYERS) {
  var d = LAYERS[name];
  map.addLayer(d.img, d.vis, name, false, 0.8);
  layerIndex[name] = idx;
  idx++;
}

// =============================================================================
//  PANEL
// =============================================================================
var panel = ui.Panel({style: {
  width: '340px', padding: '16px 20px', backgroundColor: BG
}});

// ── Title ───────────────────────────────────────────────────────────────────
panel.add(ui.Label({value: 'Seagrass Habitat Mapping', style: {
  fontSize: '18px', fontWeight: 'bold', fontFamily: FONT,
  color: CLR.title, backgroundColor: BG, margin: '0 0 2px 0'
}}));
panel.add(ui.Label({value: 'Western Black Sea Coast — Türkiye', style: {
  fontSize: '12px', fontFamily: FONT, color: CLR.sub,
  backgroundColor: BG, margin: '0 0 2px 0'
}}));
panel.add(ui.Label({value: 'İğneada – Karaburun  |  ~130 km', style: {
  fontSize: '10px', fontFamily: FONT, color: CLR.muted,
  backgroundColor: BG
}}));
panel.add(divider());

// ── About ───────────────────────────────────────────────────────────────────
panel.add(heading('About'));
panel.add(ui.Label({
  value: 'Seagrass (Zostera noltei, Z. marina) habitat classification from ' +
    'Sentinel-2 imagery (summer 2025) using Random Forest and SVM with ' +
    '3-fold spatial cross-validation on Google Earth Engine.',
  style: {fontSize: '11px', fontFamily: FONT, color: CLR.body,
    backgroundColor: BG, whiteSpace: 'pre-wrap'}
}));
panel.add(divider());

// ── Layer checkboxes ────────────────────────────────────────────────────────
panel.add(heading('Layers'));

function makeCheckbox(layerName, defaultOn) {
  var cb = ui.Checkbox({
    label: layerName,
    value: defaultOn,
    style: {fontFamily: FONT, fontSize: '11px', margin: '2px 0',
      backgroundColor: BG}
  });
  cb.onChange(function(checked) {
    map.layers().get(layerIndex[layerName]).setShown(checked);
  });
  if (defaultOn) {
    map.layers().get(layerIndex[layerName]).setShown(true);
  }
  return cb;
}

var cbRF  = makeCheckbox('Random Forest (RF)', true);
var cbSVM = makeCheckbox('Support Vector Machine (SVM)', false);
var cbCon = makeCheckbox('Consensus (RF ∩ SVM)', false);
var cbRGB = makeCheckbox('Sentinel-2 RGB', false);

panel.add(cbRF);
panel.add(cbSVM);
panel.add(cbCon);
panel.add(cbRGB);

panel.add(hint('Opacity'));
var opSlider = ui.Slider({
  min: 0, max: 1, value: 0.8, step: 0.05,
  style: {stretch: 'horizontal', margin: '4px 0 8px 0'}
});
opSlider.onChange(function(v) {
  for (var n in layerIndex) {
    map.layers().get(layerIndex[n]).setOpacity(v);
  }
});
panel.add(opSlider);

panel.add(legendRow(CLR.seagrass, 'Seagrass'));
panel.add(legendRow('#0077b6',    'Study Area'));
panel.add(divider());

// ── Interaction mode ────────────────────────────────────────────────────────
panel.add(heading('Interaction Mode'));
var modeSelect = ui.Select({
  items: ['Point Inspector', 'Time Series', 'Area Calculator'],
  value: 'Point Inspector',
  style: {stretch: 'horizontal', fontFamily: FONT, margin: '0 0 8px 0'}
});
panel.add(modeSelect);

// Inspector box
var inspectBox = ui.Panel({style: {
  backgroundColor: CARD, padding: '8px 10px'
}});
inspectBox.add(ui.Label({value: 'Click on the map to inspect.',
  style: {fontSize: '11px', fontFamily: FONT, color: CLR.muted,
    backgroundColor: CARD}}));
panel.add(inspectBox);

// Chart box
var chartBox = ui.Panel({style: {backgroundColor: BG}});
chartBox.add(ui.Label({value: 'Click on the map to generate a time series chart.',
  style: {fontSize: '11px', fontFamily: FONT, color: CLR.muted,
    backgroundColor: BG}}));
panel.add(chartBox);

// Area calculator box
var areaBox = ui.Panel({style: {
  backgroundColor: CARD, padding: '8px 10px'
}});
areaBox.add(ui.Label({
  value: 'Draw a shape on the map to calculate seagrass area.',
  style: {fontSize: '11px', fontFamily: FONT, color: CLR.muted,
    backgroundColor: CARD}
}));
panel.add(areaBox);

// Draw buttons
var btnRect  = ui.Button({label: '▭ Rectangle',
  style: {fontFamily: FONT, fontSize: '11px', margin: '0 4px 0 0'}});
var btnPoly  = ui.Button({label: '⬠ Polygon',
  style: {fontFamily: FONT, fontSize: '11px', margin: '0 4px 0 0'}});
var btnClear = ui.Button({label: '✕ Clear',
  style: {fontFamily: FONT, fontSize: '11px'}});

var drawBtns = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '6px 0 0 0', backgroundColor: BG}
});
drawBtns.add(btnRect);
drawBtns.add(btnPoly);
drawBtns.add(btnClear);
panel.add(drawBtns);

panel.add(divider());

// ── Results table ───────────────────────────────────────────────────────────
panel.add(heading('Key Results'));
var tbl = [
  ['Method',    'OA',    'κ',     'Area'],
  ['SVM',       '86.1%', '0.722', '3,634 ha'],
  ['RF',        '83.2%', '0.663', '3,509 ha'],
  ['Consensus', '—',     '—',     '2,991 ha']
];
tbl.forEach(function(row, i) {
  var rp = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {margin: '0', padding: '2px 0',
      backgroundColor: i === 0 ? '#f1f5f9' : BG}
  });
  var w = ['78px', '48px', '48px', '72px'];
  row.forEach(function(cell, j) {
    rp.add(ui.Label({value: cell, style: {
      fontSize: i === 0 ? '9px' : '10px', fontFamily: FONT,
      fontWeight: i === 0 ? 'bold' : 'normal',
      color: i === 0 ? CLR.muted : CLR.body,
      backgroundColor: i === 0 ? '#f1f5f9' : BG,
      width: w[j], margin: '0'
    }}));
  });
  panel.add(rp);
});
panel.add(divider());

// ── Contact ─────────────────────────────────────────────────────────────────
panel.add(heading('Contact'));
panel.add(ui.Label({value: 'Ş. Danacıoğlu', style: {
  fontSize: '11px', fontFamily: FONT, fontWeight: 'bold',
  color: CLR.title, backgroundColor: BG, margin: '0 0 2px 0'
}}));
panel.add(ui.Label({value: 'İzmir Bakırçay University — Geography', style: {
  fontSize: '10px', fontFamily: FONT, color: CLR.sub,
  backgroundColor: BG, margin: '0 0 4px 0'
}}));
panel.add(ui.Label({value: 'sdanacioglu@gmail.com', style: {
  fontSize: '10px', fontFamily: FONT, color: CLR.link,
  backgroundColor: BG, margin: '0 0 2px 0'
}}));
panel.add(ui.Label({
  value: 'GitHub: sdanacioglu/blacksea-seagrass-mapping',
  style: {fontSize: '10px', fontFamily: FONT, color: CLR.link, backgroundColor: BG},
  targetUrl: 'https://github.com/sdanacioglu/blacksea-seagrass-mapping'
}));

// =============================================================================
//  MODE SWITCHING
// =============================================================================
function updateMode(mode) {
  inspectBox.style().set('shown', mode === 'Point Inspector');
  chartBox.style().set('shown',  mode === 'Time Series');
  areaBox.style().set('shown',   mode === 'Area Calculator');
  drawBtns.style().set('shown',  mode === 'Area Calculator');

  var tools = map.drawingTools();
  tools.setShown(mode === 'Area Calculator');
  if (mode !== 'Area Calculator') tools.stop();
}
modeSelect.onChange(updateMode);
updateMode('Point Inspector');

// =============================================================================
//  POINT INSPECTOR
// =============================================================================
function doInspect(coords) {
  inspectBox.clear();
  var pt = ee.Geometry.Point([coords.lon, coords.lat]);

  inspectBox.add(ui.Label({
    value: coords.lat.toFixed(5) + ',  ' + coords.lon.toFixed(5),
    style: {fontSize: '11px', fontFamily: FONT, fontWeight: 'bold',
      color: CLR.title, backgroundColor: CARD, margin: '0 0 4px 0'}
  }));

  var lyrs = [
    {img: rf,  n: 'RF',        c: CLR.seagrass},
    {img: svm, n: 'SVM',       c: CLR.seagrass},
    {img: con, n: 'Consensus', c: CLR.seagrass}
  ];

  lyrs.forEach(function(lyr) {
    lyr.img.reduceRegion({
      reducer: ee.Reducer.first(), geometry: pt, scale: 10
    }).evaluate(function(r) {
      if (!r) return;
      var keys = Object.keys(r);
      var val  = keys.length > 0 ? r[keys[0]] : null;
      var txt  = val === 1 ? '● Seagrass'
               : val === 0 ? '○ Not seagrass'
               : '— Outside extent';
      inspectBox.add(ui.Label({value: lyr.n + ':  ' + txt, style: {
        fontSize: '11px', fontFamily: FONT,
        color: val === 1 ? lyr.c : CLR.muted,
        fontWeight: val === 1 ? 'bold' : 'normal',
        backgroundColor: CARD, margin: '1px 0'
      }}));
    });
  });
}

// =============================================================================
//  TIME SERIES
// =============================================================================
function doTimeSeries(coords) {
  chartBox.clear();
  chartBox.add(ui.Label({value: 'Loading chart…', style: {
    fontSize: '11px', fontFamily: FONT, color: CLR.muted, backgroundColor: BG
  }}));

  var pt = ee.Geometry.Point([coords.lon, coords.lat]);

  var chart = ui.Chart.image.series({
    imageCollection: s2idx,
    region: pt,
    reducer: ee.Reducer.mean(),
    scale: 10
  }).setOptions({
    title: 'NDAVI & MNDWI — ' +
      coords.lat.toFixed(4) + ', ' + coords.lon.toFixed(4),
    titleTextStyle: {fontSize: 12, fontName: FONT},
    vAxis: {title: 'Index Value',
      titleTextStyle: {fontSize: 10, fontName: FONT}},
    hAxis: {title: 'Date', format: 'MMM yy',
      titleTextStyle: {fontSize: 10, fontName: FONT}},
    lineWidth: 2,
    pointSize: 4,
    series: {
      0: {color: CLR.seagrass, labelInLegend: 'NDAVI'},
      1: {color: CLR.accent,   labelInLegend: 'MNDWI'}
    },
    interpolateNulls: true,
    legend: {position: 'bottom',
      textStyle: {fontSize: 10, fontName: FONT}}
  });

  chartBox.clear();
  chartBox.add(chart);
}

// =============================================================================
//  MAP CLICK ROUTER
// =============================================================================
function handleClick(coords) {
  var mode = modeSelect.getValue();
  if (mode === 'Point Inspector') doInspect(coords);
  else if (mode === 'Time Series') doTimeSeries(coords);
}
map.onClick(handleClick);

// =============================================================================
//  AREA CALCULATOR — DRAWING TOOLS
// =============================================================================
var dt = map.drawingTools();
dt.setShown(false);
dt.layers().reset();
dt.layers().add(ui.Map.GeometryLayer({
  geometries: [], name: 'AOI', color: CLR.accent
}));

btnRect.onClick(function() {
  dt.layers().get(0).geometries().reset();
  dt.setShape('rectangle');
  dt.draw();
});

btnPoly.onClick(function() {
  dt.layers().get(0).geometries().reset();
  dt.setShape('polygon');
  dt.draw();
});

btnClear.onClick(function() {
  dt.layers().get(0).geometries().reset();
  areaBox.clear();
  areaBox.add(ui.Label({
    value: 'Draw a shape on the map to calculate seagrass area.',
    style: {fontSize: '11px', fontFamily: FONT, color: CLR.muted,
      backgroundColor: CARD}
  }));
});

function calcArea() {
  var geomLayer = dt.layers().get(0);
  if (geomLayer.geometries().length() === 0) return;

  var geometry = geomLayer.getEeObject();
  areaBox.clear();
  areaBox.add(ui.Label({value: 'Calculating…', style: {
    fontSize: '11px', fontFamily: FONT, color: CLR.muted, backgroundColor: CARD
  }}));

  var pxArea = ee.Image.pixelArea();

  var rfA  = rf.selfMask().multiply(pxArea).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: geometry,
    scale: 10, maxPixels: 1e9}).values().get(0);
  var svmA = svm.selfMask().multiply(pxArea).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: geometry,
    scale: 10, maxPixels: 1e9}).values().get(0);
  var conA = con.selfMask().multiply(pxArea).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: geometry,
    scale: 10, maxPixels: 1e9}).values().get(0);

  var stats = ee.List([geometry.area(), rfA, svmA, conA]);

  stats.evaluate(function(vals, err) {
    areaBox.clear();
    if (err) {
      areaBox.add(ui.Label({value: 'Error — try a smaller area.',
        style: {fontSize: '11px', fontFamily: FONT, color: '#dc2626',
          backgroundColor: CARD}}));
      return;
    }

    var aoiHa = (vals[0] / 10000).toFixed(1);
    areaBox.add(ui.Label({
      value: 'Selected area: ' + aoiHa + ' ha',
      style: {fontSize: '12px', fontFamily: FONT, fontWeight: 'bold',
        color: CLR.title, backgroundColor: CARD, margin: '0 0 6px 0'}
    }));

    function areaRow(color, label, m2) {
      var ha = m2 !== null ? (m2 / 10000).toFixed(1) : '0.0';
      var rp = ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: {margin: '2px 0', backgroundColor: CARD}
      });
      rp.add(ui.Label({value: '■', style: {
        color: color, fontSize: '13px', fontFamily: FONT,
        backgroundColor: CARD, margin: '0 6px 0 0'
      }}));
      rp.add(ui.Label({value: label + ': ' + ha + ' ha', style: {
        fontSize: '11px', fontFamily: FONT, color: CLR.body,
        backgroundColor: CARD
      }}));
      return rp;
    }

    areaBox.add(areaRow(CLR.seagrass, 'RF',        vals[1]));
    areaBox.add(areaRow(CLR.seagrass, 'SVM',       vals[2]));
    areaBox.add(areaRow(CLR.seagrass, 'Consensus', vals[3]));
  });
}

dt.onDraw(ui.util.debounce(calcArea, 500));
dt.onEdit(ui.util.debounce(calcArea, 500));

// =============================================================================
//  LAYOUT
// =============================================================================
ui.root.clear();
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));
ui.root.add(panel);
ui.root.add(map);
