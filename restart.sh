#!/bin/bash

# Raven - Restart Script
# Stops and starts servers with fast startup

./stop.sh
sleep 1
./start-fast.sh
