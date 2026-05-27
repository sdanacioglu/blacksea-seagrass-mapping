"""
Generate Figures 9, 10, 11 and Table 5 from the spectral pixels CSV produced by
the ArcGIS pixel extraction script (code/arcgis/extract_pixels.py).

    Figure 9:  Class-wise spectral signature profile (5 spectral bands)
    Figure 10: Class-wise box plots (B1, SDB, NDAVI, NDRE)
    Figure 11: 13-feature Pearson correlation matrix
    Table 5:   Class-wise spectral statistics (CSV for Word import)

Usage:
    python figure_9_10_11_spectral.py

Replace `csv_path` with your own ArcGIS extraction output.
"""
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# ============================================================
# INPUT — replace with your CSV path
# ============================================================
csv_path = 'spectral_pixels.csv'
df = pd.read_csv(csv_path, encoding='utf-8-sig')

print(f"Loaded CSV: {len(df)} pixels")
print(df['class_name'].value_counts())

# B1-B5 scale conversion: integer (0-10000) -> reflectance (0-1)
SPEC_BANDS = ['B1', 'B2', 'B3', 'B4', 'B5']
for b in SPEC_BANDS:
    df[f'{b}_refl'] = df[b] / 10000

CLASS_ORDER = ['Seagrass', 'Sand', 'DeepWater']
CLASS_LABELS = {'Seagrass': 'Seagrass', 'Sand': 'Sand', 'DeepWater': 'Deep water'}
COLORS = {'Seagrass': '#06A77D', 'Sand': '#F5B841', 'DeepWater': '#1E3A5F'}

# ============================================================
# FIGURE 9 — SPECTRAL SIGNATURE PROFILE
# ============================================================
fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)

wavelengths = {'B1': 443, 'B2': 492, 'B3': 560, 'B4': 665, 'B5': 704}
wl_list = [wavelengths[b] for b in SPEC_BANDS]

for c in CLASS_ORDER:
    sub = df[df['class_name'] == c]
    means = np.array([sub[f'{b}_refl'].mean() for b in SPEC_BANDS])
    stds  = np.array([sub[f'{b}_refl'].std()  for b in SPEC_BANDS])

    ax.plot(wl_list, means, marker='o', label=CLASS_LABELS[c],
            color=COLORS[c], linewidth=2.2, markersize=8,
            markeredgecolor='white', markeredgewidth=0.8)
    ax.fill_between(wl_list, means - stds, means + stds,
                     color=COLORS[c], alpha=0.18)

ax.set_xlabel('Wavelength (nm)', fontsize=12, family='Cambria')
ax.set_ylabel('Surface reflectance (ρ)', fontsize=12, family='Cambria')
ax.set_xticks(wl_list)
ax.set_xticklabels([f'{wl}\n({b})' for wl, b in zip(wl_list, SPEC_BANDS)],
                    fontsize=10, family='Cambria')
for lbl in ax.get_yticklabels(): lbl.set_fontfamily('Cambria')
ax.legend(loc='upper right', frameon=True, fontsize=11,
          title='Class', title_fontsize=11, prop={'family': 'Cambria'})
ax.grid(True, linestyle='--', alpha=0.4); ax.set_axisbelow(True)
ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig('figure_9_spectral_signature.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 9 saved.')

# ============================================================
# FIGURE 10 — BOX PLOTS (4 panels)
# ============================================================
fig, axes = plt.subplots(2, 2, figsize=(12, 8.5), dpi=300)

features_box = [
    ('B1_refl', 'B1 (443 nm) reflectance', '(a) B1 — Coastal aerosol band'),
    ('SDB',     'SDB',                      '(b) SDB — Bathymetry ratio'),
    ('NDAVI',   'NDAVI',                    '(c) NDAVI — Aquatic vegetation'),
    ('NDRE',    'NDRE',                     '(d) NDRE — Red-edge'),
]

for ax, (feat, ylabel, title) in zip(axes.flatten(), features_box):
    data = [df[df['class_name'] == c][feat].values for c in CLASS_ORDER]
    bp = ax.boxplot(data, tick_labels=[CLASS_LABELS[c] for c in CLASS_ORDER],
                     patch_artist=True, widths=0.55,
                     medianprops=dict(color='black', linewidth=1.5),
                     boxprops=dict(linewidth=0.8),
                     whiskerprops=dict(linewidth=0.8),
                     flierprops=dict(marker='o', markersize=2.5,
                                     alpha=0.35, markeredgecolor='gray'))
    for patch, c in zip(bp['boxes'], CLASS_ORDER):
        patch.set_facecolor(COLORS[c]); patch.set_alpha(0.65)

    ax.set_ylabel(ylabel, fontsize=11, family='Cambria')
    ax.set_title(title, fontsize=11, family='Cambria',
                  loc='left', pad=8, fontweight='bold')
    for lbl in ax.get_xticklabels(): lbl.set_fontfamily('Cambria')
    for lbl in ax.get_yticklabels(): lbl.set_fontfamily('Cambria')
    ax.grid(axis='y', linestyle='--', alpha=0.4); ax.set_axisbelow(True)
    ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig('figure_10_box_plots.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 10 saved.')

# ============================================================
# FIGURE 11 — CORRELATION MATRIX (13 features)
# ============================================================
FEATURES_CORR = ['B1', 'B2', 'B3', 'B4', 'B5',
                 'NDAVI', 'WAVI', 'NDRE',
                 'MNDWI', 'TI',
                 'SDB', 'TB1', 'TB2']

corr = df[FEATURES_CORR].corr(method='pearson')
n = len(FEATURES_CORR)

fig, ax = plt.subplots(figsize=(10.5, 9), dpi=300)
im = ax.imshow(corr.values, cmap='RdBu_r', vmin=-1, vmax=1, aspect='equal')

for i in range(n):
    for j in range(n):
        val = corr.iloc[i, j]
        color = 'white' if abs(val) > 0.55 else 'black'
        ax.text(j, i, f'{val:.2f}', ha='center', va='center',
                fontsize=8.5, color=color, family='Cambria')

ax.set_xticks(np.arange(n)); ax.set_yticks(np.arange(n))
ax.set_xticklabels(FEATURES_CORR, fontsize=10, family='Cambria', rotation=45, ha='right')
ax.set_yticklabels(FEATURES_CORR, fontsize=10, family='Cambria', rotation=0)
ax.set_xticks(np.arange(n + 1) - 0.5, minor=True)
ax.set_yticks(np.arange(n + 1) - 0.5, minor=True)
ax.grid(which='minor', color='white', linewidth=0.6)
ax.tick_params(which='minor', length=0)

cbar = plt.colorbar(im, ax=ax, shrink=0.78, pad=0.02)
for lbl in cbar.ax.get_yticklabels(): lbl.set_fontfamily('Cambria')
cbar.set_label('Pearson correlation coefficient (r)', fontsize=10.5, family='Cambria')

plt.tight_layout()
plt.savefig('figure_11_correlation.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 11 saved.')

# ============================================================
# TABLE 5 — CLASS-WISE SPECTRAL STATISTICS
# ============================================================
stats_features = SPEC_BANDS + ['NDAVI', 'WAVI', 'NDRE', 'MNDWI', 'TI', 'SDB', 'TB1', 'TB2']

rows = []
for c in CLASS_ORDER:
    sub = df[df['class_name'] == c]
    row = {'Class': CLASS_LABELS[c], 'n (pixels)': len(sub)}
    for feat in stats_features:
        col = f'{feat}_refl' if feat in SPEC_BANDS else feat
        m = sub[col].mean(); s = sub[col].std()
        if feat in SPEC_BANDS:
            row[f'{feat} (ρ)'] = f'{m:.4f} ± {s:.4f}'
        elif feat in ['NDAVI', 'WAVI', 'NDRE', 'MNDWI', 'TI']:
            row[feat] = f'{m:.3f} ± {s:.3f}'
        elif feat == 'SDB':
            row[feat] = f'{m:.4f} ± {s:.4f}'
        else:
            row[feat] = f'{m:.1f} ± {s:.1f}'
    rows.append(row)

table5 = pd.DataFrame(rows)
table5.to_csv('table_5_class_statistics.csv', index=False, encoding='utf-8-sig')

print('\nTable 5 saved: table_5_class_statistics.csv')
print('\n=== ALL OUTPUTS READY ===')
print('  - figure_9_spectral_signature.png')
print('  - figure_10_box_plots.png')
print('  - figure_11_correlation.png')
print('  - table_5_class_statistics.csv')
