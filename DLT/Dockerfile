# Use a vanilla Ubuntu image
FROM ubuntu:22.04

# Set environment variables
ENV TENDERMINT_VERSION=v0.32.12

# Install dependencies
RUN apt-get update && \
    apt-get install -y curl build-essential git wget

# Install Go
RUN wget https://go.dev/dl/go1.20.6.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.20.6.linux-amd64.tar.gz && \
    rm go1.20.6.linux-amd64.tar.gz

# Set up Go environment
ENV PATH=$PATH:/usr/local/go/bin
ENV GOPATH=/root/go
ENV PATH=$GOPATH/bin:$PATH

# Install Tendermint
RUN git clone https://github.com/tendermint/tendermint.git
WORKDIR /tendermint
RUN git checkout $TENDERMINT_VERSION
RUN make install


ARG ID
ENV proxyApp=tcp://abci${ID}:26658

RUN echo $proxyApp

# Initialize Tendermint configuration
RUN tendermint init

# Expose Tendermint ports
EXPOSE 26656 26657

# Command to start Tendermint
CMD tendermint node --proxy_app="$proxyApp"