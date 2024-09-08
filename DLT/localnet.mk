# localnet.mk

localnet-start: localnet-stop build-docker-localnode
	@if ! [ -f build/node0/config/genesis.json ]; then docker run --rm -v $(CURDIR)/build:/tendermint:Z tendermint/localnode testnet --config /etc/tendermint/config-template.toml --v 5 --o .  --populate-persistent-peers --starting-ip-address 192.167.10.2; fi
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node0/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node0/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node1/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node1/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node2/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node2/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node3/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node3/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node4/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node4/config/config.toml
	docker-compose up
.PHONY: localnet-start
