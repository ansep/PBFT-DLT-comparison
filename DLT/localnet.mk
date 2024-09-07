# localnet.mk

localnet-start: localnet-stop build-docker-localnode
	@if ! [ -f build/node0/config/genesis.json ]; then docker run --rm -v $(CURDIR)/build:/tendermint:Z tendermint/localnode testnet --config /etc/tendermint/config-template.toml --v 5 --o .  --populate-persistent-peers --starting-ip-address 192.167.10.2; fi
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node0/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node0/config/config.toml
	sed -i 's/timeout_propose = "3s"/timeout_propose = "12s"/' build/node0/config/config.toml
	sed -i 's/timeout_propose_delta = "500ms"/timeout_propose_delta = "2000ms"/' build/node0/config/config.toml
	sed -i 's/timeout_prevote = "1s"/timeout_prevote = "4s"/' build/node0/config/config.toml
	sed -i 's/timeout_prevote_delta = "500ms"/timeout_prevote_delta = "2000ms"/' build/node0/config/config.toml
	sed -i 's/timeout_precommit = "1s"/timeout_precommit = "4s"/' build/node0/config/config.toml
	sed -i 's/timeout_precommit_delta = "500ms"/timeout_precommit_delta = "2000ms"/' build/node0/config/config.toml
	sed -i 's/timeout_commit = "1s"/timeout_commit = "4s"/' build/node0/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node1/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node1/config/config.toml
	sed -i 's/timeout_propose = "3s"/timeout_propose = "12s"/' build/node1/config/config.toml
	sed -i 's/timeout_propose_delta = "500ms"/timeout_propose_delta = "2000ms"/' build/node1/config/config.toml
	sed -i 's/timeout_prevote = "1s"/timeout_prevote = "4s"/' build/node1/config/config.toml
	sed -i 's/timeout_prevote_delta = "500ms"/timeout_prevote_delta = "2000ms"/' build/node1/config/config.toml
	sed -i 's/timeout_precommit = "1s"/timeout_precommit = "4s"/' build/node1/config/config.toml
	sed -i 's/timeout_precommit_delta = "500ms"/timeout_precommit_delta = "2000ms"/' build/node1/config/config.toml
	sed -i 's/timeout_commit = "1s"/timeout_commit = "4s"/' build/node1/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node2/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node2/config/config.toml
	sed -i 's/timeout_propose = "3s"/timeout_propose = "12s"/' build/node2/config/config.toml
	sed -i 's/timeout_propose_delta = "500ms"/timeout_propose_delta = "2000ms"/' build/node2/config/config.toml
	sed -i 's/timeout_prevote = "1s"/timeout_prevote = "4s"/' build/node2/config/config.toml
	sed -i 's/timeout_prevote_delta = "500ms"/timeout_prevote_delta = "2000ms"/' build/node2/config/config.toml
	sed -i 's/timeout_precommit = "1s"/timeout_precommit = "4s"/' build/node2/config/config.toml
	sed -i 's/timeout_precommit_delta = "500ms"/timeout_precommit_delta = "2000ms"/' build/node2/config/config.toml
	sed -i 's/timeout_commit = "1s"/timeout_commit = "4s"/' build/node2/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node3/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node3/config/config.toml
	sed -i 's/timeout_propose = "3s"/timeout_propose = "12s"/' build/node3/config/config.toml
	sed -i 's/timeout_propose_delta = "500ms"/timeout_propose_delta = "2000ms"/' build/node3/config/config.toml
	sed -i 's/timeout_prevote = "1s"/timeout_prevote = "4s"/' build/node3/config/config.toml
	sed -i 's/timeout_prevote_delta = "500ms"/timeout_prevote_delta = "2000ms"/' build/node3/config/config.toml
	sed -i 's/timeout_precommit = "1s"/timeout_precommit = "4s"/' build/node3/config/config.toml
	sed -i 's/timeout_precommit_delta = "500ms"/timeout_precommit_delta = "2000ms"/' build/node3/config/config.toml
	sed -i 's/timeout_commit = "1s"/timeout_commit = "4s"/' build/node3/config/config.toml
	sed -i 's/create_empty_blocks = true/create_empty_blocks = false/' build/node4/config/config.toml
	sed -i 's/pex = true/pex = false/' build/node4/config/config.toml
	sed -i 's/timeout_propose = "3s"/timeout_propose = "12s"/' build/node4/config/config.toml
	sed -i 's/timeout_propose_delta = "500ms"/timeout_propose_delta = "2000ms"/' build/node4/config/config.toml
	sed -i 's/timeout_prevote = "1s"/timeout_prevote = "4s"/' build/node4/config/config.toml
	sed -i 's/timeout_prevote_delta = "500ms"/timeout_prevote_delta = "2000ms"/' build/node4/config/config.toml
	sed -i 's/timeout_precommit = "1s"/timeout_precommit = "4s"/' build/node4/config/config.toml
	sed -i 's/timeout_precommit_delta = "500ms"/timeout_precommit_delta = "2000ms"/' build/node4/config/config.toml
	sed -i 's/timeout_commit = "1s"/timeout_commit = "4s"/' build/node4/config/config.toml
	docker-compose up
.PHONY: localnet-start
