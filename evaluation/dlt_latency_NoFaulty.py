import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import curve_fit

# Funzione esponenziale
def exponential(x, a, b, c):
    return a * np.exp(b * x) + c

# Leggi il file CSV
df = pd.read_csv('latency_dlt.csv')

# Calcola le latenze per ogni test
for i in range(1, 4):  # Assumiamo che ci siano al massimo 3 test per nodo
    init_col = f'test{i}_init'
    fine_col = f'test{i}_fine'
    if init_col in df.columns and fine_col in df.columns:
        df[f'latency{i}'] = (pd.to_datetime(df[fine_col]) - pd.to_datetime(df[init_col])).dt.total_seconds() * 1000

# Calcola la media delle latenze
latency_columns = [col for col in df.columns if col.startswith('latency')]
df['latency_mean'] = df[latency_columns].mean(axis=1)

# Calcola l'intervallo delle latenze (differenza tra max e min)
latency_min = df[latency_columns].min(axis=1)
latency_max = df[latency_columns].max(axis=1)
latency_error = [df['latency_mean'] - latency_min, latency_max - df['latency_mean']]

# Estrai i valori per il grafico
process_count = df['Nodes']
latency_mean = df['latency_mean']

# Crea il grafico
plt.figure(figsize=(10, 6))
plt.errorbar(process_count, latency_mean, yerr=latency_error, fmt='o', capsize=5, label='Mean Latency')
plt.plot(process_count, latency_mean, label='Mean Latency Line')

# Fit esponenziale
popt, _ = curve_fit(exponential, process_count, latency_mean, p0=(1, 0.1, 1))
plt.plot(process_count, exponential(process_count, *popt), '--', label='Exponential Fit')

# Aggiungi etichette e titolo
plt.xlabel('Number of nodes')
plt.ylabel('Latency (ms)')
plt.legend()
plt.grid(True)

# Salva il grafico come file immagine
plt.savefig('latency_vs_processes.pdf')

# Mostra il grafico
plt.show()

print(f"Equazione del fit esponenziale: y = {popt[0]:.2f} * exp({popt[1]:.4f} * x) + {popt[2]:.2f}")