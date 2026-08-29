#!/bin/bash

# Raven - Restart Script
# Stops and starts servers with fast startup, opening a tab like a cold start.
# (RAVEN_NO_OPEN is still honoured by start.sh for headless/SSH runs.)

./stop.sh
sleep 1
./start-fast.sh
