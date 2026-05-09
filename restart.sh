#!/bin/bash

# Raven - Restart Script
# Stops and starts servers with fast startup.
# Suppresses the browser auto-open: a restart means the user already has a
# Raven tab open and wants the same tab to refresh, not a fresh one.

./stop.sh
sleep 1
RAVEN_NO_OPEN=1 ./start-fast.sh
