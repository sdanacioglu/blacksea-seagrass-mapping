"""
Figure 4: Random Forest Variable Importance Measure (VIM) bar chart.
13 features × category-based color coding (horizontal bars).
Output: figure_4_vim.png (300 DPI)

Replace `features` and `scores` with your own RF VIM values from GEE console output.
"""
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

# RF VIM values from GEE console (sorted descending)
features = ['B1', 'SDB', 'MNDWI', 'B2', 'TB2', 'B3', 'NDAVI',
            'B5', 'WAVI', 'TB1', 'B4', 'TI', 'NDRE']
scores   = [133.11, 129.14, 122.36, 103.14, 99.81, 93.06, 90.21,
            88.47, 86.06, 83.30, 81.96, 81.08, 79.24]

# Feature categories for color coding
categories = {
    'B1':'Spectral', 'B2':'Spectral', 'B3':'Spectral', 'B4':'Spectral', 'B5':'Spectral',
    'NDAVI':'Aquatic vegetation', 'WAVI':'Aquatic vegetation', 'NDRE':'Aquatic vegetation',
    'MNDWI':'Water / mask', 'TI':'Water / mask',
    'SDB':'Bathymetry',
    'TB1':'Dimensionality reduction (PCA)', 'TB2':'Dimensionality reduction (PCA)',
}
colors_map = {
    'Spectral':                       '#2E86AB',
    'Aquatic vegetation':             '#06A77D',
    'Water / mask':                   '#5BC0EB',
    'Bathymetry':                     '#8B5A2B',
    'Dimensionality reduction (PCA)': '#8E8E8E'
}
bar_colors = [colors_map[categories[f]] for f in features]

# Plot
fig, ax = plt.subplots(figsize=(11, 7), dpi=300)
bars = ax.barh(range(len(features)), scores, color=bar_colors,
               edgecolor='black', linewidth=0.6, height=0.75)

for bar, val in zip(bars, scores):
    ax.text(val + 1.5, bar.get_y() + bar.get_height()/2,
            f'{val:.1f}', va='center', ha='left',
            fontsize=9.5, family='Cambria', fontweight='bold')

ax.set_yticks(range(len(features)))
ax.set_yticklabels(features, fontsize=11, family='Cambria')
ax.invert_yaxis()
ax.set_xlabel('Variable Importance Score (Gini decrease)',
              fontsize=11.5, family='Cambria')
ax.set_xlim(0, max(scores) * 1.13)

legend_elems = [Patch(facecolor=v, edgecolor='black', label=k)
                for k, v in colors_map.items()]
ax.legend(handles=legend_elems, loc='lower right',
          frameon=True, fontsize=9.5,
          title='Category', title_fontsize=10,
          prop={'family':'Cambria'})

ax.grid(axis='x', linestyle='--', alpha=0.4)
ax.set_axisbelow(True)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

plt.tight_layout()
plt.savefig('figure_4_vim.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 4 saved: figure_4_vim.png')
