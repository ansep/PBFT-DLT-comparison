import pandas as pd
import matplotlib.pyplot as plt

# Leggi il file CSV
df = pd.read_csv('latency_pbft.csv')

# Ottieni i valori unici di faulty_count
faulty_counts = df['faulty_count'].unique()

# Crea un istogramma per ogni valore di faulty_count
for faulty_count in faulty_counts:
    # Filtra i dati per il valore corrente di faulty_count
    df_filtered = df[df['faulty_count'] == faulty_count]
    
    # Estrai i valori per il grafico
    process_count = df_filtered['Nodes']
    latencies = df_filtered[['latency1', 'latency2', 'latency3', 'latency4', 'latency5']]
    
    # Crea il grafico
    plt.figure(figsize=(10, 6))
    
    # Plot di ogni latenza disponibile
    for i in range(1, 6):
        latency_col = f'latency{i}'
        if latency_col in df_filtered.columns:
            plt.bar(process_count + (i-3)*0.1, df_filtered[latency_col], width=0.1, label=f'Test {i}')
    
    # Aggiungi etichette e titolo
    plt.xlabel('Number of nodes')
    plt.ylabel('Latency (ms)')
    # plt.title(f'Latency Distribution vs Number of Processes (Faulty Count = {faulty_count})')
    plt.legend(loc='upper left')
    plt.grid(True)
    
    # Imposta i tick dell'asse x per mostrare tutti i valori di process_count
    plt.xticks(process_count)

    # Salva il grafico come file PDF
    plt.savefig(f'pbft_latency_distribution_faulty_count_{faulty_count}.pdf')

    # Mostra il grafico
    plt.show()