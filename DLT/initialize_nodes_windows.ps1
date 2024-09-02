# Get the number of nodes from the first argument
$num_nodes = $args[0]
$chain_id = "transactionchain"

# Initialize nodes and save node IDs
$node_ids = @()
for ($i = 0; $i -lt $num_nodes; $i++) {
    docker run --rm -v "${PWD}\node${i}:/tendermint" tendermint/tendermint:latest init
    #get last output word
    $node_id = docker run --rm -v "${PWD}\node${i}:/tendermint" tendermint/tendermint:latest show_node_id | Select-Object -Last 1

    # $node_id = docker run --rm -v "${PWD}\node${i}:/tendermint" tendermint/tendermint:latest show_node_id
    $node_ids += "${node_id}@node${i}:26656"
}

for ($i = 0; $i -lt $num_nodes; $i++) {
    # Disable empty blocks creation
    (Get-Content "${PWD}\node${i}\config\config.toml") -replace 'create_empty_blocks = true', "create_empty_blocks = false" | Set-Content "node${i}\config\config.toml"
    # For each genesis file, replace the chain_id and insert the list of all validators
    (Get-Content "${PWD}\node${i}\config\genesis.json") -replace 'chain_id": ".*', "chain_id`": `"${chain_id}`"," | Set-Content "node${i}\config\genesis.json"
    # Set cache to 0 to allow repeated transactions
    # (Get-Content "${PWD}\node${i}\config\genesis.json") -replace 'cache_size": ".*"', "cache_size`": `0`," | Set-Content "node${i}\config\genesis.json"
    # (Get-Content "${PWD}\node${i}\config\genesis.json") -replace 'validators": \[', "validators`": [`n
    # Set proxy app
    (Get-Content "${PWD}\node${i}\config\config.toml") -replace 'proxy_app = "tcp://.*"', "proxy_app = `"tcp://abci${i}:26658`"" | Set-Content "node${i}\config\config.toml"
    
    # Prepare persistent_peers string without node i
    $peers_list = $node_ids -ne $node_ids[$i] -join ","
    # Set persistent_peers
    (Get-Content "${PWD}\node${i}\config\config.toml") -replace 'persistent_peers = ""', "persistent_peers = `"${peers_list}`"" | Set-Content "node${i}\config\config.toml"
}