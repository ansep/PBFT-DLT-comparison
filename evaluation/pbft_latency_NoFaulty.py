import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import curve_fit

# Funzione esponenziale
def exponential(x, a, b, c):
    return a * np.exp(b * x) + c

# Leggi il file CSV
df = pd.read_csv('pbft_latency.csv')

# Filtra le righe con faulty_count = 0
df_no_faulty = df[df['faulty_count'] == 0]

# Calcola la media delle latenze
df_no_faulty['latency_mean'] = df_no_faulty[['latency1', 'latency2', 'latency3', 'latency4', 'latency5']].mean(axis=1)

# Calcola l'intervallo delle latenze (differenza tra max e min)
latency_min = df_no_faulty[['latency1', 'latency2', 'latency3', 'latency4', 'latency5']].min(axis=1)
latency_max = df_no_faulty[['latency1', 'latency2', 'latency3', 'latency4', 'latency5']].max(axis=1)
latency_error = [df_no_faulty['latency_mean'] - latency_min, latency_max - df_no_faulty['latency_mean']]

# Estrai i valori per il grafico
process_count = df_no_faulty['process_count']
latency_mean = df_no_faulty['latency_mean']

# Crea il grafico
plt.figure(figsize=(10, 6))
plt.errorbar(process_count, latency_mean, yerr=latency_error, fmt='o', capsize=5, label='Mean Latency')
plt.plot(process_count, latency_mean, label='Mean Latency Line')

# Fit lineare
# linear_fit = np.polyfit(process_count, latency_mean, 1)
# linear_fit_fn = np.poly1d(linear_fit)
# plt.plot(process_count, linear_fit_fn(process_count), '--', label='Linear Fit')

# Fit esponenziale
popt, _ = curve_fit(exponential, process_count, latency_mean, p0=(1, 0.1, 1))
plt.plot(process_count, exponential(process_count, *popt), '--', label='Exponential Fit')

# Aggiungi etichette e titolo
plt.xlabel('Number of Processes')
plt.ylabel('Latency (ms)')
# plt.title('Latency vs Number of Processes (No Faulty)')
plt.legend()
plt.grid(True)

# Salva il grafico come file immagine
plt.savefig('latency_vs_processes_no_faulty.pdf')

# Mostra il grafico
plt.show()